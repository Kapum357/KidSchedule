/**
 * Holiday Override Generator Unit Tests
 *
 * Tests for the generateAndPersistHolidayOverrides function - converting approved
 * holiday exception rules into schedule overrides and persisting them to the database.
 */

import { generateAndPersistHolidayOverrides } from "../schedule-override-generator";
import { getDb } from "@/lib/persistence";
import { ScheduleOverrideEngine } from "@/lib/schedule-override-engine";
import { logEvent } from "@/lib/observability/logger";
import type { DbHolidayExceptionRule, DbHolidayDefinition, DbScheduleOverride, DbFamily } from "@/lib/persistence";

// Mock the repository methods
jest.mock("@/lib/persistence", () => ({
  ...jest.requireActual("@/lib/persistence"),
  getDb: jest.fn(),
}));

jest.mock("@/lib/schedule-override-engine", () => ({
  ScheduleOverrideEngine: {
    createHolidayOverrides: jest.fn(),
  },
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

describe("generateAndPersistHolidayOverrides", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns empty array when no approved rules exist", async () => {
    const mockDb = {
      holidayExceptionRules: {
        findByFamilyId: jest.fn().mockResolvedValue([]),
      },
      holidays: {
        findByDateRange: jest.fn(),
      },
      families: {
        findById: jest.fn(),
      },
      parents: {
        findByFamilyId: jest.fn(),
      },
      scheduleOverrides: {
        create: jest.fn(),
      },
    };

    (getDb as jest.Mock).mockReturnValue(mockDb);

    const result = await generateAndPersistHolidayOverrides("family-123", "2026-07-01", "2026-07-31");

    expect(result).toEqual([]);
    expect(mockDb.scheduleOverrides.create).not.toHaveBeenCalled();
  });

  test("fetches approved rules, holiday definitions, and persists overrides", async () => {
    // Mock approved rule
    const approvedRule: Omit<DbHolidayExceptionRule, "id" | "createdAt" | "updatedAt"> & { id: string } = {
      id: "rule-1",
      familyId: "family-123",
      holidayId: "holiday-july4",
      custodianParentId: "parent-a",
      approvalStatus: "approved",
      isEnabled: true,
      proposedBy: "parent-a",
      proposedAt: "2026-01-01T00:00:00Z",
      confirmedBy: "parent-b",
      confirmedAt: "2026-01-02T00:00:00Z",
      changeLog: [],
    };

    // Mock holiday definition
    const holiday: Omit<DbHolidayDefinition, "id" | "createdAt"> & { id: string } = {
      id: "holiday-july4",
      name: "Independence Day",
      date: "2026-07-04",
      type: "federal",
      jurisdiction: "US",
    };

    // Mock family
    const family: Omit<DbFamily, "createdAt" | "updatedAt"> & { id: string } = {
      id: "family-123",
      name: "Smith Family",
      custodyAnchorDate: "2026-01-01",
      scheduleId: "schedule-123",
    };

    // Mock parents
    const mockParents = [
      { id: "parent-a", name: "Parent A", email: "parent-a@example.com", familyId: "family-123", userId: "user-a" },
      { id: "parent-b", name: "Parent B", email: "parent-b@example.com", familyId: "family-123", userId: "user-b" },
    ];

    // Mock override from engine - this is what ScheduleOverrideEngine.createHolidayOverrides returns
    const engineOverride = {
      id: "holiday-holiday-july4-family-123",
      familyId: "family-123",
      type: "holiday" as const,
      title: "Independence Day Exception",
      description: "Holiday exception for Independence Day",
      effectiveStart: "2026-07-04T00:00:00.000Z",
      effectiveEnd: "2026-07-04T23:59:59.999Z",
      custodianParentId: "parent-a",
      sourceEventId: "holiday-july4",
      priority: 20,
      status: "active" as const,
      createdBy: "parent-a",
      createdAt: expect.any(String),
    };

    // Mock persisted override - what comes back from database
    const persistedOverride: DbScheduleOverride = {
      id: "override-1",
      familyId: "family-123",
      type: "holiday",
      overrideType: "holiday",
      title: "Independence Day Exception",
      description: "Holiday exception for Independence Day",
      effectiveStart: "2026-07-04T00:00:00.000Z",
      effectiveEnd: "2026-07-04T23:59:59.999Z",
      custodianParentId: "parent-a",
      sourceEventId: "holiday-july4",
      priority: 20,
      status: "active",
      createdAt: "2026-01-01T00:00:00Z",
      createdBy: "parent-a",
    };

    const mockDb = {
      holidayExceptionRules: {
        findByFamilyId: jest.fn().mockResolvedValue([approvedRule]),
      },
      holidays: {
        findByDateRange: jest.fn().mockResolvedValue([holiday]),
      },
      families: {
        findById: jest.fn().mockResolvedValue(family),
      },
      parents: {
        findByFamilyId: jest.fn().mockResolvedValue(mockParents),
      },
      scheduleOverrides: {
        create: jest.fn().mockResolvedValue(persistedOverride),
      },
    };

    (getDb as jest.Mock).mockReturnValue(mockDb);
    (ScheduleOverrideEngine.createHolidayOverrides as jest.Mock).mockReturnValue([engineOverride]);

    const result = await generateAndPersistHolidayOverrides("family-123", "2026-07-01", "2026-07-31");

    // Expect transformed ScheduleOverride (from DbScheduleOverride)
    expect(result).toEqual([
      expect.objectContaining({
        id: "override-1",
        familyId: "family-123",
        type: "holiday",
        title: "Independence Day Exception",
        effectiveStart: "2026-07-04T00:00:00.000Z",
        effectiveEnd: "2026-07-04T23:59:59.999Z",
        custodianParentId: "parent-a",
        priority: 20,
        status: "active",
        createdBy: "parent-a",
      }),
    ]);

    // Verify engine was called with proper Family object
    expect(ScheduleOverrideEngine.createHolidayOverrides).toHaveBeenCalledWith(
      [holiday],
      expect.arrayContaining([expect.objectContaining({
        familyId: "family-123",
        holidayId: "holiday-july4",
        custodianParentId: "parent-a",
        isEnabled: true,
      })]),
      "2026-07-01",
      "2026-07-31",
      expect.objectContaining({
        id: "family-123",
        parents: expect.arrayContaining([
          expect.objectContaining({ id: "parent-a" }),
          expect.objectContaining({ id: "parent-b" }),
        ]),
      })
    );

    // Verify create() was called once per override
    expect(mockDb.scheduleOverrides.create).toHaveBeenCalledTimes(1);
    expect(mockDb.scheduleOverrides.create).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: "family-123",
        overrideType: "holiday",
        title: "Independence Day Exception",
        effectiveStart: "2026-07-04T00:00:00.000Z",
        effectiveEnd: "2026-07-04T23:59:59.999Z",
        custodianParentId: "parent-a",
        priority: 20,
        status: "active",
        createdBy: "parent-a",
      })
    );
  });

  test("filters to only approved and enabled rules", async () => {
    const approvedRule: Omit<DbHolidayExceptionRule, "id" | "createdAt" | "updatedAt"> & { id: string } = {
      id: "rule-1",
      familyId: "family-123",
      holidayId: "holiday-1",
      custodianParentId: "parent-a",
      approvalStatus: "approved",
      isEnabled: true,
      proposedBy: "parent-a",
      proposedAt: "2026-01-01T00:00:00Z",
      changeLog: [],
    };

    const disabledRule: Omit<DbHolidayExceptionRule, "id" | "createdAt" | "updatedAt"> & { id: string } = {
      id: "rule-2",
      familyId: "family-123",
      holidayId: "holiday-2",
      custodianParentId: "parent-a",
      approvalStatus: "approved",
      isEnabled: false,
      proposedBy: "parent-a",
      proposedAt: "2026-01-01T00:00:00Z",
      changeLog: [],
    };

    const pendingRule: Omit<DbHolidayExceptionRule, "id" | "createdAt" | "updatedAt"> & { id: string } = {
      id: "rule-3",
      familyId: "family-123",
      holidayId: "holiday-3",
      custodianParentId: "parent-a",
      approvalStatus: "pending",
      isEnabled: true,
      proposedBy: "parent-a",
      proposedAt: "2026-01-01T00:00:00Z",
      changeLog: [],
    };

    const family: Omit<DbFamily, "createdAt" | "updatedAt"> & { id: string } = {
      id: "family-123",
      name: "Smith Family",
      custodyAnchorDate: "2026-01-01",
      scheduleId: "schedule-123",
    };

    const mockParents = [
      { id: "parent-a", name: "Parent A", email: "parent-a@example.com", familyId: "family-123", userId: "user-a" },
      { id: "parent-b", name: "Parent B", email: "parent-b@example.com", familyId: "family-123", userId: "user-b" },
    ];

    const mockDb = {
      holidayExceptionRules: {
        findByFamilyId: jest.fn().mockResolvedValue([approvedRule, disabledRule, pendingRule]),
      },
      holidays: {
        findByDateRange: jest.fn().mockResolvedValue([]),
      },
      families: {
        findById: jest.fn().mockResolvedValue(family),
      },
      parents: {
        findByFamilyId: jest.fn().mockResolvedValue(mockParents),
      },
      scheduleOverrides: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    (getDb as jest.Mock).mockReturnValue(mockDb);
    (ScheduleOverrideEngine.createHolidayOverrides as jest.Mock).mockReturnValue([]);

    await generateAndPersistHolidayOverrides("family-123", "2026-07-01", "2026-07-31");

    // Should only process the approved+enabled rule
    // Verify disabled rule (rule-2) is NOT included
    expect(ScheduleOverrideEngine.createHolidayOverrides).toHaveBeenCalledWith(
      [],
      expect.arrayContaining([
        expect.objectContaining({
          familyId: "family-123",
          holidayId: "holiday-1",
          custodianParentId: "parent-a",
          isEnabled: true,
        }),
      ]),
      "2026-07-01",
      "2026-07-31",
      expect.objectContaining({
        id: "family-123",
        parents: expect.arrayContaining([
          expect.objectContaining({ id: "parent-a" }),
          expect.objectContaining({ id: "parent-b" }),
        ]),
      })
    );

    // Verify that disabled and pending rules were NOT passed to engine
    const callArgs = (ScheduleOverrideEngine.createHolidayOverrides as jest.Mock).mock.calls[0];
    const passedRules = callArgs[1];
    expect(passedRules).toHaveLength(1);
    expect(passedRules[0].holidayId).toBe("holiday-1");
  });

  test("logs error and returns in-memory overrides if persistence fails", async () => {
    const approvedRule: Omit<DbHolidayExceptionRule, "id" | "createdAt" | "updatedAt"> & { id: string } = {
      id: "rule-1",
      familyId: "family-123",
      holidayId: "holiday-1",
      custodianParentId: "parent-a",
      approvalStatus: "approved",
      isEnabled: true,
      proposedBy: "parent-a",
      proposedAt: "2026-01-01T00:00:00Z",
      changeLog: [],
    };

    const holiday: Omit<DbHolidayDefinition, "id" | "createdAt"> & { id: string } = {
      id: "holiday-1",
      name: "Test Holiday",
      date: "2026-07-04",
      type: "federal",
      jurisdiction: "US",
    };

    const family: Omit<DbFamily, "createdAt" | "updatedAt"> & { id: string } = {
      id: "family-123",
      name: "Smith Family",
      custodyAnchorDate: "2026-01-01",
      scheduleId: "schedule-123",
    };

    // This is the in-memory override that will be returned on persistence failure
    const mockOverride = {
      familyId: "family-123",
      type: "holiday",
      title: "Test Holiday Exception",
      description: undefined,
      effectiveStart: "2026-07-04T00:00:00Z",
      effectiveEnd: "2026-07-04T23:59:59Z",
      custodianParentId: "parent-a",
      sourceEventId: undefined,
      priority: 20,
      status: "active",
      createdBy: "parent-a",
      notes: undefined,
    };

    const mockParents = [
      { id: "parent-a", name: "Parent A", email: "parent-a@example.com", familyId: "family-123", userId: "user-a" },
      { id: "parent-b", name: "Parent B", email: "parent-b@example.com", familyId: "family-123", userId: "user-b" },
    ];

    const dbError = new Error("DB error");
    const mockDb = {
      holidayExceptionRules: {
        findByFamilyId: jest.fn().mockResolvedValue([approvedRule]),
      },
      holidays: {
        findByDateRange: jest.fn().mockResolvedValue([holiday]),
      },
      families: {
        findById: jest.fn().mockResolvedValue(family),
      },
      parents: {
        findByFamilyId: jest.fn().mockResolvedValue(mockParents),
      },
      scheduleOverrides: {
        create: jest.fn().mockRejectedValue(dbError),
      },
    };

    (getDb as jest.Mock).mockReturnValue(mockDb);
    (ScheduleOverrideEngine.createHolidayOverrides as jest.Mock).mockReturnValue([mockOverride]);

    const result = await generateAndPersistHolidayOverrides("family-123", "2026-07-01", "2026-07-31");

    // Key assertion: Should return the in-memory override even though persistence failed
    expect(result).toEqual([mockOverride]);
    // Verify error was logged with structured logging
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "Failed to persist holiday overrides, using in-memory overrides",
      expect.objectContaining({
        familyId: "family-123",
        overrideCount: 1,
        error: "DB error",
      }),
    );
  });
});
