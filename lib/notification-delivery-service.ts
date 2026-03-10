/**
 * KidSchedule – Notification Delivery Service
 *
 * Handles delivery of scheduled notifications through SMS, email, and push channels.
 * Integrates with existing provider infrastructure.
 */

import { getDb } from "@/lib/persistence";
import type { Parent } from "@/lib";
import { getSmsSender } from "@/lib/providers/sms";
import { getEmailSender } from "@/lib/providers/email";

export interface NotificationDeliveryRequest {
  notificationId: string;
  parentId: string;
  notificationType: "transition_24h" | "transition_same_day" | "transition_reminder";
  deliveryMethod: "sms" | "email" | "push";
  transitionAt: string;
  fromParentName: string;
  toParentName: string;
  location?: string;
}

export interface NotificationDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class NotificationDeliveryService {
  private readonly db = getDb();
  private readonly smsProvider = getSmsSender();
  private readonly emailProvider = getEmailSender();

  /**
   * Deliver a notification to a parent.
   */
  async deliverNotification(request: NotificationDeliveryRequest): Promise<NotificationDeliveryResult> {
    try {
      // Get parent contact information
      const parent = await this.getParentById(request.parentId);
      if (!parent) {
        return {
          success: false,
          error: `Parent not found: ${request.parentId}`,
        };
      }

      // Generate notification content
      const content = this.generateNotificationContent(request);

      // Deliver based on method
      let result: NotificationDeliveryResult;

      switch (request.deliveryMethod) {
        case "sms":
          result = await this.deliverSms(parent, content);
          break;
        case "email":
          result = await this.deliverEmail(parent, content);
          break;
        case "push":
          result = await this.deliverPush();
          break;
        default:
          return {
            success: false,
            error: `Unsupported delivery method: ${request.deliveryMethod}`,
          };
      }

      // Update notification status in database
      await this.updateNotificationStatus(
        request.notificationId,
        result.success,
        result.messageId,
        result.error,
      );

      return result;
    } catch (error) {
      console.info("Notification delivery failed:", error);
      return {
        success: false,
        error: (() => {
          if (error instanceof Error) {
            return error.message;
          }
          return "Unknown error";
        })(),
      };
    }
  }

  /**
   * Generate notification content based on type.
   */
  private generateNotificationContent(request: NotificationDeliveryRequest): {
    subject?: string;
    body: string;
  } {
    const { notificationType, transitionAt, fromParentName, toParentName, location } = request;
    const transitionTime = new Date(transitionAt);
    const timeString = transitionTime.toLocaleString("en-US", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC", // Should use parent's timezone
    });

    let locationText = "";
    if (location) {
      locationText = ` at ${location}`;
    }

    switch (notificationType) {
      case "transition_24h":
        return {
          subject: "Custody Transition Reminder - Tomorrow",
          body: `Hi! This is a reminder that ${fromParentName} will be handing off custody to you tomorrow at ${timeString}${locationText}. ` +
            `Please confirm you're ready for the transition.`,
        };

      case "transition_same_day":
        return {
          subject: "Custody Handoff Today",
          body: `Hi! This is a reminder that you'll be handing off custody to ${toParentName} today at ${timeString}${locationText}. Please prepare for the transition.`,
        };

      case "transition_reminder":
        return {
          subject: "Custody Transition Starting Soon",
          body: `Hi! Custody transition to ${toParentName} starts in 15 minutes${locationText}. Please be ready!`,
        };

      default:
        return {
          body: `Custody transition notification: ${fromParentName} to ${toParentName} at ${timeString}${locationText}.`,
        };
    }
  }

  /**
   * Deliver SMS notification.
   */
  private async deliverSms(
    parent: Parent,
    content: { body: string },
  ): Promise<NotificationDeliveryResult> {
    if (!parent.phone) {
      return {
        success: false,
        error: "Parent has no phone number",
      };
    }

    try {
      const result = await this.smsProvider.send({
        to: parent.phone,
        templateId: "custody-transition-alert",
        variables: {
          message: content.body,
        },
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: (() => {
          if (error instanceof Error) {
            return error.message;
          }
          return "SMS delivery failed";
        })(),
      };
    }
  }

  /**
   * Deliver email notification.
   */
  private async deliverEmail(
    parent: Parent,
    content: { subject?: string; body: string },
  ): Promise<NotificationDeliveryResult> {
    if (!parent.email) {
      return {
        success: false,
        error: "Parent has no email address",
      };
    }

    try {
      const result = await this.emailProvider.send({
        to: parent.email,
        subject: content.subject || "Custody Transition Notification",
        templateId: "custody-transition-reminder",
        variables: {
          message: content.body,
        },
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = "Email delivery failed";
      }
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Deliver push notification.
   * Note: Push notifications require additional setup with FCM/APNs.
   */
  private async deliverPush(): Promise<NotificationDeliveryResult> {
    // Push notification delivery not yet implemented
    // This would require FCM token storage and Firebase/APNs integration
    return {
      success: false,
      error: "Push notifications not yet implemented",
    };
  }

  /**
   * Get parent by ID.
   */
  private async getParentById(parentId: string): Promise<Parent | null> {
    const parent = await this.db.parents.findById(parentId);
    if (!parent) {
      return null;
    }

    return {
      id: parent.id,
      name: parent.name,
      email: parent.email,
      avatarUrl: parent.avatarUrl ?? undefined,
      phone: parent.phone ?? undefined,
    };
  }

  /**
   * Update notification delivery status.
   */
  private async updateNotificationStatus(
    notificationId: string,
    success: boolean,
    messageId?: string,
    error?: string,
  ): Promise<void> {
    let sentAt: string | undefined;
    let deliveryStatus: "sent" | "failed";
    let errorMessage: string | undefined;

    if (success) {
      sentAt = new Date().toISOString();
      deliveryStatus = "sent";
      errorMessage = undefined;
    } else {
      sentAt = undefined;
      deliveryStatus = "failed";
      errorMessage = error;
    }

    await this.db.scheduledNotifications.update(notificationId, {
      sentAt,
      deliveryStatus,
      messageId,
      errorMessage,
    });
  }

  /**
   * Retry failed notifications.
   */
  async retryFailedNotifications(): Promise<number> {
    const FAILED_NOTIFICATION_BATCH_SIZE = 50;
    const failedNotifications = await this.db.scheduledNotifications.findFailed(FAILED_NOTIFICATION_BATCH_SIZE);

    let retryCount = 0;

    for (const notification of failedNotifications) {
      // Reset to pending for retry
      await this.db.scheduledNotifications.update(notification.id, {
        deliveryStatus: "pending",
        errorMessage: undefined,
        messageId: undefined,
      });
      retryCount++;
    }

    return retryCount;
  }
}