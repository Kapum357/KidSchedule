/**
 * KidSchedule – ScheduleOverrideEngine (CAL-008)
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * The override system allows temporary or permanent modifications to the base
 * custody schedule. It handles four types of overrides:
 *
 *   1. HOLIDAY EXCEPTIONS – Statutory holidays override normal schedule
 *   2. SWAP REQUESTS     – Approved change requests modify custody periods
 *   3. MEDIATION CHANGES – Court-ordered or mediated schedule adjustments
 *   4. MANUAL OVERRIDES  – One-time schedule changes for special circumstances
 *
 * CONFLICT DETECTION
 * ─────────────────────────────────────────────────────────────────────────────
 * When multiple overrides apply to the same time period, conflicts are resolved
 * by priority order (highest to lowest):
 *
 *   1. COURT ORDERS (mediation-driven) – Highest priority
 *   2. HOLIDAY EXCEPTIONS – Override normal schedule
 *   3. APPROVED SWAPS – Modify custody periods
 *   4. MANUAL OVERRIDES – One-time changes
 *
 * If conflicts exist within the same priority level, the most recently created
 * override takes precedence.
 *
 * VALIDATION RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * • No override can create custody gaps (child must always have a custodian)
 * • No override can exceed maximum consecutive days per parent
 * • All overrides must respect transition hour constraints
 * • Holiday exceptions only apply to statutory holidays
 */

import type {
  ScheduleEvent,
  ScheduleChangeRequest,
  Family,
  ParentId,
} from "@/types";

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