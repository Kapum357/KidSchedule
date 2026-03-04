/**
 * KidSchedule – Holiday Override Generator (CAL-008)
 *
 * Generates schedule overrides from approved holiday exception rules and persists
 * them to the database. This function is called during schedule generation to ensure
 * holiday overrides are available for the custody schedule.
 *
 * Architecture: On-demand generation integrated into schedule request pipeline.
 * Overrides are generated when schedule is requested, persisted to database, then
 * applied to base events.
 *
 * Responsibilities:
 * 1. Fetch approved holiday exception rules (approvalStatus === "approved" && isEnabled === true)
 * 2. Fetch holiday definitions for the family's jurisdiction
 * 3. Call ScheduleOverrideEngine.createHolidayOverrides() with fetched data
 * 4. Persist generated overrides via scheduleOverrideRepository.create()
 * 5. Return generated overrides
 * 6. Handle errors gracefully without blocking schedule generation
 */

import { getDb } from "@/lib/persistence";
import { ScheduleOverrideEngine } from "@/lib/schedule-override-engine";
import type { ScheduleOverride } from "@/types";
import type { DbScheduleOverride } from "@/lib/persistence";

/**
 * Generate and persist holiday overrides for a family within a date range.
 *
 * This function:
 * 1. Fetches approved holiday exception rules for the family
 * 2. Fetches holiday definitions for the family's jurisdiction
 * 3. Generates override records using ScheduleOverrideEngine
 * 4. Persists overrides to the database
 * 5. Returns the persisted overrides
 *
 * Errors are logged but do not block schedule generation (graceful degradation).
 *
 * @param familyId - The family ID to generate overrides for
 * @param startDate - Start date in ISO format (YYYY-MM-DD)
 * @param endDate - End date in ISO format (YYYY-MM-DD)
 * @returns Array of persisted schedule overrides, empty array on error
 */
export async function generateAndPersistHolidayOverrides(
  familyId: string,
  startDate: string,
  endDate: string,
): Promise<ScheduleOverride[]> {
  const db = getDb();

  // ─── Fetch approved and enabled rules ────────────────────────────────────
  let approvedRules;
  try {
    const allRules = await db.holidayExceptionRules.findByFamilyId(familyId);
    approvedRules = allRules.filter(
      (r) => r.approvalStatus === "approved" && r.isEnabled === true
    );

    if (approvedRules.length === 0) {
      return [];
    }
  } catch (error) {
    console.warn(
      "Failed to fetch approved rules, continuing without:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }

  // ─── Get family's jurisdiction and fetch holiday definitions ─────────────
  let family;
  let holidays;
  try {
    family = await db.families.findById(familyId);
    if (!family) {
      console.warn(`Family not found: ${familyId}`);
      return [];
    }

    // Extract jurisdiction from family metadata (if available) or default to "US"
    // In a real implementation, this would come from family settings
    const jurisdiction = (family as any).jurisdiction || "US";

    // Fetch holiday definitions for the family's jurisdiction
    holidays = await db.holidays.findByDateRange(jurisdiction, startDate, endDate);
  } catch (error) {
    console.warn(
      "Failed to fetch holiday definitions, continuing without:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }

  // ─── Generate overrides using engine ────────────────────────────────────
  // Note: This is synchronous, no error handling needed
  const overrides = ScheduleOverrideEngine.createHolidayOverrides(
    holidays,
    approvedRules.map((rule) => ({
      familyId: rule.familyId,
      holidayId: rule.holidayId,
      custodianParentId: rule.custodianParentId,
      isEnabled: rule.isEnabled,
      notes: rule.notes,
    })),
    startDate,
    endDate,
    family as any
  );

  if (overrides.length === 0) {
    return [];
  }

  // ─── Persist overrides to database ──────────────────────────────────────
  try {
    const persistedOverrides = await db.scheduleOverrides.create(
      overrides.map((override) => ({
        familyId: override.familyId,
        overrideType: override.type,
        title: override.title,
        description: override.description,
        effectiveStart: override.effectiveStart,
        effectiveEnd: override.effectiveEnd,
        custodianParentId: override.custodianParentId,
        sourceEventId: override.sourceEventId,
        priority: override.priority,
        status: override.status,
        createdBy: override.createdBy,
        notes: override.notes,
      }))
    );

    return persistedOverrides;
  } catch (error) {
    console.error(
      "Failed to persist holiday overrides, using in-memory overrides:",
      error instanceof Error ? error.message : String(error)
    );
    // Return in-memory overrides despite persistence failure
    // This allows the schedule to still apply them for the current request
    return overrides;
  }
}
