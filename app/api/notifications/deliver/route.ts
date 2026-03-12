/**
 * KidSchedule – Notification Delivery API
 *
 * API endpoint for delivering scheduled notifications.
 * Processes pending notifications and sends them via SMS/email/push.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, withTransaction, createPostgresUnitOfWork } from "@/lib/persistence";
import type { DbScheduledNotification } from "@/lib/persistence";
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

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    if (notificationIds && notificationIds.length > 0) {
      // Deliver specific notifications (backward compatibility, no locking)
      const notificationsToDeliver = [];
      for (const id of notificationIds) {
        const notification = await db.scheduledNotifications.findById(id);
        if (notification && notification.deliveryStatus === "pending") {
          notificationsToDeliver.push(notification);
        }
      }

      // Deliver each notification
      for (const notification of notificationsToDeliver) {
        const result = await deliverSingleNotification(notification);
        results.push(result.result);
        if (result.result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }
    } else {
      // Get pending notifications within time window using transaction with row-level locking
      const now = new Date();
      const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

      try {
        await withTransaction(async (tx) => {
          const txDb = createPostgresUnitOfWork(tx);

          // Use FOR UPDATE SKIP LOCKED to prevent concurrent delivery attempts
          const notificationsToDeliver =
            await txDb.scheduledNotifications.findPendingByTimeRangeForDelivery(
              now.toISOString(),
              windowEnd.toISOString(),
              maxDeliveries
            );

          // Deliver each notification
          for (const notification of notificationsToDeliver) {
            const result = await deliverSingleNotification(notification);
            results.push(result.result);
            if (result.result.success) {
              successCount++;
            } else {
              failureCount++;
            }
          }
        });
      } catch (error) {
        console.error("Transaction error during delivery:", error);
        return NextResponse.json(
          { error: "Failed to deliver notifications due to transaction error" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      delivered: successCount,
      failed: failureCount,
      total: results.length,
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

/**
 * Helper function to deliver a single notification.
 * This function handles the actual delivery logic without transaction management.
 */
interface DeliveryResult {
  notificationId: string;
  success: boolean;
  error?: string;
  messageId?: string;
}

async function deliverSingleNotification(notification: DbScheduledNotification): Promise<{ result: DeliveryResult }> {
  const result: DeliveryResult = {
    notificationId: notification.id,
    success: false,
    error: undefined,
    messageId: undefined,
  };

  try {
    // Get parent information for delivery
    const fromParent = await db.parents.findById(notification.fromParentId);
    const toParent = await db.parents.findById(notification.toParentId);

    if (!fromParent || !toParent) {
      result.error = "Parent information not found";
      return { result };
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

    result.success = deliveryResult.success;
    result.messageId = deliveryResult.messageId;
    result.error = deliveryResult.error;
  } catch (error) {
    console.error(`Failed to deliver notification ${notification.id}:`, error);
    result.error = error instanceof Error ? error.message : "Unknown error";
  }

  return { result };
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