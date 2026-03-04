/**
 * KidSchedule – Schedule Generator Composition (CAL-008, Task 2)
 *
 * Orchestrates the complete custody schedule generation flow:
 * 1. Generate base custody schedule events
 * 2. Generate and persist holiday overrides
 * 3. Apply overrides to base events
 * 4. Return merged final schedule with diagnostics
 *
 * Architecture: Composition function that coordinates multiple specialized engines
 * to produce a complete custody schedule with holiday exception handling.
 *
 * Error Handling Strategy:
 * - Override generation/application failures are logged but don't block schedule rendering
 * - Always returns a complete schedule (graceful degradation)
 * - Base events are returned if any override step fails
 */

import { generateCustodySchedule } from "@/lib/custody-schedule-generator";
import { generateAndPersistHolidayOverrides } from "@/lib/schedule-override-generator";
import { ScheduleOverrideEngine } from "@/lib/schedule-override-engine";
import { logEvent } from "@/lib/observability/logger";
import type {
  ScheduleGeneratorInput,
  ScheduleGeneratorOutput,
  ScheduleEvent,
  ScheduleOverride,
} from "@/types";

/**
 * Generates a complete custody schedule with holiday overrides applied.
 *
 * This composition function orchestrates the four-step schedule generation process:
 *
 * Step 1: Generates base custody schedule events using the specified pattern
 * Step 2: Generates and persists holiday overrides for the date range
 * Step 3: Applies overrides to base events using ScheduleOverrideEngine
 * Step 4: Returns merged final schedule with diagnostics
 *
 * Error Handling:
 * If override generation or application fails, the function returns the base schedule
 * with diagnostics. All errors are logged for observability.
 *
 * @param input - Schedule generation input (family ID, pattern, dates, timezone, etc.)
 * @returns Complete custody schedule with merged events and diagnostics
 * @throws Only if base schedule generation fails (higher-level error)
 */
export async function generateCompleteSchedule(
  input: ScheduleGeneratorInput,
): Promise<ScheduleGeneratorOutput> {
  // ─── Step 1: Generate base custody schedule events ──────────────────────────
  const baseSchedule = generateCustodySchedule(input);

  // ─── Step 2: Generate and persist holiday overrides ───────────────────────────
  let overrides: ScheduleOverride[] = [];
  try {
    overrides = await generateAndPersistHolidayOverrides(
      input.family_id,
      input.date_range.start,
      input.date_range.end,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logEvent("warn", "Holiday override generation failed, continuing with base schedule", {
      familyId: input.family_id,
      startDate: input.date_range.start,
      endDate: input.date_range.end,
      error: errorMessage,
    });
    // Continue with empty overrides list (graceful degradation)
  }

  // ─── Step 3: Apply overrides to base events ───────────────────────────────────
  let finalEvents: ScheduleEvent[] = baseSchedule.events;

  if (overrides.length > 0) {
    try {
      finalEvents = ScheduleOverrideEngine.applyOverrides(baseSchedule.events, overrides);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logEvent("warn", "Override application failed, using base schedule events", {
        familyId: input.family_id,
        overrideCount: overrides.length,
        error: errorMessage,
      });
      // Continue with base events (graceful degradation)
      finalEvents = baseSchedule.events;
    }
  }

  // ─── Step 4: Return merged schedule with diagnostics ────────────────────────
  return {
    ...baseSchedule,
    events: finalEvents,
  };
}
