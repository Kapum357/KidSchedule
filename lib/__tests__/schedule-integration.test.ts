/**
 * Schedule Integration Tests - Holiday Overrides (CAL-008, Task 4)
 *
 * Tests for end-to-end schedule generation with holiday overrides.
 * Verifies that the complete pipeline from base schedule generation through
 * override application works correctly together.
 *
 * Test Strategy:
 * - Test 1: Generate schedule with applied overrides when approved rules exist
 * - Test 2: Return base schedule when no approved rules exist
 * - Test 3: Persist overrides to database during schedule generation
 * - Test 4: Verify override parent_id correctly replaces custody parent on events
 * - Test 5: Preserve and verify diagnostics are accurate
 */

import { generateCompleteSchedule } from "../schedule-generator";
import { generateCustodySchedule } from "@/lib/custody-schedule-generator";
import { generateAndPersistHolidayOverrides } from "@/lib/schedule-override-generator";
import { ScheduleOverrideEngine } from "@/lib/schedule-override-engine";
import { logEvent } from "@/lib/observability/logger";
import type {
  ScheduleGeneratorInput,
  ScheduleGeneratorOutput,
  ScheduleEvent,
  ScheduleOverride,
  SchedulePattern,
  ScheduleGeneratorDiagnostics,
} from "@/types";

// ─── Mock Dependencies ────────────────────────────────────────────────────────

jest.mock("@/lib/custody-schedule-generator");
jest.mock("@/lib/schedule-override-generator");
jest.mock("@/lib/schedule-override-engine");
jest.mock("@/lib/observability/logger");

// ─── Test Fixtures / Helper Factories ─────────────────────────────────────────

/**
 * Factory: Creates a mock ScheduleEvent for testing.
 */
function createMockEvent(
  parentId: string = "parent-a",
  startDate: string = "2026-11-01",
  endDate: string = "2026-11-02",
  overrideId?: string,
): ScheduleEvent {
  return {
    start_at: `${startDate}T17:00:00-05:00 (EST)`,
    end_at: `${endDate}T17:00:00-05:00 (EST)`,
    parent_id: parentId,
    custody_type: "base",
    source_pattern: "SEVEN_SEVEN" as SchedulePattern,
    cycle_id: "cycle-1",
    child_id: "child-123",
    family_id: "family-123",
    ...(overrideId && { override_id: overrideId }),
  };
}

/**
 * Factory: Creates a mock ScheduleOverride for testing.
 */
function createMockOverride(
  id: string = "override-1",
  parentId: string = "parent-override-123",
  startDate: string = "2026-12-25",
  endDate: string = "2026-12-25",
  priority: number = 20,
): ScheduleOverride {
  return {
    id,
    familyId: "family-123",
    type: "holiday",
    title: "Christmas",
    description: "Christmas holiday override",
    effectiveStart: `${startDate}T00:00:00.000Z`,
    effectiveEnd: `${endDate}T23:59:59.999Z`,
    custodianParentId: parentId,
    sourceEventId: "holiday-christmas",
    priority,
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: "system",
  };
}

/**
 * Factory: Creates a mock ScheduleGeneratorInput for testing.
 */
function createMockInput(
  overrides: Partial<ScheduleGeneratorInput> = {},
): ScheduleGeneratorInput {
  return {
    family_id: "family-123",
    child_id: "child-123",
    pattern: "SEVEN_SEVEN" as SchedulePattern,
    timezone: "America/New_York",
    date_range: {
      start: "2026-11-01",
      end: "2026-11-30",
    },
    anchor: {
      anchor_date: "2026-11-01",
      anchor_parent_id: "parent-a",
      other_parent_id: "parent-b",
    },
    ...overrides,
  };
}

/**
 * Factory: Creates a mock ScheduleGeneratorDiagnostics for testing.
 */
function createMockDiagnostics(
  overrides: Partial<ScheduleGeneratorDiagnostics> = {},
): ScheduleGeneratorDiagnostics {
  return {
    version: "1.0",
    pattern_summary: "7-7 Alternating Weeks",
    total_events: 30,
    warnings: [],
    ...overrides,
  };
}

/**
 * Factory: Creates a mock ScheduleGeneratorOutput for testing.
 */
function createMockOutput(
  events: ScheduleEvent[] = [createMockEvent()],
  diagnostics: ScheduleGeneratorDiagnostics = createMockDiagnostics(),
): ScheduleGeneratorOutput {
  return {
    events,
    diagnostics,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Schedule Integration - Holiday Overrides", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Complete schedule generation with overrides", () => {
    test("generates schedule with applied overrides when approved rules exist", async () => {
      // Setup: Create mock family, approved rule, holiday definition
      const family_id = "family-1";
      const input = createMockInput({ family_id });
      const baseEvent = createMockEvent("parent-original", "2026-11-26", "2026-11-26");
      const override = createMockOverride(
        "override-thanksgiving",
        "parent-override-123",
        "2026-11-26",
        "2026-11-26",
      );

      // Mock the custody schedule generation to return base events
      (generateCustodySchedule as jest.Mock).mockReturnValue(
        createMockOutput([baseEvent]),
      );

      // Mock holiday override generation to return an override
      (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([override]);

      // Mock override application to apply the override to events
      const overriddenEvent = createMockEvent(
        "parent-override-123",
        "2026-11-26",
        "2026-11-26",
        "override-thanksgiving",
      );
      overriddenEvent.custody_type = "override";
      (ScheduleOverrideEngine.applyOverrides as jest.Mock).mockReturnValue([
        overriddenEvent,
      ]);

      // Act
      const result = await generateCompleteSchedule(input);

      // Assert
      expect(result.events).toBeDefined();
      expect(result.events).toHaveLength(1);
      expect(result.events[0].parent_id).toBe("parent-override-123");
      expect(result.events[0].custody_type).toBe("override");
      expect(generateAndPersistHolidayOverrides).toHaveBeenCalledWith(
        family_id,
        input.date_range.start,
        input.date_range.end,
      );
      expect(ScheduleOverrideEngine.applyOverrides).toHaveBeenCalled();
    });

    test("returns base schedule when no approved rules exist", async () => {
      // Setup: No overrides available
      const input = createMockInput();
      const baseEvent = createMockEvent();
      const baseDiagnostics = createMockDiagnostics();

      // Mock the custody schedule generation
      (generateCustodySchedule as jest.Mock).mockReturnValue(
        createMockOutput([baseEvent], baseDiagnostics),
      );

      // Mock holiday override generation to return empty array
      (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await generateCompleteSchedule(input);

      // Assert
      expect(result.events).toEqual([baseEvent]);
      expect(result.diagnostics).toEqual(baseDiagnostics);
      expect(ScheduleOverrideEngine.applyOverrides).not.toHaveBeenCalled();
    });

    test("persists overrides to database during schedule generation", async () => {
      // Setup: Approved rule that will be generated and persisted
      const input = createMockInput();
      const baseEvent = createMockEvent();
      const override = createMockOverride();

      // Mock the custody schedule generation
      (generateCustodySchedule as jest.Mock).mockReturnValue(
        createMockOutput([baseEvent]),
      );

      // Mock holiday override generation to return an override
      (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([override]);

      // Mock override application
      (ScheduleOverrideEngine.applyOverrides as jest.Mock).mockReturnValue([
        createMockEvent(override.custodianParentId),
      ]);

      // Act
      await generateCompleteSchedule(input);

      // Assert: Verify generateAndPersistHolidayOverrides was called
      // (this function is responsible for persisting to database)
      expect(generateAndPersistHolidayOverrides).toHaveBeenCalledWith(
        input.family_id,
        input.date_range.start,
        input.date_range.end,
      );

      // The call to generateAndPersistHolidayOverrides verifies that the integration
      // correctly calls the persistence layer
    });

    test("correctly applies override parent_id to schedule events", async () => {
      // Setup: Event with original parent, override with different parent
      const input = createMockInput();
      const originalParentId = "parent-original";
      const overrideParentId = "parent-override-123";
      const christmasDate = "2026-12-25";

      const baseEvent = createMockEvent(originalParentId, christmasDate, christmasDate);
      const override = createMockOverride(
        "override-christmas",
        overrideParentId,
        christmasDate,
        christmasDate,
      );

      // Mock custody schedule generation
      (generateCustodySchedule as jest.Mock).mockReturnValue(
        createMockOutput([baseEvent]),
      );

      // Mock holiday override generation
      (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([override]);

      // Mock override application - the applied override should have new parent_id
      const appliedEvent = createMockEvent(
        overrideParentId,
        christmasDate,
        christmasDate,
        "override-christmas",
      );
      appliedEvent.custody_type = "override";
      (ScheduleOverrideEngine.applyOverrides as jest.Mock).mockReturnValue([appliedEvent]);

      // Act
      const result = await generateCompleteSchedule(input);

      // Assert
      const christmasEvent = result.events.find(
        (e) =>
          e.start_at.startsWith(christmasDate) ||
          e.start_at.includes(christmasDate),
      );
      expect(christmasEvent).toBeDefined();
      expect(christmasEvent?.parent_id).toBe(overrideParentId);
      expect(christmasEvent?.override_id).toBe("override-christmas");
    });

    test("preserves diagnostics in output", async () => {
      // Setup: Verify diagnostics are passed through correctly
      const input = createMockInput();
      const baseDiagnostics: ScheduleGeneratorDiagnostics = {
        version: "1.0",
        pattern_summary: "7-7 Alternating Weeks",
        total_events: 30,
        warnings: ["Test warning"],
      };

      // Mock custody schedule generation with diagnostics
      (generateCustodySchedule as jest.Mock).mockReturnValue(
        createMockOutput([createMockEvent()], baseDiagnostics),
      );

      // Mock holiday override generation to return empty (no overrides)
      (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await generateCompleteSchedule(input);

      // Assert
      expect(result.diagnostics).toEqual(baseDiagnostics);
      expect(result.diagnostics.total_events).toBe(30);
      expect(result.diagnostics.warnings).toContain("Test warning");
    });

    test("gracefully handles override generation failure and returns base schedule", async () => {
      // Setup: Override generation throws an error
      const input = createMockInput();
      const baseEvent = createMockEvent();
      const baseDiagnostics = createMockDiagnostics();

      // Mock custody schedule generation
      (generateCustodySchedule as jest.Mock).mockReturnValue(
        createMockOutput([baseEvent], baseDiagnostics),
      );

      // Mock holiday override generation to throw an error
      (generateAndPersistHolidayOverrides as jest.Mock).mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Act
      const result = await generateCompleteSchedule(input);

      // Assert: Should return base schedule despite override generation failure
      expect(result.events).toEqual([baseEvent]);
      expect(result.diagnostics).toEqual(baseDiagnostics);
      expect(logEvent).toHaveBeenCalledWith(
        "warn",
        "Holiday override generation failed, continuing with base schedule",
        expect.objectContaining({
          familyId: input.family_id,
          error: "Database connection failed",
        }),
      );
    });

    test("gracefully handles override application failure and uses base events", async () => {
      // Setup: Override application throws an error
      const input = createMockInput();
      const baseEvent = createMockEvent();
      const override = createMockOverride();

      // Mock custody schedule generation
      (generateCustodySchedule as jest.Mock).mockReturnValue(
        createMockOutput([baseEvent]),
      );

      // Mock holiday override generation to return an override
      (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([override]);

      // Mock override application to throw an error
      (ScheduleOverrideEngine.applyOverrides as jest.Mock).mockImplementation(() => {
        throw new Error("Override merging failed");
      });

      // Act
      const result = await generateCompleteSchedule(input);

      // Assert: Should return base events despite override application failure
      expect(result.events).toEqual([baseEvent]);
      expect(logEvent).toHaveBeenCalledWith(
        "warn",
        "Override application failed, using base schedule events",
        expect.objectContaining({
          familyId: input.family_id,
          overrideCount: 1,
          error: "Override merging failed",
        }),
      );
    });

    test("handles multiple overrides for different holidays", async () => {
      // Setup: Multiple holidays with different overrides
      const input = createMockInput();
      const baseEvent1 = createMockEvent("parent-a", "2026-11-26", "2026-11-26");
      const baseEvent2 = createMockEvent("parent-a", "2026-12-25", "2026-12-25");

      const overrideThanksgiving = createMockOverride(
        "override-thanksgiving",
        "parent-override-1",
        "2026-11-26",
        "2026-11-26",
      );
      const overrideChristmas = createMockOverride(
        "override-christmas",
        "parent-override-2",
        "2026-12-25",
        "2026-12-25",
      );

      // Mock custody schedule generation
      (generateCustodySchedule as jest.Mock).mockReturnValue(
        createMockOutput([baseEvent1, baseEvent2]),
      );

      // Mock holiday override generation to return multiple overrides
      (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([
        overrideThanksgiving,
        overrideChristmas,
      ]);

      // Mock override application to apply both overrides
      const appliedEvent1 = createMockEvent(
        "parent-override-1",
        "2026-11-26",
        "2026-11-26",
        "override-thanksgiving",
      );
      appliedEvent1.custody_type = "override";

      const appliedEvent2 = createMockEvent(
        "parent-override-2",
        "2026-12-25",
        "2026-12-25",
        "override-christmas",
      );
      appliedEvent2.custody_type = "override";

      (ScheduleOverrideEngine.applyOverrides as jest.Mock).mockReturnValue([
        appliedEvent1,
        appliedEvent2,
      ]);

      // Act
      const result = await generateCompleteSchedule(input);

      // Assert
      expect(result.events).toHaveLength(2);
      expect(result.events[0].parent_id).toBe("parent-override-1");
      expect(result.events[1].parent_id).toBe("parent-override-2");
      expect(ScheduleOverrideEngine.applyOverrides).toHaveBeenCalledWith(
        [baseEvent1, baseEvent2],
        [overrideThanksgiving, overrideChristmas],
      );
    });

    test("maintains event count when applying overrides", async () => {
      // Setup: Verify override application doesn't lose events
      const input = createMockInput();
      const baseEvents = [
        createMockEvent("parent-a", "2026-11-01", "2026-11-02"),
        createMockEvent("parent-b", "2026-11-02", "2026-11-03"),
        createMockEvent("parent-a", "2026-11-03", "2026-11-04"),
      ];
      const override = createMockOverride();

      // Mock custody schedule generation
      (generateCustodySchedule as jest.Mock).mockReturnValue(
        createMockOutput(baseEvents),
      );

      // Mock holiday override generation
      (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([override]);

      // Mock override application to return same count of events
      const appliedEvents = [...baseEvents];
      (ScheduleOverrideEngine.applyOverrides as jest.Mock).mockReturnValue(appliedEvents);

      // Act
      const result = await generateCompleteSchedule(input);

      // Assert
      expect(result.events).toHaveLength(baseEvents.length);
      expect(result.events).toEqual(appliedEvents);
    });
  });
});
