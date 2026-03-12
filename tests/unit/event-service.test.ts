/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Unit Tests for Calendar Event Service
 *
 * Tests validation, conflict detection, and business logic
 * without database or HTTP dependencies.
 */

import {
  validateCreateEventInput,
  validateUpdateEventInput,
  detectEventConflict,
} from "@/lib/calendar/event-service";

describe("Calendar Event Service", () => {
  describe("validateCreateEventInput", () => {
    it("should accept valid event input", () => {
      const result = validateCreateEventInput({
        familyId: "fam_123",
        title: "School Assembly",
        category: "school",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        createdBy: "user_123",
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should require title", () => {
      const result = validateCreateEventInput({
        familyId: "fam_123",
        title: "",
        category: "school",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        createdBy: "user_123",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Title"))).toBe(true);
    });

    it("should reject invalid category", () => {
      const result = validateCreateEventInput({
        familyId: "fam_123",
        title: "Event",
        category: "invalid" as any,
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        createdBy: "user_123",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Category"))).toBe(true);
    });

    it("should reject end date before start date", () => {
      const result = validateCreateEventInput({
        familyId: "fam_123",
        title: "Event",
        category: "school",
        startAt: "2024-10-15T11:00:00Z",
        endAt: "2024-10-15T10:00:00Z",
        allDay: false,
        createdBy: "user_123",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("endAt must be after"))).toBe(true);
    });

    it("should reject invalid ISO dates", () => {
      const result = validateCreateEventInput({
        familyId: "fam_123",
        title: "Event",
        category: "school",
        startAt: "not-a-date",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        createdBy: "user_123",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("startAt"))).toBe(true);
    });

    it("should warn for events exceeding one year", () => {
      const result = validateCreateEventInput({
        familyId: "fam_123",
        title: "Long Event",
        category: "holiday",
        startAt: "2024-01-01T00:00:00Z",
        endAt: "2026-01-01T23:59:59Z",
        allDay: true,
        createdBy: "user_123",
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("one year"))).toBe(true);
    });

    it("should reject title exceeding 255 characters", () => {
      const result = validateCreateEventInput({
        familyId: "fam_123",
        title: "a".repeat(256),
        category: "school",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        createdBy: "user_123",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("255"))).toBe(true);
    });

    it("should reject description exceeding 2000 characters", () => {
      const result = validateCreateEventInput({
        familyId: "fam_123",
        title: "Event",
        description: "a".repeat(2001),
        category: "school",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        createdBy: "user_123",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Description"))).toBe(true);
    });

    it("should allow optional fields", () => {
      const result = validateCreateEventInput({
        familyId: "fam_123",
        title: "Event",
        category: "school",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        createdBy: "user_123",
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("validateUpdateEventInput", () => {
    it("should accept empty update (no-op)", () => {
      const result = validateUpdateEventInput({});

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate partial updates", () => {
      const result = validateUpdateEventInput({
        title: "New Title",
      });

      expect(result.valid).toBe(true);
    });

    it("should reject invalid fields in update", () => {
      const result = validateUpdateEventInput({
        category: "invalid" as any,
      });

      expect(result.valid).toBe(false);
    });
  });

  describe("detectEventConflict", () => {
    it("should detect overlapping events for same parent", () => {
      const event1 = {
        id: "evt_1",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const event2 = {
        id: "evt_2",
        startAt: "2024-10-15T10:30:00Z",
        endAt: "2024-10-15T11:30:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const conflict = detectEventConflict(event1, event2);

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictType).toBe("overlap");
      expect(conflict?.eventId).toBe("evt_1");
      expect(conflict?.conflictingEventId).toBe("evt_2");
    });

    it("should not detect conflicts for different parents", () => {
      const event1 = {
        id: "evt_1",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const event2 = {
        id: "evt_2",
        startAt: "2024-10-15T10:30:00Z",
        endAt: "2024-10-15T11:30:00Z",
        allDay: false,
        parentId: "parent_2",
      };

      const conflict = detectEventConflict(event1, event2);

      expect(conflict).toBeNull();
    });

    it("should detect buffer window violations", () => {
      const event1 = {
        id: "evt_1",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T10:30:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const event2 = {
        id: "evt_2",
        startAt: "2024-10-15T10:35:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const conflict = detectEventConflict(event1, event2, 15); // 15-min buffer

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictType).toBe("buffer");
    });

    it("should not detect conflicts outside buffer", () => {
      const event1 = {
        id: "evt_1",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T10:30:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const event2 = {
        id: "evt_2",
        startAt: "2024-10-15T10:50:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const conflict = detectEventConflict(event1, event2, 15); // 15-min buffer

      expect(conflict).toBeNull();
    });

    it("should handle same-time events", () => {
      const event1 = {
        id: "evt_1",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const event2 = {
        id: "evt_2",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const conflict = detectEventConflict(event1, event2);

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictType).toBe("overlap");
    });

    it("should handle all-day events", () => {
      const event1 = {
        id: "evt_1",
        startAt: "2024-10-15T00:00:00Z",
        endAt: "2024-10-16T00:00:00Z",
        allDay: true,
        parentId: "parent_1",
      };

      const event2 = {
        id: "evt_2",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
        parentId: "parent_1",
      };

      const conflict = detectEventConflict(event1, event2);

      expect(conflict).not.toBeNull();
    });

    it("should handle events without parent ID", () => {
      const event1 = {
        id: "evt_1",
        startAt: "2024-10-15T10:00:00Z",
        endAt: "2024-10-15T11:00:00Z",
        allDay: false,
      };

      const event2 = {
        id: "evt_2",
        startAt: "2024-10-15T10:30:00Z",
        endAt: "2024-10-15T11:30:00Z",
        allDay: false,
      };

      // Events without parent IDs should be treated as potentially conflicting
      const conflict = detectEventConflict(event1, event2);

      expect(conflict).not.toBeNull();
    });
  });
});
