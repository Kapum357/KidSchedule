/**
 * KidSchedule – ScheduleOverrideEngine (CAL-008)
 */

import type {
  ScheduleEvent,
  ScheduleChangeRequest,
  Family,
  ParentId,
} from "@/lib";

// ─── Override Types ──────────────────────────────────────────────────────────

export type OverrideType =
  | "holiday"      // Statutory holiday exception
  | "swap"         // Approved change request
  | "mediation"    // Court-ordered change
  | "manual";      // One-time manual override

export type OverrideStatus =
  | "active"       // Currently in effect
  | "expired"      // Past its effective period
  | "superseded"   // Replaced by higher-priority override
  | "cancelled";   // Explicitly cancelled

export interface ScheduleOverride {
  id: string;
  familyId: string;
  type: OverrideType;
  title: string;
  description?: string;

  // Time period this override applies to
  effectiveStart: string; // ISO datetime
  effectiveEnd: string;   // ISO datetime

  // Custody assignment during this period
  custodianParentId: ParentId;

  // Source information
  sourceEventId?: string;     // For holiday/calendar events
  sourceRequestId?: string;   // For approved swaps
  sourceMediationId?: string; // For mediation decisions

  // Metadata
  priority: number; // Higher number = higher priority
  status: OverrideStatus;
  createdAt: string;
  createdBy: ParentId;
  notes?: string;
}

// ─── Conflict Detection ──────────────────────────────────────────────────────

export interface OverrideConflict {
  overrideId: string;
  conflictingOverrideId: string;
  timePeriod: {
    start: string;
    end: string;
  };
  severity: "warning" | "error";
  message: string;
  resolution?: "supersede" | "merge" | "cancel";
}

export interface ConflictAnalysis {
  conflicts: OverrideConflict[];
  hasBlockingConflicts: boolean;
  recommendedActions: string[];
}

// ─── Holiday Exception Manager ───────────────────────────────────────────────

export interface HolidayDefinition {
  id: string;
  name: string;
  date: string; // ISO date "YYYY-MM-DD"
  type: "federal" | "state" | "religious" | "cultural";
  jurisdiction: string; // e.g., "US", "US-CA", "US-NY"
  description?: string;
}

export interface HolidayExceptionRule {
  familyId: string;
  holidayId: string;
  custodianParentId: ParentId;
  isEnabled: boolean;
  notes?: string;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class ScheduleOverrideEngine {
  /**
   * Check if two overrides overlap in time.
   */
  private static overlaps(override1: ScheduleOverride, override2: ScheduleOverride): boolean {
    const start1 = new Date(override1.effectiveStart).getTime();
    const end1 = new Date(override1.effectiveEnd).getTime();
    const start2 = new Date(override2.effectiveStart).getTime();
    const end2 = new Date(override2.effectiveEnd).getTime();

    return start1 < end2 && start2 < end1;
  }
  static applyOverrides(
    baseEvents: ScheduleEvent[],
    overrides: ScheduleOverride[],
  ): ScheduleEvent[] {
    // Sort overrides by priority (highest first), then by creation date
    const sortedOverrides = overrides
      .filter(o => o.status === "active")
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    let modifiedEvents = [...baseEvents];

    for (const override of sortedOverrides) {
      modifiedEvents = this.applySingleOverride(modifiedEvents, override);
    }

    return modifiedEvents;
  }

  /**
   * Detect conflicts between overrides and base schedule.
   */
  static detectConflicts(
    baseEvents: ScheduleEvent[],
    overrides: ScheduleOverride[],
  ): ConflictAnalysis {
    const conflicts: OverrideConflict[] = [];
    const activeOverrides = overrides.filter(o => o.status === "active");

    // Check for overlapping overrides
    for (let i = 0; i < activeOverrides.length; i++) {
      for (let j = i + 1; j < activeOverrides.length; j++) {
        const override1 = activeOverrides[i];
        const override2 = activeOverrides[j];

        if (this.overlaps(override1, override2)) {
          const resolution = override1.priority > override2.priority ? "supersede" : "cancel";
          conflicts.push({
            overrideId: override1.id,
            conflictingOverrideId: override2.id,
            timePeriod: {
              start: new Date(Math.max(new Date(override1.effectiveStart).getTime(), new Date(override2.effectiveStart).getTime())).toISOString(),
              end: new Date(Math.min(new Date(override1.effectiveEnd).getTime(), new Date(override2.effectiveEnd).getTime())).toISOString(),
            },
            severity: "error",
            message: `Overlapping overrides: ${override1.title} and ${override2.title}`,
            resolution,
          });
        }
      }
    }

    // Check for custody gaps
    const sortedEvents = [...baseEvents].sort((a, b) =>
      new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );

    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const current = sortedEvents[i];
      const next = sortedEvents[i + 1];

      if (new Date(current.end_at).getTime() < new Date(next.start_at).getTime()) {
        conflicts.push({
          overrideId: "base-schedule",
          conflictingOverrideId: "gap",
          timePeriod: {
            start: current.end_at,
            end: next.start_at,
          },
          severity: "error",
          message: "Custody gap detected - child has no assigned custodian",
        });
      }
    }

    return {
      conflicts,
      hasBlockingConflicts: conflicts.some(c => c.severity === "error"),
      recommendedActions: this.generateRecommendations(conflicts),
    };
  }

  /**
   * Create holiday exception overrides for a given time period.
   */
  static createHolidayOverrides(
    holidays: HolidayDefinition[],
    rules: HolidayExceptionRule[],
    startDate: string,
    endDate: string,
    family: Family,
  ): ScheduleOverride[] {
    const overrides: ScheduleOverride[] = [];
    const ruleMap = new Map(rules.map(r => [r.holidayId, r]));

    for (const holiday of holidays) {
      const rule = ruleMap.get(holiday.id);
      if (!rule?.isEnabled) {
        continue;
      }

      // Check if holiday falls within the requested period
      if (holiday.date < startDate || holiday.date >= endDate) {
        continue;
      }

      // Create override for the holiday
      const overrideStart = `${holiday.date}T00:00:00.000Z`;
      const overrideEnd = `${holiday.date}T23:59:59.999Z`;

      overrides.push({
        id: `holiday-${holiday.id}-${family.id}`,
        familyId: family.id,
        type: "holiday",
        title: `${holiday.name} Exception`,
        description: rule.notes || `Holiday exception for ${holiday.name}`,
        effectiveStart: overrideStart,
        effectiveEnd: overrideEnd,
        custodianParentId: rule.custodianParentId,
        sourceEventId: holiday.id,
        priority: 20, // Holiday priority
        status: "active",
        createdAt: new Date().toISOString(),
        createdBy: family.parents[0].id, // System-generated
      });
    }

    return overrides;
  }

  /**
   * Create swap request overrides from approved change requests.
   */
  static createSwapOverrides(
    requests: ScheduleChangeRequest[],
    family: Family,
  ): ScheduleOverride[] {
    return requests
      .filter(r => r.status === "accepted")
      .map(request => ({
        id: `swap-${request.id}`,
        familyId: request.familyId,
        type: "swap",
        title: request.title,
        description: request.description,
        effectiveStart: request.givingUpPeriodStart,
        effectiveEnd: request.givingUpPeriodEnd,
        custodianParentId: this.getOtherParentId(request.requestedBy, family),
        sourceRequestId: request.id,
        priority: 15, // Swap priority
        status: "active",
        createdAt: request.respondedAt || request.createdAt,
        createdBy: request.requestedBy,
      }));
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private static applySingleOverride(
    events: ScheduleEvent[],
    override: ScheduleOverride,
  ): ScheduleEvent[] {
    const overrideStart = new Date(override.effectiveStart);
    const overrideEnd = new Date(override.effectiveEnd);

    return events.reduce((acc: ScheduleEvent[], event) => {
      const eventStart = new Date(event.start_at);
      const eventEnd = new Date(event.end_at);

      // Check if this event overlaps with the override period
      if (eventEnd <= overrideStart || eventStart >= overrideEnd) {
        return [...acc, event]; // No overlap
      }

      // If event has already been overridden by a higher or equal priority override, skip
      if (event.override_id && event.override_priority !== undefined) {
        if (event.override_priority >= override.priority) {
          return [...acc, event]; // Higher or equal priority override already applied
        }
      }

      // Event overlaps with override - split or modify as needed
      if (eventStart < overrideStart && eventEnd > overrideEnd) {
        // Event completely contains override - split into three parts
        return [
          ...acc,
          // Before override
          {
            ...event,
            end_at: override.effectiveStart,
          },
          // During override
          {
            ...event,
            start_at: override.effectiveStart,
            end_at: override.effectiveEnd,
            parent_id: override.custodianParentId,
            custody_type: "override" as const,
            source_pattern: `override-${override.type}`,
            override_id: override.id,
            override_priority: override.priority,
          },
          // After override
          {
            ...event,
            start_at: override.effectiveEnd,
          },
        ];
      } else if (eventStart < overrideStart) {
        // Event starts before override - truncate end
        return [
          ...acc,
          {
            ...event,
            end_at: override.effectiveStart,
          },
        ];
      } else if (eventEnd > overrideEnd) {
        // Event ends after override - truncate start
        return [
          ...acc,
          {
            ...event,
            start_at: override.effectiveEnd,
          },
        ];
      } else {
        // Event completely within override - replace custodian
        return [
          ...acc,
          {
            ...event,
            parent_id: override.custodianParentId,
            custody_type: "override" as const,
            source_pattern: `override-${override.type}`,
            override_id: override.id,
            override_priority: override.priority,
          },
        ];
      }
    }, []);
  }

  private static generateRecommendations(conflicts: OverrideConflict[]): string[] {
    const recommendations: string[] = [];

    for (const conflict of conflicts) {
      switch (conflict.resolution) {
        case "supersede":
          recommendations.push(`Consider superseding override ${conflict.overrideId} with ${conflict.conflictingOverrideId}`);
          break;
        case "cancel":
          recommendations.push(`Cancel override ${conflict.overrideId} due to conflict with ${conflict.conflictingOverrideId}`);
          break;
        case "merge":
          recommendations.push(`Merge overlapping overrides ${conflict.overrideId} and ${conflict.conflictingOverrideId}`);
          break;
        default:
          recommendations.push(`Review conflict between ${conflict.overrideId} and ${conflict.conflictingOverrideId}`);
      }
    }

    return recommendations;
  }

  private static getOtherParentId(requestedBy: ParentId, family: Family): ParentId {
    const otherParent = family.parents.find(p => p.id !== requestedBy);
    if (!otherParent) {
      throw new Error(`Could not find other parent for requestedBy: ${requestedBy}`);
    }
    return otherParent.id;
  }
}

/**
 * KidSchedule – Holiday Override Generator (CAL-008)
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
import { logEvent } from "@/lib/observability/logger";
import type { Parent } from "@/lib";
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
      (r) => r.approvalStatus === "approved" && r.isEnabled === true,
    );

    if (approvedRules.length === 0) {
      return [];
    }
  } catch (error) {
    logEvent("warn", "Failed to fetch approved rules, continuing without", {
      familyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  // ─── Fetch family, parents, and holiday definitions ──────────────────────
  let dbFamily;
  let parents;
  let holidays;
  try {
    dbFamily = await db.families.findById(familyId);
    if (!dbFamily) {
      logEvent("warn", "Family not found", { familyId });
      return [];
    }

    // Fetch parents to compose full Family domain object
    parents = await db.parents.findByFamilyId(familyId);
    if (!parents || parents.length < 2) {
      logEvent("warn", "Family does not have both parents configured", { familyId });
      return [];
    }

    // Fetch holiday definitions for jurisdiction (default to "US")
    const jurisdiction = "US";
    holidays = await db.holidays.findByDateRange(jurisdiction, startDate, endDate);
  } catch (error) {
    logEvent("warn", "Failed to fetch family data or holiday definitions", {
      familyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  // ─── Compose domain Family object from database entities ────────────────
  const family: Family = {
    id: dbFamily.id,
    parents: parents.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      avatarUrl: p.avatarUrl ?? undefined,
      phone: p.phone ?? undefined,
    })) as [Parent, Parent],
    children: [],
    custodyAnchorDate: dbFamily.custodyAnchorDate,
    schedule: {
      id: "",
      name: "Schedule",
      blocks: [],
      transitionHour: 17,
    },
  };

  // ─── Generate overrides using engine ────────────────────────────────────
  // Note: This is synchronous, no error handling needed
  // Filter to only standard holiday types (exclude "custom" which is storage-only)
  const standardHolidays = holidays.filter((h) => h.type !== "custom") as HolidayDefinition[];

  const overrides = ScheduleOverrideEngine.createHolidayOverrides(
    standardHolidays,
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
        type: override.type,
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
      createdAt: override.createdAt,
      createdBy: override.createdBy,
      notes: override.notes,
    }));
  } catch (error) {
    logEvent("error", "Failed to persist holiday overrides, using in-memory overrides", {
      familyId,
      overrideCount: overrides.length,
      error: error instanceof Error ? error.message : String(error),
    });
    // Return in-memory overrides despite persistence failure
    // This allows the schedule to still apply them for the current request
    return overrides;
  }
}
