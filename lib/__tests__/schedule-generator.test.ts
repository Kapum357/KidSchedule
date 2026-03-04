/**
 * Schedule Generator Composition Unit Tests (CAL-008, Task 2)
 *
 * Tests for the generateCompleteSchedule composition function that orchestrates
 * the complete custody schedule generation flow including holiday override handling.
 *
 * Test Strategy:
 * - Test 1: Base schedule returned if no overrides generated
 * - Test 2: Overrides applied to base schedule events
 * - Test 3: Base schedule returned if override application fails (graceful degradation)
 * - Test 4: Correct parameters passed to each composition function
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
} from "@/types";

// ─── Mock Dependencies ────────────────────────────────────────────────────────

jest.mock("@/lib/custody-schedule-generator");
jest.mock("@/lib/schedule-override-generator");
jest.mock("@/lib/schedule-override-engine");
jest.mock("@/lib/observability/logger");

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Creates a mock ScheduleEvent for testing.
 */
function createMockEvent(
  parentId: string,
  startDate: string,
  endDate: string,
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
    override_id: overrideId,
  };
}

/**
 * Creates a mock ScheduleOverride for testing.
 */
function createMockOverride(
  id: string,
  parentId: string,
  startDate: string,
  endDate: string,
  priority: number = 20,
  status: "active" | "expired" | "superseded" | "cancelled" = "active",
): ScheduleOverride {
  return {
    id,
    familyId: "family-123",
    type: "holiday",
    title: "Test Holiday",
    description: "Test holiday override",
    effectiveStart: `${startDate}T00:00:00.000Z`,
    effectiveEnd: `${endDate}T23:59:59.999Z`,
    custodianParentId: parentId,
    sourceEventId: "holiday-1",
    priority,
    status,
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: "system",
  };
}

/**
 * Creates a mock ScheduleGeneratorInput for testing.
 */
function createMockInput(): ScheduleGeneratorInput {
  return {
    family_id: "family-123",
    child_id: "child-123",
    pattern: "SEVEN_SEVEN" as SchedulePattern,
    timezone: "America/New_York",
    date_range: {
      start: "2026-03-15",
      end: "2026-03-31",
    },
    anchor: {
      anchor_date: "2026-03-01",
      anchor_parent_id: "parent-a",
      other_parent_id: "parent-b",
    },
  };
}

/**
 * Creates a mock ScheduleGeneratorOutput for testing.
 */
function createMockBaseSchedule(
  eventCount: number = 1,
  parentId: string = "parent-a",
): ScheduleGeneratorOutput {
  const events: ScheduleEvent[] = [];
  for (let i = 0; i < eventCount; i++) {
    const startDate = `2026-03-${String(15 + i).padStart(2, "0")}`;
    const endDate = `2026-03-${String(16 + i).padStart(2, "0")}`;
    events.push(createMockEvent(parentId, startDate, endDate));
  }

  return {
    events,
    diagnostics: {
      version: "1.0.0",
      pattern_summary: "7-7 Alternating Weeks",
      total_events: events.length,
      warnings: [],
    },
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("generateCompleteSchedule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Base schedule returned if no overrides generated
  // ─────────────────────────────────────────────────────────────────────────

  it("returns base schedule if no overrides generated", async () => {
    const mockInput = createMockInput();
    const mockBaseSchedule = createMockBaseSchedule(1);

    (generateCustodySchedule as jest.Mock).mockReturnValue(mockBaseSchedule);
    (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([]);

    const result = await generateCompleteSchedule(mockInput);

    expect(result).toEqual(mockBaseSchedule);
    expect(result.events).toEqual(mockBaseSchedule.events);
    expect(result.diagnostics).toEqual(mockBaseSchedule.diagnostics);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Overrides applied to base schedule events
  // ─────────────────────────────────────────────────────────────────────────

  it("applies overrides to base schedule events", async () => {
    const mockInput = createMockInput();

    // Create base schedule with 5 events (mix of different parents)
    const mockBaseSchedule = createMockBaseSchedule(5, "parent-a");
    mockBaseSchedule.events[0] = createMockEvent("parent-a", "2026-03-15", "2026-03-16");
    mockBaseSchedule.events[1] = createMockEvent("parent-b", "2026-03-16", "2026-03-17");
    mockBaseSchedule.events[2] = createMockEvent("parent-a", "2026-03-17", "2026-03-18");
    mockBaseSchedule.events[3] = createMockEvent("parent-b", "2026-03-18", "2026-03-19");
    mockBaseSchedule.events[4] = createMockEvent("parent-a", "2026-03-19", "2026-03-20");

    // Create 2 overrides that will modify some events
    const mockOverrides: ScheduleOverride[] = [
      createMockOverride("override-1", "parent-b", "2026-03-15", "2026-03-16", 20),
      createMockOverride("override-2", "parent-a", "2026-03-18", "2026-03-19", 20),
    ];

    // Create modified events that ScheduleOverrideEngine would return
    const modifiedEvents: ScheduleEvent[] = [
      createMockEvent("parent-b", "2026-03-15", "2026-03-16", "override-1"),
      createMockEvent("parent-b", "2026-03-16", "2026-03-17"),
      createMockEvent("parent-a", "2026-03-17", "2026-03-18"),
      createMockEvent("parent-a", "2026-03-18", "2026-03-19", "override-2"),
      createMockEvent("parent-a", "2026-03-19", "2026-03-20"),
    ];

    (generateCustodySchedule as jest.Mock).mockReturnValue(mockBaseSchedule);
    (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue(mockOverrides);
    (ScheduleOverrideEngine.applyOverrides as jest.Mock).mockReturnValue(modifiedEvents);

    const result = await generateCompleteSchedule(mockInput);

    expect(result.events).toEqual(modifiedEvents);
    expect(result.diagnostics).toEqual(mockBaseSchedule.diagnostics);
    expect(ScheduleOverrideEngine.applyOverrides).toHaveBeenCalledWith(
      mockBaseSchedule.events,
      mockOverrides,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Base schedule returned if override application fails
  // ─────────────────────────────────────────────────────────────────────────

  it("returns base schedule if override application fails (graceful degradation)", async () => {
    const mockInput = createMockInput();
    const mockBaseSchedule = createMockBaseSchedule(3);

    const mockOverrides: ScheduleOverride[] = [
      createMockOverride("override-1", "parent-b", "2026-03-15", "2026-03-16"),
    ];

    const overrideError = new Error("Override application failed");

    (generateCustodySchedule as jest.Mock).mockReturnValue(mockBaseSchedule);
    (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue(mockOverrides);
    (ScheduleOverrideEngine.applyOverrides as jest.Mock).mockImplementation(() => {
      throw overrideError;
    });

    const result = await generateCompleteSchedule(mockInput);

    // Should return base schedule despite override application failure
    expect(result.events).toEqual(mockBaseSchedule.events);
    expect(result.diagnostics).toEqual(mockBaseSchedule.diagnostics);

    // Verify error was logged
    expect(logEvent).toHaveBeenCalledWith(
      "warn",
      "Override application failed, using base schedule events",
      expect.objectContaining({
        familyId: "family-123",
        overrideCount: 1,
        error: "Override application failed",
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Correct parameters passed to each composition function
  // ─────────────────────────────────────────────────────────────────────────

  it("passes correct parameters to each composition function", async () => {
    const mockInput = createMockInput();
    const mockBaseSchedule = createMockBaseSchedule(1);

    (generateCustodySchedule as jest.Mock).mockReturnValue(mockBaseSchedule);
    (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([]);

    await generateCompleteSchedule(mockInput);

    // Verify generateCustodySchedule called with input unchanged
    expect(generateCustodySchedule).toHaveBeenCalledWith(mockInput);
    expect(generateCustodySchedule).toHaveBeenCalledTimes(1);

    // Verify generateAndPersistHolidayOverrides called with extracted parameters
    expect(generateAndPersistHolidayOverrides).toHaveBeenCalledWith(
      "family-123",
      "2026-03-15",
      "2026-03-31",
    );
    expect(generateAndPersistHolidayOverrides).toHaveBeenCalledTimes(1);

    // Verify ScheduleOverrideEngine.applyOverrides called with base events and empty overrides
    expect(ScheduleOverrideEngine.applyOverrides).not.toHaveBeenCalled(); // Not called when overrides is empty
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Additional Test: Override generation failure is gracefully handled
  // ─────────────────────────────────────────────────────────────────────────

  it("returns base schedule if override generation fails (graceful degradation)", async () => {
    const mockInput = createMockInput();
    const mockBaseSchedule = createMockBaseSchedule(2);

    const generationError = new Error("Failed to fetch holiday definitions");

    (generateCustodySchedule as jest.Mock).mockReturnValue(mockBaseSchedule);
    (generateAndPersistHolidayOverrides as jest.Mock).mockRejectedValue(generationError);

    const result = await generateCompleteSchedule(mockInput);

    // Should return base schedule despite override generation failure
    expect(result.events).toEqual(mockBaseSchedule.events);
    expect(result.diagnostics).toEqual(mockBaseSchedule.diagnostics);

    // Verify error was logged
    expect(logEvent).toHaveBeenCalledWith(
      "warn",
      "Holiday override generation failed, continuing with base schedule",
      expect.objectContaining({
        familyId: "family-123",
        startDate: "2026-03-15",
        endDate: "2026-03-31",
        error: "Failed to fetch holiday definitions",
      }),
    );

    // ScheduleOverrideEngine should not be called when override generation fails
    expect(ScheduleOverrideEngine.applyOverrides).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Additional Test: Correct behavior with multiple overrides of different types
  // ─────────────────────────────────────────────────────────────────────────

  it("handles multiple overrides with different priorities correctly", async () => {
    const mockInput = createMockInput();
    const mockBaseSchedule = createMockBaseSchedule(3);

    // Create overrides with different priorities
    const mockOverrides: ScheduleOverride[] = [
      {
        ...createMockOverride("holiday-override", "parent-b", "2026-03-15", "2026-03-16"),
        type: "holiday",
        priority: 20,
      },
      {
        ...createMockOverride("swap-override", "parent-a", "2026-03-17", "2026-03-18"),
        type: "swap",
        priority: 15,
      },
      {
        ...createMockOverride("manual-override", "parent-b", "2026-03-19", "2026-03-20"),
        type: "manual",
        priority: 10,
      },
    ];

    const modifiedEvents: ScheduleEvent[] = [
      createMockEvent("parent-b", "2026-03-15", "2026-03-16", "holiday-override"),
      createMockEvent("parent-b", "2026-03-16", "2026-03-17"),
      createMockEvent("parent-a", "2026-03-17", "2026-03-18", "swap-override"),
    ];

    (generateCustodySchedule as jest.Mock).mockReturnValue(mockBaseSchedule);
    (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue(mockOverrides);
    (ScheduleOverrideEngine.applyOverrides as jest.Mock).mockReturnValue(modifiedEvents);

    const result = await generateCompleteSchedule(mockInput);

    // Verify all overrides were passed to applyOverrides
    expect(ScheduleOverrideEngine.applyOverrides).toHaveBeenCalledWith(
      mockBaseSchedule.events,
      mockOverrides,
    );

    expect(result.events).toEqual(modifiedEvents);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Additional Test: Diagnostics preserved when no overrides
  // ─────────────────────────────────────────────────────────────────────────

  it("preserves base schedule diagnostics when no overrides are applied", async () => {
    const mockInput = createMockInput();
    const mockBaseSchedule = createMockBaseSchedule(1);

    (generateCustodySchedule as jest.Mock).mockReturnValue(mockBaseSchedule);
    (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([]);

    const result = await generateCompleteSchedule(mockInput);

    expect(result.diagnostics).toBe(mockBaseSchedule.diagnostics);
    expect(result.diagnostics.pattern_summary).toEqual("7-7 Alternating Weeks");
    expect(result.diagnostics.total_events).toEqual(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Additional Test: Empty date range produces empty results
  // ─────────────────────────────────────────────────────────────────────────

  it("handles empty schedule (no events) correctly", async () => {
    const mockInput = createMockInput();
    const mockBaseSchedule: ScheduleGeneratorOutput = {
      events: [],
      diagnostics: {
        version: "1.0.0",
        pattern_summary: "7-7 Alternating Weeks",
        total_events: 0,
        warnings: ["No events generated for date range"],
      },
    };

    (generateCustodySchedule as jest.Mock).mockReturnValue(mockBaseSchedule);
    (generateAndPersistHolidayOverrides as jest.Mock).mockResolvedValue([]);

    const result = await generateCompleteSchedule(mockInput);

    expect(result.events).toEqual([]);
    expect(result.diagnostics.total_events).toEqual(0);
    expect(result.diagnostics.warnings).toContain("No events generated for date range");
  });
});
