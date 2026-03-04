/**
 * Holiday Override Generator Unit Tests
 *
 * Tests for the generateAndPersistHolidayOverrides function - converting approved
 * holiday exception rules into schedule overrides and persisting them to the database.
 */

import { generateAndPersistHolidayOverrides } from "../schedule-override-generator";
import { getDb, _test_resetDbInstance } from "@/lib/persistence";
import { ScheduleOverrideEngine } from "@/lib/schedule-override-engine";
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

describe("generateAndPersistHolidayOverrides", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _test_resetDbInstance();
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

    // Mock override from engine - this is what ScheduleOverrideEngine.createHolidayOverrides returns
    const engineOverride = {
      familyId: "family-123",
      type: "holiday",
      title: "Independence Day Exception",
      description: "Holiday override",
      effectiveStart: "2026-07-04T00:00:00Z",
      effectiveEnd: "2026-07-04T23:59:59Z",
      custodianParentId: "parent-a",
      sourceEventId: undefined,
      priority: 20,
      status: "active",
      createdBy: "parent-a",
      notes: undefined,
    };

    // Mock persisted override - what comes back from database
    const persistedOverride: DbScheduleOverride = {
      id: "override-1",
      familyId: "family-123",
      type: "holiday",
      overrideType: "holiday",
      title: "Independence Day Exception",
      description: "Holiday override",
      effectiveStart: "2026-07-04T00:00:00Z",
      effectiveEnd: "2026-07-04T23:59:59Z",
      custodianParentId: "parent-a",
      priority: 20,
      status: "active",
      createdAt: "2026-01-01T00:00:00Z",
      createdBy: "parent-a",
      notes: undefined,
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
      scheduleOverrides: {
        create: jest.fn().mockResolvedValue([persistedOverride]),
      },
    };

    (getDb as jest.Mock).mockReturnValue(mockDb);
    (ScheduleOverrideEngine.createHolidayOverrides as jest.Mock).mockReturnValue([engineOverride]);

    const result = await generateAndPersistHolidayOverrides("family-123", "2026-07-01", "2026-07-31");

    expect(result).toEqual([persistedOverride]);
    // Verify engine was called with positional parameters
    expect(ScheduleOverrideEngine.createHolidayOverrides).toHaveBeenCalledWith(
      [holiday],
      expect.arrayContaining([expect.objectContaining({
        familyId: "family-123",
        holidayId: "holiday-july4",
        custodianParentId: "parent-a",
      })]),
      "2026-07-01",
      "2026-07-31",
      family
    );
    // Verify data was transformed and persisted correctly
    expect(mockDb.scheduleOverrides.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          familyId: "family-123",
          overrideType: "holiday",
          title: "Independence Day Exception",
          effectiveStart: "2026-07-04T00:00:00Z",
          effectiveEnd: "2026-07-04T23:59:59Z",
          custodianParentId: "parent-a",
          priority: 20,
          status: "active",
          createdBy: "parent-a",
        })
      ])
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
      scheduleOverrides: {
        create: jest.fn().mockResolvedValue([]),
      },
    };

    (getDb as jest.Mock).mockReturnValue(mockDb);
    (ScheduleOverrideEngine.createHolidayOverrides as jest.Mock).mockReturnValue([]);

    await generateAndPersistHolidayOverrides("family-123", "2026-07-01", "2026-07-31");

    // Should only process the approved+enabled rule (positional parameters)
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
      family,
    );
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
      scheduleOverrides: {
        create: jest.fn().mockRejectedValue(dbError),
      },
    };

    (getDb as jest.Mock).mockReturnValue(mockDb);
    (ScheduleOverrideEngine.createHolidayOverrides as jest.Mock).mockReturnValue([mockOverride]);

    // Mock console.error to suppress error output in tests
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    const result = await generateAndPersistHolidayOverrides("family-123", "2026-07-01", "2026-07-31");

    // Key assertion: Should return the in-memory override even though persistence failed
    expect(result).toEqual([mockOverride]);
    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to persist holiday overrides"),
      expect.stringContaining("DB error"),
    );

    consoleErrorSpy.mockRestore();
  });
});
