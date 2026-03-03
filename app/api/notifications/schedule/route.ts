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
import {
  getAuthenticatedUser,
  userBelongsToFamily,
  badRequest,
  unauthorized,
  forbidden,
  internalError,
  parseJson,
} from "../../calendar/utils";

const db = getDb();
const scheduler = new NotificationSchedulerEngine();
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

    // Validate input
    if (!familyId || typeof familyId !== "string") {
      return badRequest("invalid_input", "familyId is required and must be a string");
    }

    if (lookAheadHours < 1 || lookAheadHours > 168) {
      return badRequest("invalid_input", "lookAheadHours must be between 1 and 168");
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
        { status: 404 }
      );
    }

    const parents = await db.parents.findByFamilyId(familyId);
    const calendarEvents = await db.calendarEvents.findByFamilyId(familyId);

    // Schedule notifications
    const result = scheduler.scheduleNotifications({
      familyId,
      parents,
      calendarEvents: calendarEvents.map(event => ({
        ...event,
        category: event.category as any, // TODO: Fix type
        confirmationStatus: event.confirmationStatus as any, // TODO: Fix type
      })),
      now: new Date(),
      timeZone: (family as any).timeZone || "UTC",
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
        console.warn("Failed to save notification:", error);
      }
    }

    return NextResponse.json({
      success: true,
      scheduled: savedNotifications.length,
      notifications: savedNotifications,
    });

  } catch (error) {
    console.error("Schedule notifications error:", error);
    return NextResponse.json(
      { error: "Failed to schedule notifications" },
      { status: 500 }
    );
  }
}

// ─── GET /api/notifications/pending ───────────────────────────────────────────

/**
 * Get pending notifications ready for delivery.
 * GET /api/notifications/pending
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user (admin/system access)
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return unauthorized("Authentication required");
    }

    const url = new URL(request.url);
    const windowMinutes = parseInt(url.searchParams.get("window") || "60");

    // Get all pending notifications
    const pendingNotifications = await db.scheduledNotifications.findPendingByTimeRange(
      new Date().toISOString(),
      new Date(Date.now() + windowMinutes * 60 * 1000).toISOString(),
      100
    );

    return NextResponse.json({
      success: true,
      notifications: pendingNotifications,
    });

  } catch (error) {
    console.error("Get pending notifications error:", error);
    return internalError("Failed to get pending notifications");
  }
}