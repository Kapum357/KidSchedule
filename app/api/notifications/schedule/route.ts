/* eslint complexity: ["off"] */
/**
 * KidSchedule – Notification API
 *
 * REST API endpoints for managing scheduled notifications.
 * Handles scheduling, delivery, and status updates.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/persistence";
import { NotificationSchedulerEngine } from "@/lib/notification-scheduler-engine";
import { CustodyEngine } from "@/lib/custody-engine";
import type { CustodySchedule, ScheduleBlock } from "@/lib";
import {
  getAuthenticatedUser,
  userBelongsToFamily,
  badRequest,
  unauthorized,
  forbidden,
  internalError,
  parseJson,
  generateRequestId,
} from "../../calendar/utils";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

const db = getDb();
const scheduler = new NotificationSchedulerEngine();

// ─── GET /api/notifications/schedule ──────────────────────────────────────────

/**
 * Schedule notifications for a family.
 * POST /api/notifications/schedule
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();
  const route = "/api/notifications/schedule";

  try {
    // Authenticate user
    const auth = await getAuthenticatedUser();
    if (!auth) {
      logEvent("warn", "Schedule notifications: unauthenticated request", { requestId });
      observeApiRequest({ route, method: "POST", status: 401, durationMs: Date.now() - startedAt });
      return unauthorized("unauthenticated", "Authentication required");
    }

    // Parse request body
    const parseResult = await parseJson<{ familyId: string; lookAheadHours?: number }>(request);
    if (!parseResult.success) {
      logEvent("warn", "Schedule notifications: invalid JSON", { requestId, error: parseResult.error });
      observeApiRequest({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
      return badRequest("invalid_json", parseResult.error);
    }

    const { familyId, lookAheadHours = 48 } = parseResult.data;
    const MAX_LOOK_AHEAD = 168;

    // Validate input
    if (!familyId || typeof familyId !== "string") {
      logEvent("warn", "Schedule notifications: missing familyId", { requestId });
      observeApiRequest({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
      return badRequest("invalid_input", "familyId is required and must be a string");
    }

    if (lookAheadHours < 1 || lookAheadHours > MAX_LOOK_AHEAD) {
      logEvent("warn", "Schedule notifications: invalid lookAheadHours", { requestId, lookAheadHours });
      observeApiRequest({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
      return badRequest("invalid_input", `lookAheadHours must be between 1 and ${MAX_LOOK_AHEAD}`);
    }

    // Verify user has access to this family
    const hasAccess = await userBelongsToFamily(auth.userId, familyId);
    if (!hasAccess) {
      logEvent("warn", "Schedule notifications: unauthorized family access", { requestId, userId: auth.userId, familyId });
      observeApiRequest({ route, method: "POST", status: 403, durationMs: Date.now() - startedAt });
      return forbidden("forbidden", "Access denied");
    }

    // Get family data for scheduling
    const family = await db.families.findById(familyId);
    if (!family) {
      logEvent("warn", "Schedule notifications: family not found", { requestId, familyId });
      observeApiRequest({ route, method: "POST", status: 404, durationMs: Date.now() - startedAt });
      return NextResponse.json(
        { error: "not_found", message: "Family not found" },
        { status: 404 },
      );
    }

    const parents = await db.parents.findByFamilyId(familyId);
    if (!parents || parents.length < 2) {
      logEvent("warn", "Schedule notifications: insufficient parents", { requestId, familyId, parentCount: parents?.length });
      observeApiRequest({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
      return NextResponse.json(
        { error: "invalid_family_setup", message: "Family must have at least 2 parents" },
        { status: 400 },
      );
    }

    // Get active custody schedule
    const dbSchedule = await db.custodySchedules.findActiveByFamilyId(familyId);
    if (!dbSchedule) {
      logEvent("warn", "Schedule notifications: no active custody schedule", { requestId, familyId });
      observeApiRequest({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
      return NextResponse.json(
        { error: "missing_custody_schedule", message: "No active custody schedule found" },
        { status: 400 },
      );
    }

    // Parse custody schedule blocks from JSON
    let blocks: ScheduleBlock[];
    try {
      blocks = JSON.parse(dbSchedule.blocks);
    } catch (error) {
      logEvent("error", "Schedule notifications: failed to parse custody schedule", { requestId, familyId, error: error instanceof Error ? error.message : "unknown" });
      observeApiRequest({ route, method: "POST", status: 500, durationMs: Date.now() - startedAt });
      return NextResponse.json(
        { error: "invalid_schedule_format", message: "Invalid custody schedule format" },
        { status: 500 },
      );
    }

    // Build Family object for CustodyEngine
    const schedule: CustodySchedule = {
      id: dbSchedule.id,
      name: dbSchedule.name,
      blocks,
      transitionHour: dbSchedule.transitionHour,
    };

    // Convert DbParent to Parent interface (extract only needed fields)
    const parentsForEngine = parents.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      avatarUrl: p.avatarUrl,
    }));

    const familyForEngine = {
      id: family.id,
      parents: parentsForEngine as [typeof parentsForEngine[0], typeof parentsForEngine[0]],
      children: [],
      custodyAnchorDate: family.custodyAnchorDate,
      schedule,
    };

    // Use CustodyEngine to get real transitions
    const custodyEngine = new CustodyEngine(familyForEngine);
    const now = new Date();
    const lookAheadMs = lookAheadHours * 60 * 60 * 1000;
    const lookaheadEnd = new Date(now.getTime() + lookAheadMs);

    // Get upcoming transitions from the custody schedule
    const transitions = custodyEngine.getTransitionsInRange(now, lookaheadEnd);

    // Schedule notifications using real custody transitions
    const result = scheduler.scheduleNotifications({
      familyId,
      parents: parentsForEngine,
      transitions,
      now,
      timeZone: ((family as unknown) as { timeZone?: string }).timeZone || "UTC",
    });

    // Deduplicate notifications
    const deduplicated = scheduler.deduplicateNotifications(result.notifications);

    // Save notifications to database with deduplication check
    const savedNotifications = [];
    const skippedNotifications = [];

    for (const notification of deduplicated) {
      try {
        // Check if notification already exists (dedup check)
        const existing = await db.scheduledNotifications.findExisting(
          notification.transitionAt,
          notification.parentId,
          notification.notificationType
        );

        if (existing) {
          logEvent("debug", "Schedule notifications: skipping duplicate notification", {
            requestId,
            familyId,
            notificationId: existing.id,
            transitionAt: notification.transitionAt,
            parentId: notification.parentId,
            type: notification.notificationType,
          });
          skippedNotifications.push(existing.id);
          continue;
        }

        const saved = await db.scheduledNotifications.create({
          familyId: notification.familyId,
          parentId: notification.parentId,
          notificationType: notification.notificationType,
          scheduledAt: notification.scheduledAt,
          deliveryMethod: notification.deliveryMethod,
          deliveryStatus: "pending",
          transitionAt: notification.transitionAt,
          fromParentId: notification.fromParentId,
          toParentId: notification.toParentId,
          location: notification.location,
          retryCount: 0,
        });
        savedNotifications.push(saved);
      } catch (error) {
        // Handle unique constraint violations (duplicates from race conditions)
        const isUniqueViolation =
          error instanceof Error &&
          ((error as unknown) as Record<string, unknown>).code === "23505";

        if (isUniqueViolation) {
          logEvent("debug", "Schedule notifications: duplicate prevented by database constraint", {
            requestId,
            familyId,
            notificationType: notification.notificationType,
            transitionAt: notification.transitionAt,
          });
          skippedNotifications.push("constraint-prevented-duplicate");
        } else {
          const errorMsg = error instanceof Error ? error.message : "unknown";
          logEvent("warn", "Schedule notifications: failed to save notification", {
            requestId,
            familyId,
            error: errorMsg,
          });
        }
      }
    }

    logEvent("info", "Notifications scheduled", {
      requestId,
      familyId,
      userId: auth.userId,
      scheduled: savedNotifications.length,
      skipped: skippedNotifications.length,
    });
    observeApiRequest({ route, method: "POST", status: 200, durationMs: Date.now() - startedAt });

    return NextResponse.json({
      success: true,
      scheduled: savedNotifications.length,
      skipped: skippedNotifications.length,
      notifications: savedNotifications,
    });

  } catch (error) {
    logEvent("error", "Schedule notifications error", { requestId, error: error instanceof Error ? error.message : "unknown" });
    observeApiRequest({ route, method: "POST", status: 500, durationMs: Date.now() - startedAt });
    return NextResponse.json(
      { error: "internal_server_error", message: "Failed to schedule notifications" },
      { status: 500 },
    );
  }
}

// ─── GET /api/notifications/pending ───────────────────────────────────────────

/**
 * Get pending notifications ready for delivery for the authenticated user's family.
 * GET /api/notifications/pending?window=60
 *
 * Query Parameters:
 * - window: Time window in minutes to look ahead (default: 60, max: 1440)
 *
 * Returns only notifications for the authenticated user's family.
 * Requires authentication.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();
  const route = "/api/notifications/pending";

  try {
    // Authenticate user - return 401 if not authenticated
    const auth = await getAuthenticatedUser();
    if (!auth) {
      logEvent("warn", "Get pending notifications: unauthenticated request", { requestId });
      observeApiRequest({ route, method: "GET", status: 401, durationMs: Date.now() - startedAt });
      return unauthorized("unauthenticated", "Authentication required");
    }

    // Get user's family
    const parent = await db.parents.findByUserId(auth.userId);
    if (!parent) {
      logEvent("warn", "Get pending notifications: parent profile not found", { requestId, userId: auth.userId });
      observeApiRequest({ route, method: "GET", status: 403, durationMs: Date.now() - startedAt });
      return forbidden("parent_not_found", "Parent profile not found");
    }

    // Parse and validate window parameter BEFORE applying Math.min()
    const url = new URL(request.url);
    const windowParam = url.searchParams.get("window") || "60";
    const windowMinutes = parseInt(windowParam, 10);

    if (isNaN(windowMinutes) || windowMinutes < 1) {
      logEvent("warn", "Get pending notifications: invalid window parameter", { requestId, windowParam });
      observeApiRequest({ route, method: "GET", status: 400, durationMs: Date.now() - startedAt });
      return badRequest("invalid_input", "window must be a positive integer");
    }

    // Cap window at maximum (1440 minutes = 24 hours)
    const cappedWindowMinutes = Math.min(windowMinutes, 1440);

    // Get all pending notifications for this family within the time window
    const allNotifications = await db.scheduledNotifications.findByFamilyId(parent.familyId);

    // Parse dates with error handling
    let now: Date;
    let windowEnd: Date;
    try {
      now = new Date();
      windowEnd = new Date(now.getTime() + cappedWindowMinutes * 60 * 1000);
    } catch (error) {
      logEvent("error", "Get pending notifications: date parsing error", { requestId, error: error instanceof Error ? error.message : "unknown" });
      observeApiRequest({ route, method: "GET", status: 500, durationMs: Date.now() - startedAt });
      return internalError("date_error", "Failed to parse notification times");
    }

    // Filter for pending notifications within the time window
    const pendingNotifications = allNotifications.filter(n => {
      try {
        const scheduledAt = new Date(n.scheduledAt);
        return (
          n.deliveryStatus === "pending" &&
          scheduledAt >= now &&
          scheduledAt <= windowEnd
        );
      } catch (error) {
        logEvent("warn", "Get pending notifications: failed to parse notification date", { requestId, notificationId: n.id, error: error instanceof Error ? error.message : "unknown" });
        return false;
      }
    });

    logEvent("info", "Pending notifications retrieved", { requestId, userId: auth.userId, familyId: parent.familyId, count: pendingNotifications.length });
    observeApiRequest({ route, method: "GET", status: 200, durationMs: Date.now() - startedAt });

    return NextResponse.json({
      success: true,
      notifications: pendingNotifications,
    });

  } catch (error) {
    logEvent("error", "Get pending notifications error", { requestId, error: error instanceof Error ? error.message : "unknown" });
    observeApiRequest({ route, method: "GET", status: 500, durationMs: Date.now() - startedAt });
    return internalError("internal_server_error", "Failed to get pending notifications");
  }
}