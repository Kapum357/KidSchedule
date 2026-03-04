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
import type { ScheduleOverride, Family } from "@/types";
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

  // ─── Fetch family, parents, and holiday definitions ──────────────────────
  let dbFamily;
  let parents;
  let holidays;
  try {
    dbFamily = await db.families.findById(familyId);
    if (!dbFamily) {
      console.warn(`Family not found: ${familyId}`);
      return [];
    }

    // Fetch parents to compose full Family domain object
    parents = await db.parents.findByFamilyId(familyId);
    if (!parents || parents.length < 2) {
      console.warn(`Family ${familyId} does not have both parents configured`);
      return [];
    }

    // Fetch holiday definitions for jurisdiction (default to "US")
    const jurisdiction = "US";
    holidays = await db.holidays.findByDateRange(jurisdiction, startDate, endDate);
  } catch (error) {
    console.warn(
      "Failed to fetch family data or holiday definitions:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }

  // ─── Compose domain Family object from database entities ────────────────
  const family: Family = {
    id: dbFamily.id,
    parents: [parents[0] as any, parents[1] as any],
    children: [],
    custodyAnchorDate: dbFamily.custodyAnchorDate,
    schedule: {
      id: "",
      name: "Schedule",
      blocks: [],
      transitionHour: 17,
      isActive: true,
    },
  };

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
    family
  );

  if (overrides.length === 0) {
    return [];
  }

  // ─── Persist overrides to database ──────────────────────────────────────
  try {
    const persistedOverrides: DbScheduleOverride[] = [];

    for (const override of overrides) {
      const persisted = await db.scheduleOverrides.create({
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
      });
      persistedOverrides.push(persisted);
    }

    // Transform DbScheduleOverride to ScheduleOverride for return
    return persistedOverrides.map((override) => ({
      id: override.id,
      familyId: override.familyId,
      type: override.overrideType,
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
    }));
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
