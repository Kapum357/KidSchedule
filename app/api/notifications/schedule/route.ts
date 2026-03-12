/* eslint complexity: ["off"] */
/**
 * KidSchedule – Notification API
 *
 * REST API endpoints for managing scheduled notifications.
 * Handles scheduling, delivery, and status updates.
 */


import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/persistence";
import { NotificationSchedulerEngine } from "@/lib/notification-scheduler-engine";
import { NotificationDeliveryService } from "@/lib/notification-delivery-service";
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
  isValidEventCategory,
  isValidConfirmationStatus,
} from "../../calendar/utils";

const db = getDb();
const scheduler = new NotificationSchedulerEngine();
// keeping instance for future use; eslint disabled to avoid unused variable warning
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deliveryService = new NotificationDeliveryService();

// ─── GET /api/notifications/schedule ──────────────────────────────────────────

/**
 * Schedule notifications for a family.
 * POST /api/notifications/schedule
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return unauthorized("Authentication required");
    }

    // Parse request body
    const parseResult = await parseJson<{ familyId: string; lookAheadHours?: number }>(request);
    if (!parseResult.success) {
      return badRequest("invalid_json", parseResult.error);
    }

    const { familyId, lookAheadHours = 48 } = parseResult.data;
    const MAX_LOOK_AHEAD = 168;

    // Validate input
    if (!familyId || typeof familyId !== "string") {
      return badRequest("invalid_input", "familyId is required and must be a string");
    }

    if (lookAheadHours < 1 || lookAheadHours > MAX_LOOK_AHEAD) {
      return badRequest("invalid_input", `lookAheadHours must be between 1 and ${MAX_LOOK_AHEAD}`);
    }

    // Verify user has access to this family
    const hasAccess = await userBelongsToFamily(auth.userId, familyId);
    if (!hasAccess) {
      return forbidden("Access denied");
    }

    // Get family data for scheduling
    const family = await db.families.findById(familyId);
    if (!family) {
      return NextResponse.json(
        { error: "Family not found" },
        { status: 404 },
      );
    }

    const parents = await db.parents.findByFamilyId(familyId);
    if (!parents || parents.length < 2) {
      return NextResponse.json(
        { error: "Family must have at least 2 parents" },
        { status: 400 },
      );
    }

    // Get active custody schedule
    const dbSchedule = await db.custodySchedules.findActiveByFamilyId(familyId);
    if (!dbSchedule) {
      return NextResponse.json(
        { error: "No active custody schedule found" },
        { status: 400 },
      );
    }

    // Parse custody schedule blocks from JSON
    let blocks: ScheduleBlock[];
    try {
      blocks = JSON.parse(dbSchedule.blocks);
    } catch (error) {
      console.error("Failed to parse custody schedule blocks:", error);
      return NextResponse.json(
        { error: "Invalid custody schedule format" },
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

    // Save notifications to database
    const savedNotifications = [];
    for (const notification of deduplicated) {
      try {
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
        });
        savedNotifications.push(saved);
      } catch (error) {
        // Skip duplicates or handle errors
        console.info("Failed to save notification:", error);
      }
    }

    return NextResponse.json({
      success: true,
      scheduled: savedNotifications.length,
      notifications: savedNotifications,
    });

  } catch (error) {
    console.info("Schedule notifications error:", error);
    return NextResponse.json(
      { error: "Failed to schedule notifications" },
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
export async function GET(request: NextRequest) {
  try {
    // Authenticate user - return 401 if not authenticated
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return unauthorized("Authentication required");
    }

    // Get user's family
    const parent = await db.parents.findByUserId(auth.userId);
    if (!parent) {
      return forbidden("Parent profile not found");
    }

    const url = new URL(request.url);
    const windowMinutes = Math.min(
      parseInt(url.searchParams.get("window") || "60"),
      1440 // Maximum 24 hours
    );

    // Validate window parameter
    if (windowMinutes < 1 || isNaN(windowMinutes)) {
      return badRequest("invalid_input", "window must be a positive integer");
    }

    // Get all pending notifications for this family within the time window
    const allNotifications = await db.scheduledNotifications.findByFamilyId(parent.familyId);

    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

    // Filter for pending notifications within the time window
    const pendingNotifications = allNotifications.filter(n => {
      const scheduledAt = new Date(n.scheduledAt);
      return (
        n.deliveryStatus === "pending" &&
        scheduledAt >= now &&
        scheduledAt <= windowEnd
      );
    });

    return NextResponse.json({
      success: true,
      notifications: pendingNotifications,
    });

  } catch (error) {
    console.info("Get pending notifications error:", error);
    return internalError("Failed to get pending notifications");
  }
}