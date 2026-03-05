import { ScheduleOverrideEngine } from "@/lib/schedule-override-engine";
import type { ScheduleEvent, ScheduleOverride, Family, Parent } from "@/types";

describe("ScheduleOverrideEngine", () => {
  const mockFamily: Family = {
    id: "family-1",
    parents: [
      { id: "parent-1", name: "Parent A", email: "a@example.com" },
      { id: "parent-2", name: "Parent B", email: "b@example.com" },
    ],
    children: [],
    custodyAnchorDate: "2024-01-01",
    schedule: {
      id: "schedule-1",
      name: "Test Schedule",
      blocks: [],
      transitionHour: 17,
    },
  };

  const baseEvents: ScheduleEvent[] = [
    {
      family_id: "family-1",
      child_id: "child-1",
      parent_id: "parent-1",
      start_at: "2024-03-01T00:00:00.000Z",
      end_at: "2024-03-02T00:00:00.000Z",
      source_pattern: "SEVEN_SEVEN",
      cycle_id: "cycle-1",
      custody_type: "base" as const,
    },
    {
      family_id: "family-1",
      child_id: "child-1",
      parent_id: "parent-2",
      start_at: "2024-03-02T00:00:00.000Z",
      end_at: "2024-03-03T00:00:00.000Z",
      source_pattern: "SEVEN_SEVEN",
      cycle_id: "cycle-1",
      custody_type: "base" as const,
    },
  ];

  describe("applyOverrides", () => {
    it("should return base events when no overrides exist", () => {
      const result = ScheduleOverrideEngine.applyOverrides(baseEvents, []);
      expect(result).toEqual(baseEvents);
    });

    it("should apply holiday override correctly", () => {
      const overrides: ScheduleOverride[] = [
        {
          id: "override-1",
          familyId: "family-1",
          type: "holiday",
          title: "Test Holiday",
          effectiveStart: "2024-03-01T00:00:00.000Z",
          effectiveEnd: "2024-03-02T00:00:00.000Z",
          custodianParentId: "parent-2",
          priority: 20,
          status: "active",
          createdAt: "2024-01-01T00:00:00.000Z",
          createdBy: "parent-1",
        },
      ];

      const result = ScheduleOverrideEngine.applyOverrides(baseEvents, overrides);

      // First event should be overridden to parent-2
      expect(result[0].parent_id).toBe("parent-2");
      expect(result[0].override_id).toBe("override-1");
      expect(result[0].source_pattern).toBe("override-holiday");

      // Second event should remain unchanged
      expect(result[1].parent_id).toBe("parent-2");
      expect(result[1].override_id).toBeUndefined();
    });

    it("should apply swap override correctly", () => {
      const overrides: ScheduleOverride[] = [
        {
          id: "swap-1",
          familyId: "family-1",
          type: "swap",
          title: "Test Swap",
          effectiveStart: "2024-03-01T00:00:00.000Z",
          effectiveEnd: "2024-03-02T00:00:00.000Z",
          custodianParentId: "parent-2",
          priority: 15,
          status: "active",
          createdAt: "2024-01-01T00:00:00.000Z",
          createdBy: "parent-1",
        },
      ];

      const result = ScheduleOverrideEngine.applyOverrides(baseEvents, overrides);

      // First event should be overridden
      expect(result[0].parent_id).toBe("parent-2");
      expect(result[0].override_id).toBe("swap-1");
    });

    it("should respect priority order", () => {
      const overrides: ScheduleOverride[] = [
        {
          id: "low-priority",
          familyId: "family-1",
          type: "manual",
          title: "Low Priority",
          effectiveStart: "2024-03-01T00:00:00.000Z",
          effectiveEnd: "2024-03-02T00:00:00.000Z",
          custodianParentId: "parent-2",
          priority: 5,
          status: "active",
          createdAt: "2024-01-01T00:00:00.000Z",
          createdBy: "parent-1",
        },
        {
          id: "high-priority",
          familyId: "family-1",
          type: "mediation",
          title: "High Priority",
          effectiveStart: "2024-03-01T00:00:00.000Z",
          effectiveEnd: "2024-03-02T00:00:00.000Z",
          custodianParentId: "parent-1",
          priority: 50,
          status: "active",
          createdAt: "2024-01-01T00:00:00.000Z",
          createdBy: "parent-1",
        },
      ];

      const result = ScheduleOverrideEngine.applyOverrides(baseEvents, overrides);

      // High priority override should win
      expect(result[0].parent_id).toBe("parent-1");
      expect(result[0].override_id).toBe("high-priority");
    });

    it("should only apply active overrides", () => {
      const overrides: ScheduleOverride[] = [
        {
          id: "inactive",
          familyId: "family-1",
          type: "manual",
          title: "Inactive Override",
          effectiveStart: "2024-03-01T00:00:00.000Z",
          effectiveEnd: "2024-03-02T00:00:00.000Z",
          custodianParentId: "parent-2",
          priority: 10,
          status: "cancelled",
          createdAt: "2024-01-01T00:00:00.000Z",
          createdBy: "parent-1",
        },
      ];

      const result = ScheduleOverrideEngine.applyOverrides(baseEvents, overrides);

      // Should remain unchanged since override is not active
      expect(result[0].parent_id).toBe("parent-1");
      expect(result[0].override_id).toBeUndefined();
    });
  });

  describe("detectConflicts", () => {
    it("should detect no conflicts with valid overrides", () => {
      const overrides: ScheduleOverride[] = [
        {
          id: "override-1",
          familyId: "family-1",
          type: "holiday",
          title: "Test Holiday",
          effectiveStart: "2024-03-01T00:00:00.000Z",
          effectiveEnd: "2024-03-02T00:00:00.000Z",
          custodianParentId: "parent-2",
          priority: 20,
          status: "active",
          createdAt: "2024-01-01T00:00:00.000Z",
          createdBy: "parent-1",
        },
      ];

      const analysis = ScheduleOverrideEngine.detectConflicts(baseEvents, overrides);
      expect(analysis.hasBlockingConflicts).toBe(false);
      expect(analysis.conflicts).toHaveLength(0);
    });

    it("should detect overlapping active overrides", () => {
      const overrides: ScheduleOverride[] = [
        {
          id: "override-1",
          familyId: "family-1",
          type: "holiday",
          title: "Test Holiday 1",
          effectiveStart: "2024-03-01T00:00:00.000Z",
          effectiveEnd: "2024-03-02T00:00:00.000Z",
          custodianParentId: "parent-2",
          priority: 20,
          status: "active",
          createdAt: "2024-01-01T00:00:00.000Z",
          createdBy: "parent-1",
        },
        {
          id: "override-2",
          familyId: "family-1",
          type: "manual",
          title: "Test Manual",
          effectiveStart: "2024-03-01T12:00:00.000Z",
          effectiveEnd: "2024-03-01T18:00:00.000Z",
          custodianParentId: "parent-1",
          priority: 10,
          status: "active",
          createdAt: "2024-01-01T00:00:00.000Z",
          createdBy: "parent-1",
        },
      ];

      const analysis = ScheduleOverrideEngine.detectConflicts(baseEvents, overrides);
      expect(analysis.hasBlockingConflicts).toBe(true);
      expect(analysis.conflicts).toHaveLength(1);
      expect(analysis.conflicts[0].severity).toBe("error");
    });
  });

  describe("createHolidayOverrides", () => {
    it("should create holiday overrides for enabled rules", () => {
      const holidays = [
        {
          id: "holiday-1",
          name: "Test Holiday",
          date: "2024-03-01",
          type: "federal" as const,
          jurisdiction: "US",
        },
      ];

      const rules = [
        {
          familyId: "family-1",
          holidayId: "holiday-1",
          custodianParentId: "parent-2",
          isEnabled: true,
        },
      ];

      const overrides = ScheduleOverrideEngine.createHolidayOverrides(
        holidays,
        rules,
        "2024-01-01",
        "2024-12-31",
        mockFamily
      );

      expect(overrides).toHaveLength(1);
      expect(overrides[0].type).toBe("holiday");
      expect(overrides[0].custodianParentId).toBe("parent-2");
      expect(overrides[0].effectiveStart).toBe("2024-03-01T00:00:00.000Z");
      expect(overrides[0].effectiveEnd).toBe("2024-03-01T23:59:59.999Z");
    });

    it("should not create overrides for disabled rules", () => {
      const holidays = [
        {
          id: "holiday-1",
          name: "Test Holiday",
          date: "2024-03-01",
          type: "federal" as const,
          jurisdiction: "US",
        },
      ];

      const rules = [
        {
          familyId: "family-1",
          holidayId: "holiday-1",
          custodianParentId: "parent-2",
          isEnabled: false,
        },
      ];

      const overrides = ScheduleOverrideEngine.createHolidayOverrides(
        holidays,
        rules,
        "2024-01-01",
        "2024-12-31",
        mockFamily
      );

      expect(overrides).toHaveLength(0);
    });
  });

  describe("createSwapOverrides", () => {
    it("should create overrides for accepted change requests", () => {
      const requests = [
        {
          id: "request-1",
          familyId: "family-1",
          requestedBy: "parent-1",
          title: "Test Swap",
          status: "accepted" as const,
          givingUpPeriodStart: "2024-03-01T00:00:00.000Z",
          givingUpPeriodEnd: "2024-03-02T00:00:00.000Z",
          requestedMakeUpStart: "2024-03-08T00:00:00.000Z",
          requestedMakeUpEnd: "2024-03-09T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
          respondedAt: "2024-01-02T00:00:00.000Z",
        },
      ];

      const overrides = ScheduleOverrideEngine.createSwapOverrides(requests, mockFamily);

      expect(overrides).toHaveLength(1);
      expect(overrides[0].type).toBe("swap");
      expect(overrides[0].custodianParentId).toBe("parent-2"); // Other parent
      expect(overrides[0].effectiveStart).toBe("2024-03-01T00:00:00.000Z");
      expect(overrides[0].effectiveEnd).toBe("2024-03-02T00:00:00.000Z");
    });

    it("should not create overrides for pending requests", () => {
      const requests = [
        {
          id: "request-1",
          familyId: "family-1",
          requestedBy: "parent-1",
          title: "Test Swap",
          status: "pending" as const,
          givingUpPeriodStart: "2024-03-01T00:00:00.000Z",
          givingUpPeriodEnd: "2024-03-02T00:00:00.000Z",
          requestedMakeUpStart: "2024-03-08T00:00:00.000Z",
          requestedMakeUpEnd: "2024-03-09T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];

      const overrides = ScheduleOverrideEngine.createSwapOverrides(requests, mockFamily);
      expect(overrides).toHaveLength(0);
    });
  });
});