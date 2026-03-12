/**
 * KidSchedule – Notification Scheduler Engine
 *
 * Pure function engine for scheduling custody transition notifications.
 * Generates 24-hour advance alerts and same-day notifications.
 *
 * Uses CustodyEngine to determine real parent-to-parent transitions
 * from the family's custody schedule, eliminating hardcoded parent IDs.
 */

import type { Parent, ScheduleTransition } from "@/lib";

export interface ScheduledNotification {
  id: string;
  familyId: string;
  parentId: string;
  notificationType: "transition_24h" | "transition_same_day" | "transition_reminder";
  scheduledAt: string;
  deliveryMethod: "sms" | "email" | "push";
  transitionAt: string;
  fromParentId: string;
  toParentId: string;
  location?: string;
}

export interface NotificationScheduleInput {
  familyId: string;
  parents: Parent[];
  /** Transitions from CustodyEngine.getUpcomingTransitions() - source of truth */
  transitions: ScheduleTransition[];
  now: Date;
  timeZone?: string;
}

export interface NotificationScheduleResult {
  notifications: ScheduledNotification[];
  existingNotificationIds: string[];
}

interface TransitionInfo {
  familyId: string;
  transitionAt: Date;
  fromParentId: string;
  toParentId: string;
}

export class NotificationSchedulerEngine {

  /**
   * Generate scheduled notifications for upcoming custody transitions.
   * Creates 24h advance alerts and same-day notifications based on real
   * custody transitions from CustodyEngine.
   */
  scheduleNotifications(input: NotificationScheduleInput): NotificationScheduleResult {
    const { familyId, transitions, now } = input;

    // Convert ScheduleTransition[] to internal TransitionInfo[]
    const transitionInfos = transitions.map(transition => ({
      familyId,
      transitionAt: transition.at,
      fromParentId: transition.fromParent.id,
      toParentId: transition.toParent.id,
    }));

    const notifications: ScheduledNotification[] = [];

    for (const transition of transitionInfos) {
      // Create 24-hour advance notification
      const advanceNotification = this.createAdvanceNotification(transition, now);
      if (advanceNotification) {
        notifications.push(advanceNotification);
      }

      // Create same-day notification (2 hours before transition)
      const sameDayNotification = this.createSameDayNotification(transition, now);
      if (sameDayNotification) {
        notifications.push(sameDayNotification);
      }

      // Create reminder notification (15 minutes before transition)
      const reminderNotification = this.createReminderNotification(transition, now);
      if (reminderNotification) {
        notifications.push(reminderNotification);
      }
    }

    return {
      notifications,
      existingNotificationIds: [],
    };
  }

  /**
   * Create 24-hour advance notification for a transition.
   * Notifies the receiving parent 24 hours before the transition.
   */
  private createAdvanceNotification(
    transition: TransitionInfo,
    now: Date,
  ): ScheduledNotification | null {
    const advanceTime = new Date(transition.transitionAt.getTime() - 24 * 60 * 60 * 1000);

    // Only create if advance time is in the future
    if (advanceTime <= now) {
      return null;
    }

    return {
      id: this.generateNotificationId(transition, "24h"),
      familyId: transition.familyId,
      parentId: transition.toParentId, // Notify the receiving parent
      notificationType: "transition_24h",
      scheduledAt: advanceTime.toISOString(),
      deliveryMethod: "sms", // Default to SMS, can be configured per parent
      transitionAt: transition.transitionAt.toISOString(),
      fromParentId: transition.fromParentId,
      toParentId: transition.toParentId,
    };
  }

  /**
   * Create same-day notification for a transition (2 hours before).
   * Notifies the sending parent 2 hours before the transition.
   */
  private createSameDayNotification(
    transition: TransitionInfo,
    now: Date,
  ): ScheduledNotification | null {
    const sameDayTime = new Date(transition.transitionAt.getTime() - 2 * 60 * 60 * 1000);

    // Only create if same-day time is in the future
    if (sameDayTime <= now) {
      return null;
    }

    return {
      id: this.generateNotificationId(transition, "same_day"),
      familyId: transition.familyId,
      parentId: transition.fromParentId, // Notify the sending parent
      notificationType: "transition_same_day",
      scheduledAt: sameDayTime.toISOString(),
      deliveryMethod: "sms",
      transitionAt: transition.transitionAt.toISOString(),
      fromParentId: transition.fromParentId,
      toParentId: transition.toParentId,
    };
  }

  /**
   * Create reminder notification for a transition (15 minutes before).
   * Notifies the receiving parent 15 minutes before the transition.
   */
  private createReminderNotification(
    transition: TransitionInfo,
    now: Date,
  ): ScheduledNotification | null {
    const REMINDER_MINUTES_BEFORE = 15;
    const reminderTime = new Date(transition.transitionAt.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000);

    // Only create if reminder time is in the future
    if (reminderTime <= now) {
      return null;
    }

    return {
      id: this.generateNotificationId(transition, "reminder"),
      familyId: transition.familyId,
      parentId: transition.toParentId, // Notify the receiving parent
      notificationType: "transition_reminder",
      scheduledAt: reminderTime.toISOString(),
      deliveryMethod: "push", // Use push for reminders
      transitionAt: transition.transitionAt.toISOString(),
      fromParentId: transition.fromParentId,
      toParentId: transition.toParentId,
    };
  }

  /**
   * Generate a unique notification ID based on transition and type.
   */
  private generateNotificationId(transition: TransitionInfo, type: string): string {
    const timestamp = transition.transitionAt.getTime();
    return `notification_${transition.familyId}_${transition.fromParentId}_${transition.toParentId}_${timestamp}_${type}`;
  }

  /**
   * Filter out notifications that are too close to existing ones.
   */
  deduplicateNotifications(notifications: ScheduledNotification[]): ScheduledNotification[] {
    const seen = new Set<string>();
    return notifications.filter(notification => {
      const key = `${notification.familyId}_${notification.parentId}_${notification.notificationType}_${notification.scheduledAt}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Get notifications that should be sent within the next time window.
   */
  getPendingNotifications(
    notifications: ScheduledNotification[],
    now: Date,
    windowMinutes: number = 60,
  ): ScheduledNotification[] {
    const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

    return notifications.filter(notification => {
      const scheduledTime = new Date(notification.scheduledAt);
      return scheduledTime >= now && scheduledTime <= windowEnd;
    });
  }
}
