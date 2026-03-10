/**
 * KidSchedule – Notification Scheduler Engine
 *
 * Pure function engine for scheduling custody transition notifications.
 * Generates 24-hour advance alerts and same-day notifications.
 */

import type { Parent, CalendarEvent } from "@/lib";

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
  calendarEvents: CalendarEvent[];
  now: Date;
  timeZone?: string;
}

export interface NotificationScheduleResult {
  notifications: ScheduledNotification[];
  existingNotificationIds: string[];
}

export interface TransitionInfo {
  familyId: string;
  startTime: string;
  fromParentId: string;
  toParentId: string;
  location?: string;
}

export class NotificationSchedulerEngine {

  /**
   * Generate scheduled notifications for upcoming custody transitions.
   * Creates 24h advance alerts and same-day notifications.
   */
  scheduleNotifications(input: NotificationScheduleInput): NotificationScheduleResult {
    const { familyId, calendarEvents, now } = input;

    // Find upcoming transitions from calendar events
    const upcomingTransitions = this.findTransitionsFromCalendarEvents(calendarEvents, now, familyId);

    const notifications: ScheduledNotification[] = [];
    const existingNotificationIds: string[] = [];

    for (const transition of upcomingTransitions) {
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
      existingNotificationIds,
    };
  }

  /**
   * Find transitions from calendar events.
   * This is a simplified implementation - in a real system, this would
   * analyze the custody schedule to identify actual transitions.
   */
  private findTransitionsFromCalendarEvents(
    calendarEvents: CalendarEvent[],
    now: Date,
    familyId: string,
  ): TransitionInfo[] {
    const transitions: TransitionInfo[] = [];
    const futureEvents = calendarEvents
      .filter(event => new Date(event.startAt) > now)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .slice(0, 10); // Next 10 events

    // For now, create mock transitions from events
    // In a real implementation, this would analyze the custody schedule
    for (const event of futureEvents) {
      if (event.category === "custody") {
        transitions.push({
          familyId,
          startTime: event.startAt,
          fromParentId: "parent1", // Would be determined from schedule
          toParentId: event.parentId || "parent2", // Would be determined from schedule
          location: event.location,
        });
      }
    }

    return transitions;
  }

  /**
   * Create 24-hour advance notification for a transition.
   */
  private createAdvanceNotification(
    transition: TransitionInfo,
    now: Date,
  ): ScheduledNotification | null {
    const transitionTime = new Date(transition.startTime);
    const advanceTime = new Date(transitionTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours before

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
      transitionAt: transitionTime.toISOString(),
      fromParentId: transition.fromParentId,
      toParentId: transition.toParentId,
      location: transition.location,
    };
  }

  /**
   * Create same-day notification for a transition (2 hours before).
   */
  private createSameDayNotification(
    transition: TransitionInfo,
    now: Date,
  ): ScheduledNotification | null {
    const transitionTime = new Date(transition.startTime);
    const sameDayTime = new Date(transitionTime.getTime() - 2 * 60 * 60 * 1000); // 2 hours before

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
      transitionAt: transitionTime.toISOString(),
      fromParentId: transition.fromParentId,
      toParentId: transition.toParentId,
      location: transition.location,
    };
  }

  /**
   * Create reminder notification for a transition (15 minutes before).
   */
  private createReminderNotification(
    transition: TransitionInfo,
    now: Date,
  ): ScheduledNotification | null {
    const transitionTime = new Date(transition.startTime);
    const REMINDER_MINUTES_BEFORE = 15;
    const reminderTime = new Date(transitionTime.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000); // 15 minutes before

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
      transitionAt: transitionTime.toISOString(),
      fromParentId: transition.fromParentId,
      toParentId: transition.toParentId,
      location: transition.location,
    };
  }

  /**
   * Generate a unique notification ID based on transition and type.
   */
  private generateNotificationId(transition: TransitionInfo, type: string): string {
    const timestamp = new Date(transition.startTime).getTime();
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