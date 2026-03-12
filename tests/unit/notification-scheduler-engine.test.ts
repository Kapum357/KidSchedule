/**
 * KidSchedule – Notification Scheduler Engine Tests
 *
 * Tests verify that:
 * 1. Parent IDs come from actual CustodyEngine transitions (not hardcoded)
 * 2. Notifications are created for correct parents at correct times
 * 3. Deduplication works correctly
 * 4. Pending notification filtering works correctly
 */

import { NotificationSchedulerEngine } from "@/lib/notification-scheduler-engine";
import type { Parent, ScheduleTransition } from "@/lib";

describe("NotificationSchedulerEngine", () => {
  let engine: NotificationSchedulerEngine;

  const parentA: Parent = {
    id: "parent-a-uuid",
    name: "Alice",
    email: "alice@example.com",
  };

  const parentB: Parent = {
    id: "parent-b-uuid",
    name: "Bob",
    email: "bob@example.com",
  };

  beforeEach(() => {
    engine = new NotificationSchedulerEngine();
  });

  describe("scheduleNotifications", () => {
    it("should create notifications with real parent IDs from transitions", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const transitionTime = new Date("2026-03-16T17:00:00Z"); // 24 hours + 7 hours from now

      const transitions: ScheduleTransition[] = [
        {
          at: transitionTime,
          fromParent: parentA,
          toParent: parentB,
        },
      ];

      const result = engine.scheduleNotifications({
        familyId: "family-1",
        parents: [parentA, parentB],
        transitions,
        now,
      });

      // Should create 3 notifications: 24h advance, 2h same-day, 15min reminder
      expect(result.notifications).toHaveLength(3);

      // Verify advance notification
      const advanceNotif = result.notifications.find(
        n => n.notificationType === "transition_24h"
      );
      expect(advanceNotif).toBeDefined();
      expect(advanceNotif?.parentId).toBe("parent-b-uuid"); // Receiving parent
      expect(advanceNotif?.fromParentId).toBe("parent-a-uuid"); // Real parent IDs
      expect(advanceNotif?.toParentId).toBe("parent-b-uuid");

      // Verify same-day notification
      const sameDayNotif = result.notifications.find(
        n => n.notificationType === "transition_same_day"
      );
      expect(sameDayNotif).toBeDefined();
      expect(sameDayNotif?.parentId).toBe("parent-a-uuid"); // Sending parent
      expect(sameDayNotif?.fromParentId).toBe("parent-a-uuid");
      expect(sameDayNotif?.toParentId).toBe("parent-b-uuid");

      // Verify reminder notification
      const reminderNotif = result.notifications.find(
        n => n.notificationType === "transition_reminder"
      );
      expect(reminderNotif).toBeDefined();
      expect(reminderNotif?.parentId).toBe("parent-b-uuid"); // Receiving parent
      expect(reminderNotif?.fromParentId).toBe("parent-a-uuid");
      expect(reminderNotif?.toParentId).toBe("parent-b-uuid");
    });

    it("should NOT hardcode parent1/parent2", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const transitionTime = new Date("2026-03-16T17:00:00Z");

      const transitions: ScheduleTransition[] = [
        {
          at: transitionTime,
          fromParent: parentA,
          toParent: parentB,
        },
      ];

      const result = engine.scheduleNotifications({
        familyId: "family-1",
        parents: [parentA, parentB],
        transitions,
        now,
      });

      // Verify no hardcoded parent1 or parent2 exists
      for (const notif of result.notifications) {
        expect(notif.parentId).not.toBe("parent1");
        expect(notif.parentId).not.toBe("parent2");
        expect(notif.fromParentId).not.toBe("parent1");
        expect(notif.fromParentId).not.toBe("parent2");
        expect(notif.toParentId).not.toBe("parent1");
        expect(notif.toParentId).not.toBe("parent2");
      }
    });

    it("should use actual parent UUIDs from transitions", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const transitionTime = new Date("2026-03-17T10:00:00Z");

      const customParentA: Parent = {
        id: "custom-parent-uuid-abc123",
        name: "CustomA",
        email: "custom@example.com",
      };

      const customParentB: Parent = {
        id: "custom-parent-uuid-def456",
        name: "CustomB",
        email: "customb@example.com",
      };

      const transitions: ScheduleTransition[] = [
        {
          at: transitionTime,
          fromParent: customParentA,
          toParent: customParentB,
        },
      ];

      const result = engine.scheduleNotifications({
        familyId: "family-2",
        parents: [customParentA, customParentB],
        transitions,
        now,
      });

      expect(result.notifications).toHaveLength(3);

      for (const notif of result.notifications) {
        expect([customParentA.id, customParentB.id]).toContain(notif.fromParentId);
        expect([customParentA.id, customParentB.id]).toContain(notif.toParentId);
      }
    });

    it("should not create advance notification if less than 24 hours away", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const transitionTime = new Date("2026-03-15T12:00:00Z"); // Only 2 hours away

      const transitions: ScheduleTransition[] = [
        {
          at: transitionTime,
          fromParent: parentA,
          toParent: parentB,
        },
      ];

      const result = engine.scheduleNotifications({
        familyId: "family-1",
        parents: [parentA, parentB],
        transitions,
        now,
      });

      // Should NOT have 24h advance notification
      const advanceNotif = result.notifications.find(
        n => n.notificationType === "transition_24h"
      );
      expect(advanceNotif).toBeUndefined();

      // But may have same-day or reminder
      expect(result.notifications.length).toBeGreaterThan(0);
    });

    it("should not create same-day notification if less than 2 hours away", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const transitionTime = new Date("2026-03-15T11:00:00Z"); // Only 1 hour away

      const transitions: ScheduleTransition[] = [
        {
          at: transitionTime,
          fromParent: parentA,
          toParent: parentB,
        },
      ];

      const result = engine.scheduleNotifications({
        familyId: "family-1",
        parents: [parentA, parentB],
        transitions,
        now,
      });

      // Should NOT have same-day notification
      const sameDayNotif = result.notifications.find(
        n => n.notificationType === "transition_same_day"
      );
      expect(sameDayNotif).toBeUndefined();
    });

    it("should not create reminder notification if less than 15 minutes away", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const transitionTime = new Date("2026-03-15T10:10:00Z"); // Only 10 minutes away

      const transitions: ScheduleTransition[] = [
        {
          at: transitionTime,
          fromParent: parentA,
          toParent: parentB,
        },
      ];

      const result = engine.scheduleNotifications({
        familyId: "family-1",
        parents: [parentA, parentB],
        transitions,
        now,
      });

      // Should NOT have reminder notification
      const reminderNotif = result.notifications.find(
        n => n.notificationType === "transition_reminder"
      );
      expect(reminderNotif).toBeUndefined();
    });

    it("should handle multiple transitions correctly", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const transition1 = new Date("2026-03-16T17:00:00Z");
      const transition2 = new Date("2026-03-30T17:00:00Z");

      const transitions: ScheduleTransition[] = [
        {
          at: transition1,
          fromParent: parentA,
          toParent: parentB,
        },
        {
          at: transition2,
          fromParent: parentB,
          toParent: parentA,
        },
      ];

      const result = engine.scheduleNotifications({
        familyId: "family-1",
        parents: [parentA, parentB],
        transitions,
        now,
      });

      // Should have 6 notifications (3 per transition)
      expect(result.notifications).toHaveLength(6);

      // First transition: A->B
      const firstTransitionNotifs = result.notifications.filter(
        n => n.transitionAt === transition1.toISOString()
      );
      expect(firstTransitionNotifs).toHaveLength(3);
      expect(firstTransitionNotifs[0].fromParentId).toBe(parentA.id);
      expect(firstTransitionNotifs[0].toParentId).toBe(parentB.id);

      // Second transition: B->A
      const secondTransitionNotifs = result.notifications.filter(
        n => n.transitionAt === transition2.toISOString()
      );
      expect(secondTransitionNotifs).toHaveLength(3);
      expect(secondTransitionNotifs[0].fromParentId).toBe(parentB.id);
      expect(secondTransitionNotifs[0].toParentId).toBe(parentA.id);
    });

    it("should return empty array for transitions without notifications", () => {
      const now = new Date("2026-03-15T10:00:00Z");

      const result = engine.scheduleNotifications({
        familyId: "family-1",
        parents: [parentA, parentB],
        transitions: [],
        now,
      });

      expect(result.notifications).toHaveLength(0);
      expect(result.existingNotificationIds).toHaveLength(0);
    });
  });

  describe("deduplicateNotifications", () => {
    it("should remove duplicate notifications", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const transition = new Date("2026-03-16T17:00:00Z");

      const baseNotif = {
        id: "notif-1",
        familyId: "family-1",
        parentId: parentB.id,
        notificationType: "transition_24h" as const,
        scheduledAt: "2026-03-15T17:00:00Z",
        deliveryMethod: "sms" as const,
        transitionAt: transition.toISOString(),
        fromParentId: parentA.id,
        toParentId: parentB.id,
      };

      const duplicate = { ...baseNotif, id: "notif-2" };
      const unique = {
        ...baseNotif,
        id: "notif-3",
        notificationType: "transition_same_day" as const,
      };

      const notifications = [baseNotif, duplicate, unique];
      const deduplicated = engine.deduplicateNotifications(notifications);

      // Should keep only first occurrence of each key
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].id).toBe("notif-1");
      expect(deduplicated[1].id).toBe("notif-3");
    });

    it("should preserve order of unique notifications", () => {
      const notifications = [
        {
          id: "notif-1",
          familyId: "family-1",
          parentId: parentA.id,
          notificationType: "transition_24h" as const,
          scheduledAt: "2026-03-15T17:00:00Z",
          deliveryMethod: "sms" as const,
          transitionAt: "2026-03-16T17:00:00Z",
          fromParentId: parentA.id,
          toParentId: parentB.id,
        },
        {
          id: "notif-2",
          familyId: "family-1",
          parentId: parentB.id,
          notificationType: "transition_same_day" as const,
          scheduledAt: "2026-03-16T15:00:00Z",
          deliveryMethod: "sms" as const,
          transitionAt: "2026-03-16T17:00:00Z",
          fromParentId: parentA.id,
          toParentId: parentB.id,
        },
      ];

      const deduplicated = engine.deduplicateNotifications(notifications);

      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].id).toBe("notif-1");
      expect(deduplicated[1].id).toBe("notif-2");
    });
  });

  describe("getPendingNotifications", () => {
    it("should return notifications within time window", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const windowMinutes = 60;

      const notifications = [
        {
          id: "notif-1",
          familyId: "family-1",
          parentId: parentA.id,
          notificationType: "transition_24h" as const,
          scheduledAt: "2026-03-15T10:30:00Z", // Within window (30 min)
          deliveryMethod: "sms" as const,
          transitionAt: "2026-03-16T17:00:00Z",
          fromParentId: parentA.id,
          toParentId: parentB.id,
        },
        {
          id: "notif-2",
          familyId: "family-1",
          parentId: parentB.id,
          notificationType: "transition_same_day" as const,
          scheduledAt: "2026-03-15T11:00:00Z", // Within window (60 min, at boundary)
          deliveryMethod: "sms" as const,
          transitionAt: "2026-03-16T17:00:00Z",
          fromParentId: parentA.id,
          toParentId: parentB.id,
        },
        {
          id: "notif-3",
          familyId: "family-1",
          parentId: parentB.id,
          notificationType: "transition_reminder" as const,
          scheduledAt: "2026-03-15T11:01:00Z", // Outside window (61 min)
          deliveryMethod: "push" as const,
          transitionAt: "2026-03-16T17:00:00Z",
          fromParentId: parentA.id,
          toParentId: parentB.id,
        },
      ];

      const pending = engine.getPendingNotifications(notifications, now, windowMinutes);

      expect(pending).toHaveLength(2);
      expect(pending[0].id).toBe("notif-1");
      expect(pending[1].id).toBe("notif-2");
    });

    it("should not return past notifications", () => {
      const now = new Date("2026-03-15T10:00:00Z");

      const notifications = [
        {
          id: "notif-1",
          familyId: "family-1",
          parentId: parentA.id,
          notificationType: "transition_24h" as const,
          scheduledAt: "2026-03-15T09:00:00Z", // In the past
          deliveryMethod: "sms" as const,
          transitionAt: "2026-03-16T17:00:00Z",
          fromParentId: parentA.id,
          toParentId: parentB.id,
        },
      ];

      const pending = engine.getPendingNotifications(notifications, now, 60);

      expect(pending).toHaveLength(0);
    });

    it("should handle custom window sizes", () => {
      const now = new Date("2026-03-15T10:00:00Z");

      const notifications = [
        {
          id: "notif-1",
          familyId: "family-1",
          parentId: parentA.id,
          notificationType: "transition_24h" as const,
          scheduledAt: "2026-03-15T10:01:00Z", // 1 minute from now
          deliveryMethod: "sms" as const,
          transitionAt: "2026-03-16T17:00:00Z",
          fromParentId: parentA.id,
          toParentId: parentB.id,
        },
        {
          id: "notif-2",
          familyId: "family-1",
          parentId: parentB.id,
          notificationType: "transition_same_day" as const,
          scheduledAt: "2026-03-15T10:35:00Z", // 35 minutes from now
          deliveryMethod: "sms" as const,
          transitionAt: "2026-03-16T17:00:00Z",
          fromParentId: parentA.id,
          toParentId: parentB.id,
        },
      ];

      // Small window (30 minutes)
      const pending30 = engine.getPendingNotifications(notifications, now, 30);
      expect(pending30).toHaveLength(1);
      expect(pending30[0].id).toBe("notif-1");

      // Larger window (60 minutes)
      const pending60 = engine.getPendingNotifications(notifications, now, 60);
      expect(pending60).toHaveLength(2);
    });
  });

  describe("notification IDs", () => {
    it("should generate unique notification IDs based on transition details", () => {
      const now = new Date("2026-03-15T10:00:00Z");
      const transition1 = new Date("2026-03-16T17:00:00Z");
      const transition2 = new Date("2026-03-20T17:00:00Z");

      const transitions: ScheduleTransition[] = [
        {
          at: transition1,
          fromParent: parentA,
          toParent: parentB,
        },
        {
          at: transition2,
          fromParent: parentB,
          toParent: parentA,
        },
      ];

      const result = engine.scheduleNotifications({
        familyId: "family-1",
        parents: [parentA, parentB],
        transitions,
        now,
      });

      const notifIds = result.notifications.map(n => n.id);
      const uniqueIds = new Set(notifIds);

      // All notification IDs should be unique
      expect(uniqueIds.size).toBe(notifIds.length);

      // IDs should contain family and parent info
      for (const id of notifIds) {
        expect(id).toContain("notification_");
        expect(id).toContain("family-1");
        expect([parentA.id, parentB.id].some(pid => id.includes(pid))).toBe(true);
      }
    });
  });
});
