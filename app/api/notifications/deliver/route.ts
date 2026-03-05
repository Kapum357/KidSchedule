/**
 * KidSchedule – Notification Delivery API
 *
 * API endpoint for delivering scheduled notifications.
 * Processes pending notifications and sends them via SMS/email/push.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/persistence";
import { NotificationDeliveryService } from "@/lib/notification-delivery-service";
import {
  getAuthenticatedUser,
  badRequest,
  unauthorized,
  internalError,
  parseJson,
} from "../../calendar/utils";

const db = getDb();
const deliveryService = new NotificationDeliveryService();

// ─── POST /api/notifications/deliver ──────────────────────────────────────────

/**
 * Deliver pending notifications.
 * POST /api/notifications/deliver
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return unauthorized("Authentication required");
    }

    // Parse request body
    const parseResult = await parseJson<{
      notificationIds?: string[];
      windowMinutes?: number;
      maxDeliveries?: number;
    }>(request);
    if (!parseResult.success) {
      return badRequest("invalid_json", parseResult.error);
    }

    const {
      notificationIds,
      windowMinutes = 60,
      maxDeliveries = 50
    } = parseResult.data;

    // Validate input
    if (windowMinutes < 1 || windowMinutes > 1440) {
      return badRequest("invalid_input", "windowMinutes must be between 1 and 1440");
    }

    if (maxDeliveries < 1 || maxDeliveries > 100) {
      return badRequest("invalid_input", "maxDeliveries must be between 1 and 100");
    }

    let notificationsToDeliver;

    if (notificationIds && notificationIds.length > 0) {
      // Deliver specific notifications
      notificationsToDeliver = [];
      for (const id of notificationIds) {
        const notification = await db.scheduledNotifications.findById(id);
        if (notification && notification.deliveryStatus === "pending") {
          notificationsToDeliver.push(notification);
        }
      }
    } else {
      // Get pending notifications within time window
      const now = new Date();
      const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

      notificationsToDeliver = await db.scheduledNotifications.findPendingByTimeRange(
        now.toISOString(),
        windowEnd.toISOString(),
        maxDeliveries
      );
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Deliver each notification
    for (const notification of notificationsToDeliver) {
      try {
        // Get parent information for delivery
        const fromParent = await db.parents.findById(notification.fromParentId);
        const toParent = await db.parents.findById(notification.toParentId);

        if (!fromParent || !toParent) {
          results.push({
            notificationId: notification.id,
            success: false,
            error: "Parent information not found",
          });
          failureCount++;
          continue;
        }

        // Deliver notification
        const deliveryResult = await deliveryService.deliverNotification({
          notificationId: notification.id,
          parentId: notification.parentId,
          notificationType: notification.notificationType,
          deliveryMethod: notification.deliveryMethod,
          transitionAt: notification.transitionAt,
          fromParentName: fromParent.name,
          toParentName: toParent.name,
          location: notification.location,
        });

        results.push({
          notificationId: notification.id,
          success: deliveryResult.success,
          messageId: deliveryResult.messageId,
          error: deliveryResult.error,
        });

        if (deliveryResult.success) {
          successCount++;
        } else {
          failureCount++;
        }

      } catch (error) {
        console.error(`Failed to deliver notification ${notification.id}:`, error);
        results.push({
          notificationId: notification.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        failureCount++;
      }
    }

    return NextResponse.json({
      success: true,
      delivered: successCount,
      failed: failureCount,
      total: notificationsToDeliver.length,
      results,
    });

  } catch (error) {
    console.error("Deliver notifications error:", error);
    return NextResponse.json(
      { error: "Failed to deliver notifications" },
      { status: 500 }
    );
  }
}

// ─── POST /api/notifications/retry ───────────────────────────────────────────

/**
 * Retry failed notifications.
 * POST /api/notifications/retry
 */
export async function PUT() {
  try {
    // Authenticate user
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return unauthorized("Authentication required");
    }

    // Retry failed notifications
    const retryCount = await deliveryService.retryFailedNotifications();

    return NextResponse.json({
      success: true,
      retried: retryCount,
    });

  } catch (error) {
    console.error("Retry notifications error:", error);
    return internalError("Failed to retry notifications");
  }
}