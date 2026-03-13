/**
 * KidSchedule – CustodyComplianceEngine
 *
 * Generates custody compliance reports by comparing actual calendar events
 * against the scheduled custody arrangements. Tracks actual vs. scheduled time,
 * compliance percentages, and generates audit trails for legal proceedings.
 */

import type {
  Family,
  Parent,
  Child,
  CalendarEvent,
  CustodySchedule,
  ScheduleBlock,
  EventCategory,
  ConfirmationStatus,
  ChangeRequestStatus,
  ScheduleOverride,
  ScheduleChangeRequest,
} from "@/lib";
import { getDb } from "@/lib/persistence";

export interface CustodyPeriod {
  startTime: string; // ISO timestamp
  endTime: string;   // ISO timestamp
  scheduledParentId: string;
  actualParentId?: string;
  eventId?: string;
  compliance: boolean;
  notes?: string;
}

export interface CustodyComplianceReport {
  familyId: string;
  reportPeriod: {
    startDate: string; // ISO date
    endDate: string;   // ISO date
  };
  parents: Parent[];
  summary: {
    totalScheduledTime: number; // hours
    totalActualTime: number;    // hours
    compliancePercentage: number;
    totalDeviations: number;
    totalOverrides: number;
  };
  periods: CustodyPeriod[];
  overrides: ScheduleOverride[];
  changeRequests: ScheduleChangeRequest[];
  generatedAt: string;
}

export interface ComplianceMetrics {
  parentId: string;
  scheduledHours: number;
  actualHours: number;
  compliancePercentage: number;
  deviationHours: number;
  overrideCount: number;
}

export class CustodyComplianceEngine {
  /**
   * Generate a custody compliance report for a family over a date range.
   */
  async generateComplianceReport(
    familyId: string,
    startDate: string,
    endDate: string
  ): Promise<CustodyComplianceReport> {
    const db = getDb();

    // Get family data
    const dbFamily = await db.families.findById(familyId);
    if (!dbFamily) {
      throw new Error(`Family ${familyId} not found`);
    }

    // Get parents, children, and schedule to construct full Family object
    const [dbParents, dbChildren] = await Promise.all([
      db.parents.findByFamilyId(familyId),
      db.children.findByFamilyId(familyId),
    ]);

    // Get schedule directly from database
    const { sql } = await import("@/lib/persistence/postgres/client");
    const scheduleRows = await sql`
      SELECT id, name, transition_hour, blocks, is_active
      FROM custody_schedules
      WHERE id = ${dbFamily.scheduleId} AND is_active = true
      LIMIT 1
    `;

    if (scheduleRows.length === 0) {
      throw new Error(`Active schedule not found for family ${familyId}`);
    }

    const dbSchedule = scheduleRows[0];

    // Convert DbParent[] to Parent[]
    const parents: [Parent, Parent] = dbParents.map(dbParent => ({
      id: dbParent.id,
      name: dbParent.name,
      email: dbParent.email,
      avatarUrl: dbParent.avatarUrl,
      phone: dbParent.phone,
    })) as [Parent, Parent];

    // Convert DbChild[] to Child[]
    const children: Child[] = dbChildren.map(dbChild => ({
      id: dbChild.id,
      firstName: dbChild.firstName,
      lastName: dbChild.lastName,
      dateOfBirth: dbChild.dateOfBirth,
      avatarUrl: dbChild.avatarUrl,
    }));

    // Convert DbCustodySchedule to CustodySchedule
    const schedule: CustodySchedule = {
      id: dbSchedule.id,
      name: dbSchedule.name,
      transitionHour: dbSchedule.transitionHour,
      blocks: dbSchedule.blocks as ScheduleBlock[],
    };

    // Construct full Family object
    const family: Family = {
      id: dbFamily.id,
      parents,
      children,
      custodyAnchorDate: dbFamily.custodyAnchorDate,
      schedule,
    };

    // Create custody engine for this family
    const custodyEngine = new CustodyEngine(family);

    // Get calendar events for the period
    const dbCalendarEvents = await db.calendarEvents.findByFamilyIdAndDateRange(
      familyId,
      startDate,
      endDate
    );

    // Convert DbCalendarEvent[] to CalendarEvent[]
    const calendarEvents: CalendarEvent[] = dbCalendarEvents.map(dbEvent => ({
      id: dbEvent.id,
      familyId: dbEvent.familyId,
      title: dbEvent.title,
      description: dbEvent.description,
      category: dbEvent.category as EventCategory,
      startAt: dbEvent.startAt,
      endAt: dbEvent.endAt,
      allDay: dbEvent.allDay,
      location: dbEvent.location,
      parentId: dbEvent.parentId,
      confirmationStatus: dbEvent.confirmationStatus as ConfirmationStatus,
      createdBy: dbEvent.createdBy,
    }));

    // Get schedule overrides for the period
    const overrides = await db.scheduleOverrides.findByTimeRange(
      familyId,
      startDate,
      endDate,
    );

    // Get change requests for the period
    const dbChangeRequests = await db.scheduleChangeRequests.findByFamilyId(familyId);

    // Convert DbScheduleChangeRequest[] to ScheduleChangeRequest[]
    const changeRequests: ScheduleChangeRequest[] = dbChangeRequests.map(dbRequest => ({
      id: dbRequest.id,
      familyId: dbRequest.familyId,
      requestedBy: dbRequest.requestedBy,
      title: dbRequest.title,
      description: dbRequest.description,
      givingUpPeriodStart: dbRequest.givingUpPeriodStart,
      givingUpPeriodEnd: dbRequest.givingUpPeriodEnd,
      requestedMakeUpStart: dbRequest.requestedMakeUpStart,
      requestedMakeUpEnd: dbRequest.requestedMakeUpEnd,
      status: dbRequest.status as ChangeRequestStatus,
      createdAt: dbRequest.createdAt,
      respondedAt: dbRequest.respondedAt,
      responseNote: dbRequest.responseNote,
    }));

    // Generate compliance periods
    const periods = await this.generateCompliancePeriods(
      custodyEngine,
      startDate,
      endDate,
      calendarEvents
    );

    // Calculate summary metrics
    const summary = this.calculateSummaryMetrics(periods);

    return {
      familyId,
      reportPeriod: { startDate, endDate },
      parents: family.parents,
      summary,
      periods,
      overrides,
      changeRequests,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate detailed compliance periods by comparing scheduled vs actual custody.
   */
  private async generateCompliancePeriods(
    custodyEngine: CustodyEngine,
    startDate: string,
    endDate: string,
    calendarEvents: CalendarEvent[],
  ): Promise<CustodyPeriod[]> {
    const periods: CustodyPeriod[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Process each day in the range
    for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
      const dayStart = new Date(current);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(current);
      const END_OF_DAY_HOURS = 23;
      const END_OF_DAY_MINUTES = 59;
      const END_OF_DAY_SECONDS = 59;
      const END_OF_DAY_MS = 999;
      dayEnd.setHours(END_OF_DAY_HOURS, END_OF_DAY_MINUTES, END_OF_DAY_SECONDS, END_OF_DAY_MS);

      const scheduledTransitions = custodyEngine.getTransitionsInRange(dayStart, dayEnd);

      // Apply overrides
      const effectiveTransitions = this.applyOverridesToTransitions(
        scheduledTransitions,
      );

      // Create periods for each transition
      for (let i = 0; i < effectiveTransitions.length; i++) {
        const transition = effectiveTransitions[i];
        const periodStart = new Date(transition.timestamp);
        // Calculate period end
        let periodEnd: Date;
        if (i < effectiveTransitions.length - 1) {
          periodEnd = new Date(effectiveTransitions[i + 1].timestamp);
        } else {
          periodEnd = new Date(dayEnd);
        }

        // Find actual calendar event for this period
        const actualEvent = calendarEvents.find(event => {
          const eventStart = new Date(event.startAt);
          const eventEnd = new Date(event.endAt);
          return eventStart < periodEnd && eventEnd > periodStart;
        });

        // Set notes based on event
        let notes: string;
        if (actualEvent) {
          notes = `Event: ${actualEvent.title}`;
        } else {
          notes = 'No calendar event recorded';
        }

        const period: CustodyPeriod = {
          startTime: periodStart.toISOString(),
          endTime: periodEnd.toISOString(),
          scheduledParentId: transition.toParentId,
          actualParentId: actualEvent?.parentId,
          eventId: actualEvent?.id,
          compliance: actualEvent?.parentId === transition.toParentId,
          notes,
        };

        periods.push(period);
      }
    }

    return periods;
  }

  /**
   * Apply schedule overrides to the scheduled transitions.
   */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private applyOverridesToTransitions(
    transitions: any[],
  ): any[] {
    // For now, return transitions as-is. Full override logic would be complex.
    // This is a simplified implementation.
    return transitions;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /**
   * Calculate summary metrics from compliance periods.
   */
  private calculateSummaryMetrics(periods: CustodyPeriod[]): CustodyComplianceReport['summary'] {
    let totalScheduledTime = 0;
    let totalActualTime = 0;
    let totalDeviations = 0;
    const totalOverrides = 0; // Would be calculated from overrides

    for (const period of periods) {
      const duration = (new Date(period.endTime).getTime() - new Date(period.startTime).getTime()) / (1000 * 60 * 60); // hours

      totalScheduledTime += duration;

      if (period.actualParentId) {
        totalActualTime += duration;
        if (!period.compliance) {
          totalDeviations++;
        }
      }
    }

    // Calculate compliance percentage
    let compliancePercentage: number;
    if (totalScheduledTime > 0) {
      compliancePercentage = (totalActualTime / totalScheduledTime) * 100;
    } else {
      compliancePercentage = 0;
    }

    return {
      totalScheduledTime,
      totalActualTime,
      compliancePercentage,
      totalDeviations,
      totalOverrides,
    };
  }

  /**
   * Get compliance metrics for each parent.
   */
  calculateParentMetrics(
    report: CustodyComplianceReport,
  ): ComplianceMetrics[] {
    const parentMetrics = new Map<string, ComplianceMetrics>();

    // Initialize metrics for each parent
    for (const parent of report.parents) {
      parentMetrics.set(parent.id, {
        parentId: parent.id,
        scheduledHours: 0,
        actualHours: 0,
        compliancePercentage: 0,
        deviationHours: 0,
        overrideCount: 0,
      });
    }

    // Calculate metrics from periods
    for (const period of report.periods) {
      const duration = (new Date(period.endTime).getTime() - new Date(period.startTime).getTime()) / (1000 * 60 * 60);

      const scheduledMetrics = parentMetrics.get(period.scheduledParentId);
      if (scheduledMetrics) {
        scheduledMetrics.scheduledHours += duration;
      }

      if (period.actualParentId) {
        const actualMetrics = parentMetrics.get(period.actualParentId);
        if (actualMetrics) {
          actualMetrics.actualHours += duration;
        }
      }
    }

    // Calculate percentages and deviations
    for (const metrics of parentMetrics.values()) {
      if (metrics.scheduledHours > 0) {
        metrics.compliancePercentage = (metrics.actualHours / metrics.scheduledHours) * 100;
        metrics.deviationHours = metrics.scheduledHours - metrics.actualHours;
      }
    }

    return Array.from(parentMetrics.values());
  }
}

/**
 * KidSchedule – CustodyEngine
**/

import type {
  CustodyStatus,
  ScheduleTransition,
} from "@/lib";

/** Milliseconds per calendar day – used throughout */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * A modulo that always returns a non-negative result, even when `a` is
 * negative (i.e., query date is before anchor date).
 */
function safeMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/**
 * Converts a schedule's blocks into an array of cumulative millisecond
 * thresholds from the start of the cycle.
 *
 * Example – 2-2-3 pattern (days: [2, 2, 3]):
 *   [172_800_000, 345_600_000, 604_800_000]
 *              ↑ 2d            ↑ 4d          ↑ 7d
 */
function buildThresholds(blocks: CustodySchedule["blocks"]): number[] {
  const thresholds: number[] = [];
  let accumulated = 0;
  for (const block of blocks) {
    accumulated += block.days * MS_PER_DAY;
    thresholds.push(accumulated);
  }
  return thresholds;
}

// ─── Block Resolution ─────────────────────────────────────────────────────────

interface BlockPosition {
  /** 0-based index into schedule.blocks */
  blockIndex: number;
  /** Absolute timestamp (ms) when this block started */
  blockStartMs: number;
  /** Absolute timestamp (ms) when this block ends / next block begins */
  blockEndMs: number;
}

/**
 * Given any timestamp, resolve which schedule block is active and the
 * precise start/end timestamps of that block occurrence.
 *
 * Complexity: O(B) where B = blocks.length (typically ≤ 12).
 */
function resolveBlock(
  atMs: number,
  anchorMs: number,
  schedule: CustodySchedule,
  thresholds: number[]
): BlockPosition {
  const cycleDurationMs = thresholds.at(-1)!;
  const positionMs = safeMod(atMs - anchorMs, cycleDurationMs);

  // Which cycle number are we in?  (Can be negative for pre-anchor dates.)
  const cycleOffset =
    Math.floor((atMs - anchorMs) / cycleDurationMs) * cycleDurationMs;
  const cycleStartMs = anchorMs + cycleOffset;

  // Walk block thresholds until we find the one containing positionMs.
  let blockIndex = 0;
  let blockStartMs = cycleStartMs;

  for (let i = 0; i < thresholds.length; i++) {
    const blockEndMs = cycleStartMs + thresholds[i];
    if (positionMs < thresholds[i]) {
      blockIndex = i;
      blockStartMs = i === 0 ? cycleStartMs : cycleStartMs + thresholds[i - 1];
      return { blockIndex, blockStartMs, blockEndMs };
    }
  }

  // Fallback: should be unreachable given safeMod guarantees.
  return {
    blockIndex: 0,
    blockStartMs: cycleStartMs,
    blockEndMs: cycleStartMs + thresholds[0],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class CustodyEngine {
  private readonly family: Family;
  private readonly schedule: CustodySchedule;
  private readonly anchorMs: number;
  private readonly thresholds: number[];
  private readonly parentMap: Map<string, Parent>;

  /**
   * @param family  Complete family record including both parents and schedule.
   *
   * The anchor timestamp is derived from `family.custodyAnchorDate` treated as
   * a local calendar date at the schedule's `transitionHour`.  Callers MUST
   * ensure all Date objects passed to public methods use the same timezone.
   */
  constructor(family: Family) {
    this.family = family;
    this.schedule = family.schedule;

    // Build anchor: the moment block[0] first became active.
    // Parse the ISO date to midnight UTC, then shift to local transition hour.
    const [year, month, day] = family.custodyAnchorDate
      .split("-")
      .map(Number) as [number, number, number];
    const anchorDate = new Date(year, month - 1, day, this.schedule.transitionHour, 0, 0, 0);
    this.anchorMs = anchorDate.getTime();

    this.thresholds = buildThresholds(this.schedule.blocks);

    // Index parents for O(1) lookup by id.
    this.parentMap = new Map<string, Parent>(
      family.parents.map((p) => [p.id, p])
    );
  }

  // ── Core Query Methods ───────────────────────────────────────────────────

  /**
   * Returns the full custody status at the given moment (defaults to now).
   *
   * @example
   * const engine = new CustodyEngine(family);
   * const status = engine.getStatus();
   * console.log(`${status.currentParent.name} has custody.`);
   * console.log(`Next transition in ${status.minutesUntilTransition} minutes.`);
   */
  getStatus(at: Date = new Date()): CustodyStatus {
    const atMs = at.getTime();
    const pos = resolveBlock(atMs, this.anchorMs, this.schedule, this.thresholds);
    const block = this.schedule.blocks[pos.blockIndex];
    const parent = this.parentMap.get(block.parentId);

    if (!parent) {
      throw new Error(
        `CustodyEngine: parentId "${block.parentId}" not found in family.parents`
      );
    }

    const minutesUntilTransition = Math.max(
      0,
      Math.floor((pos.blockEndMs - atMs) / 60_000)
    );

    return {
      currentParent: parent,
      periodStart: new Date(pos.blockStartMs),
      periodEnd: new Date(pos.blockEndMs),
      minutesUntilTransition,
    };
  }

  /**
   * Returns the next N custody transitions after the given moment.
   *
   * Iterates through successive block boundaries – O(N × B) where B is
   * blocks.length.  For typical N ≤ 30 and B ≤ 12 this is negligible.
   *
   * @param count  How many upcoming transitions to return (default 5).
   */
  getUpcomingTransitions(at: Date = new Date(), count = 5): ScheduleTransition[] {
    const transitions: ScheduleTransition[] = [];
    let curMs = at.getTime();

    for (let i = 0; i < count; i++) {
      const current = resolveBlock(curMs, this.anchorMs, this.schedule, this.thresholds);
      const fromBlock = this.schedule.blocks[current.blockIndex];
      const nextBlockIndex = (current.blockIndex + 1) % this.schedule.blocks.length;
      const toBlock = this.schedule.blocks[nextBlockIndex];

      const fromParent = this.parentMap.get(fromBlock.parentId);
      const toParent = this.parentMap.get(toBlock.parentId);

      if (!fromParent || !toParent) {
        throw new Error("CustodyEngine: invalid parentId in schedule blocks");
      }

      transitions.push({
        at: new Date(current.blockEndMs),
        fromParent,
        toParent,
      });

      // Advance past this transition to find the next one.
      curMs = current.blockEndMs + 1;
    }

    return transitions;
  }

  /**
   * Returns every transition that falls within [rangeStart, rangeEnd].
   *
   * Useful for populating a month view on the calendar.
   *
   * Complexity: O((rangeMs / MS_PER_DAY) × (1/avgBlockDays)) – proportional
   * to the number of transitions in the range, which is bounded by the
   * calendar range requested.
   */
  getTransitionsInRange(rangeStart: Date, rangeEnd: Date): ScheduleTransition[] {
    const transitions: ScheduleTransition[] = [];
    let curMs = rangeStart.getTime();
    const endMs = rangeEnd.getTime();

    while (curMs <= endMs) {
      const pos = resolveBlock(curMs, this.anchorMs, this.schedule, this.thresholds);
      const transitionMs = pos.blockEndMs;

      if (transitionMs > endMs) break;

      const fromBlock = this.schedule.blocks[pos.blockIndex];
      const nextIndex = (pos.blockIndex + 1) % this.schedule.blocks.length;
      const toBlock = this.schedule.blocks[nextIndex];

      const fromParent = this.parentMap.get(fromBlock.parentId);
      const toParent = this.parentMap.get(toBlock.parentId);

      if (!fromParent || !toParent) break;

      transitions.push({ at: new Date(transitionMs), fromParent, toParent });

      // Advance to just after this transition.
      curMs = transitionMs + 1;
    }

    return transitions;
  }

  /**
   * Calculates each parent's custody percentage over a given window.
   *
   * Returns a map from parentId → percentage (0–100, two decimal places).
   * All percentages sum to 100.
   *
   * Complexity: O(B) – one pass over the schedule blocks.
   */
  getCustodyPercentages(): Record<string, number> {
    const cycleDays = this.schedule.blocks.reduce((s, b) => s + b.days, 0);
    const daysByParent: Record<string, number> = {};

    for (const block of this.schedule.blocks) {
      daysByParent[block.parentId] =
        (daysByParent[block.parentId] ?? 0) + block.days;
    }

    const result: Record<string, number> = {};
    for (const [parentId, days] of Object.entries(daysByParent)) {
      result[parentId] = Math.round((days / cycleDays) * 10_000) / 100;
    }
    return result;
  }

  /**
   * Determines which parent has custody on every day in a month.
   *
   * Returns a  Map<"YYYY-MM-DD" string, Parent> for fast calendar rendering.
   *
   * Complexity: O(D × B) where D = days in month ≤ 31.
   */
  getMonthCustodyMap(year: number, month: number): Map<string, Parent> {
    const map = new Map<string, Parent>();
    const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based

    for (let d = 1; d <= daysInMonth; d++) {
      // Query at noon local time to avoid DST boundary issues.
      const queryDate = new Date(year, month - 1, d, 12, 0, 0, 0);
      const status = this.getStatus(queryDate);
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      map.set(key, status.currentParent);
    }

    return map;
  }
}

// ─── Factory Helpers ──────────────────────────────────────────────────────────

/**
 * Built-in schedule presets so callers don't have to construct blocks by hand.
 *
 * @param parentAId  ID of the parent who holds the first block.
 * @param parentBId  ID of the other parent.
 */
export const SchedulePresets = {
  /** Classic alternating full weeks.  7-day cycle. */
  alternatingWeeks(parentAId: string, parentBId: string): CustodySchedule["blocks"] {
    return [
      { parentId: parentAId, days: 7, label: "Week A" },
      { parentId: parentBId, days: 7, label: "Week B" },
    ];
  },

  /**
   * 2-2-3 rotation – popular because each parent gets every other weekend.
   * 14-day cycle.
   */
  twoTwoThree(parentAId: string, parentBId: string): CustodySchedule["blocks"] {
    return [
      { parentId: parentAId, days: 2, label: "Mon–Tue A" },
      { parentId: parentBId, days: 2, label: "Wed–Thu B" },
      { parentId: parentAId, days: 3, label: "Fri–Sun A" },
      { parentId: parentBId, days: 2, label: "Mon–Tue B" },
      { parentId: parentAId, days: 2, label: "Wed–Thu A" },
      { parentId: parentBId, days: 3, label: "Fri–Sun B" },
    ];
  },

  /**
   * 3-4-4-3 rotation.  14-day cycle.
   */
  threeFourFourThree(parentAId: string, parentBId: string): CustodySchedule["blocks"] {
    return [
      { parentId: parentAId, days: 3, label: "3 days A" },
      { parentId: parentBId, days: 4, label: "4 days B" },
      { parentId: parentAId, days: 4, label: "4 days A" },
      { parentId: parentBId, days: 3, label: "3 days B" },
    ];
  },
} as const;

/**
 * KidSchedule – Custody Schedule Generator (CAL-003)
 *
 * A deterministic, timezone-aware custody schedule event generator supporting
 * four baseline patterns: 7-7, 2-2-3, 5-2-2-5, and Every-Other-Weekend (EOW).
 */

import type {
  ParentId,
  SchedulePattern,
  ScheduleGeneratorInput,
  ScheduleGeneratorOutput,
  ScheduleEvent,
  ScheduleGeneratorDiagnostics,
} from "@/lib";
import { SchedulePattern as SP } from "@/lib";

// ─── Constants ────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const ISO_DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

// Default transition time (5 PM = 17:00).
const DEFAULT_TRANSITION_HOUR = 17;
const DEFAULT_TRANSITION_MINUTE = 0;

// EOW defaults.
const EOW_DEFAULT_FRIDAY_HOUR = 18; // 6 PM Friday pickup
const EOW_DEFAULT_SUNDAY_HOUR = 18; // 6 PM Sunday return

// ─── Internal Type Definitions ────────────────────────────────────────────────

/**
 * Represents a segment within the 14-day (or weekend) cycle template.
 */
interface SegmentTemplate {
  parentId: ParentId;
  durationDays: number;
  label?: string;
}

/**
 * Timezone-adjusted date boundaries for a segment.
 */
/**
 * Internal validation result.
 */
interface ValidationError {
  field: string;
  message: string;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Validates that a date string conforms to YYYY-MM-DD format and is a valid date.
 */
function validateISODate(dateStr: string): { valid: boolean; error?: string } {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) {
    return { valid: false, error: `Invalid date format: ${dateStr}; expected YYYY-MM-DD` };
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  // Check for valid date.
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return { valid: false, error: `Invalid date: ${dateStr}` };
  }
  return { valid: true };
}

/**
 * Validates that a timezone string is a valid IANA timezone.
 * Uses Intl.DateTimeFormat to check validity.
 */
function validateTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a date string (YYYY-MM-DD) and returns a Date object at midnight UTC.
 */
function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Formats a Date as ISO 8601 string with timezone abbreviation in bracket notation.
 * Returns format: "2024-01-15T17:00:00-05:00 (EST)"
 */
function formatISOWithTimezone(date: Date, timezone: string): string {
  // Get timezone offset string using Intl API.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const second = parts.find((p) => p.type === "second")?.value ?? "";

  // Compute offset from timezone.
  const localDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  const offsetMs = date.getTime() - localDate.getTime();
  const offsetHours = Math.floor(Math.abs(offsetMs) / MS_PER_HOUR);
  const offsetMinutes = Math.floor((Math.abs(offsetMs) % MS_PER_HOUR) / MS_PER_MINUTE);
  const offsetSign = offsetMs >= 0 ? "+" : "-";
  const offsetStr = `${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

  const localIso = `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetStr}`;
  return localIso;
}

/**
 * Returns a UTC Date representing a specific local time on a given date in a timezone.
 * For example, dateAtTimeInTimezone("2024-01-15", 17, 0, "America/New_York")
 * returns the UTC moment when it's 5 PM on 2024-01-15 EST.
 */
function dateAtTimeInTimezone(
  dateStr: string,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);

  // Create a UTC date at the requested local time.
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  // Get the local time for this UTC moment.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(utcDate);
  const localYear = parseInt(parts.find((p) => p.type === "year")?.value ?? "2024");
  const localMonth = parseInt(parts.find((p) => p.type === "month")?.value ?? "01") - 1;
  const localDay = parseInt(parts.find((p) => p.type === "day")?.value ?? "01");
  const localHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "00");
  const localMinute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "00");

  // Reconstruct the local date as UTC.
  const localAsUTC = new Date(Date.UTC(localYear, localMonth, localDay, localHour, localMinute, 0, 0));

  // The offset.
  const offsetMs = utcDate.getTime() - localAsUTC.getTime();

  // Adjust so the result is midnight in the target timezone.
  const result = new Date(utcDate.getTime() - offsetMs);
  return result;
}

/**
 * Adds days to a date string (YYYY-MM-DD), handling year/month/day rollovers.
 */
function addDaysToDateString(dateStr: string, days: number): string {
  const date = parseISODate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculates the difference in calendar days between two YYYY-MM-DD date strings.
 */
function daysBetweenDateStrings(startStr: string, endStr: string): number {
  const start = parseISODate(startStr);
  const end = parseISODate(endStr);
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/**
 * Detects if a UTC date falls within a DST transition period.
 * Returns a warning message if DST adjustment was needed.
 */
function detectDSTTransition(date: Date, timezone: string): string | null {
  // Check if the offset changes when we add/subtract a minute.
  const formatter = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);

    const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "2024");
    const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "01") - 1;
    const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "01");
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "00");
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "00");
    return new Date(Date.UTC(year, month, day, hour, minute, 0, 0)).getTime();
  };

  const offset1 = formatter(date);
  const testDate = new Date(date.getTime() + MS_PER_HOUR);
  const offset2 = formatter(testDate);

  if (offset1 !== offset2) {
    return `DST transition detected near ${date.toISOString()}.`;
  }

  return null;
}

// ─── Template Building ────────────────────────────────────────────────────────

/**
 * Builds the segment template for the given pattern.
 * Each template repeats cyclically from the anchor date.
 */
function buildPatternTemplate(pattern: SchedulePattern, parentA: ParentId, parentB: ParentId): SegmentTemplate[] {
  switch (pattern) {
    case SP.SEVEN_SEVEN:
      return [
        { parentId: parentA, durationDays: 7, label: "Week A" },
        { parentId: parentB, durationDays: 7, label: "Week B" },
      ];

    case SP.TWO_TWO_THREE:
      return [
        { parentId: parentA, durationDays: 2, label: "Mon–Tue A" },
        { parentId: parentB, durationDays: 2, label: "Wed–Thu B" },
        { parentId: parentA, durationDays: 3, label: "Fri–Sun A" },
        { parentId: parentB, durationDays: 2, label: "Mon–Tue B" },
        { parentId: parentA, durationDays: 2, label: "Wed–Thu A" },
        { parentId: parentB, durationDays: 3, label: "Fri–Sun B" },
      ];

    case SP.FIVE_TWO_TWO_FIVE:
      return [
        { parentId: parentA, durationDays: 5, label: "Mon–Fri A" },
        { parentId: parentB, durationDays: 2, label: "Sat–Sun B" },
        { parentId: parentB, durationDays: 2, label: "Mon–Tue B" },
        { parentId: parentA, durationDays: 5, label: "Wed–Sun A" },
      ];

    case SP.EOW:
      // EOW is handled separately.
      return [];

    default:
      throw new Error(`Unknown pattern: ${pattern}`);
  }
}

// ─── Event Generation ────────────────────────────────────────────────────────

/**
 * Generates custody events for a given date range using the specified pattern.
 * Creates events for complete custody blocks, not per-day events.
 */
function generateBaseEvents(
  input: ScheduleGeneratorInput,
  template: SegmentTemplate[],
  cycleLengthDays: number
): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const { family_id, child_id, pattern, timezone, date_range, anchor, exchange_times } = input;

  const anchorDate = anchor.anchor_date;
  const anchorParentId = anchor.anchor_parent_id;
  const transitionHour = exchange_times?.hour ?? DEFAULT_TRANSITION_HOUR;
  const transitionMinute = exchange_times?.minute ?? DEFAULT_TRANSITION_MINUTE;

  const dateRangeStart = date_range.start;
  const dateRangeEnd = date_range.end;

  // Find the segment index at the anchor.
  let segmentIndexAtAnchor = 0;
  for (let i = 0; i < template.length; i++) {
    if (template[i].parentId === anchorParentId) {
      segmentIndexAtAnchor = i;
      break;
    }
  }

  // Calculate how many days from anchor to the start of our range.
  const distanceFromAnchor = daysBetweenDateStrings(anchorDate, dateRangeStart);

  // Find which segment we're in at the start of the range by walking the template.
  let currentSegmentIndex = segmentIndexAtAnchor;
  let daysWalked = 0;

  while (daysWalked < distanceFromAnchor) {
    const segmentDays = template[currentSegmentIndex].durationDays;
    if (daysWalked + segmentDays <= distanceFromAnchor) {
      daysWalked += segmentDays;
      currentSegmentIndex = (currentSegmentIndex + 1) % template.length;
    } else {
      // We're in the middle of this segment; split it.
      break;
    }
  }

  // Now generate events starting from the range start.
  let currentDateStr = dateRangeStart;

  while (currentDateStr < dateRangeEnd) {
    const segment = template[currentSegmentIndex];
    const segmentDurationDays = segment.durationDays;

    // Calculate the end date of this segment (from the segment start).
    let segmentEndDateStr = addDaysToDateString(currentDateStr, segmentDurationDays);

    // If we're mid-segment (only at the very first iteration if distanceFromAnchor is not divisible),
    // the segment ends at the original schedule date, not extended.
    // Actually, let me reconsider: if we're mid-segment, we should end at the calculated boundary.

    // Clamp the segment end to the range end.
    if (daysBetweenDateStrings(segmentEndDateStr, dateRangeEnd) < 0) {
      segmentEndDateStr = dateRangeEnd;
    }

    // Build timestamps.
    const startAtUtc = dateAtTimeInTimezone(currentDateStr, transitionHour, transitionMinute, timezone);
    const endAtUtc = dateAtTimeInTimezone(segmentEndDateStr, transitionHour, transitionMinute, timezone);

    const startAt = formatISOWithTimezone(startAtUtc, timezone);
    const endAt = formatISOWithTimezone(endAtUtc, timezone);

    // Stable cycle ID.
    const daysSinceAnchor = daysBetweenDateStrings(anchorDate, currentDateStr);
    const cycleNumber = Math.floor(daysSinceAnchor / cycleLengthDays);
    const cycleId = `${pattern}-cycle-${cycleNumber}-seg-${currentSegmentIndex}`;

    events.push({
      start_at: startAt,
      end_at: endAt,
      parent_id: segment.parentId,
      custody_type: "base",
      source_pattern: pattern,
      cycle_id: cycleId,
      child_id,
      family_id: family_id,
    });

    // Move to next segment.
    currentDateStr = segmentEndDateStr;
    currentSegmentIndex = (currentSegmentIndex + 1) % template.length;
  }

  return events;
}

/**
 * Generates custody events specifically for Every-Other-Weekend pattern.
 */
function generateEOWEvents(input: ScheduleGeneratorInput): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const { family_id, child_id, pattern, timezone, date_range, anchor, exchange_times } = input;

  const anchorDate = anchor.anchor_date;
  const anchorParentId = anchor.anchor_parent_id;
  const otherParentId = anchor.other_parent_id;

  // EOW: Friday 18:00 to Sunday 18:00, alternating.
  const fridayHour = exchange_times?.hour ?? EOW_DEFAULT_FRIDAY_HOUR;
  const sundayHour = exchange_times?.hour ?? EOW_DEFAULT_SUNDAY_HOUR;

  const dateRangeStart = date_range.start;
  const dateRangeEnd = date_range.end;

  const rangeStartDate = parseISODate(dateRangeStart);
  const rangeEndDate = parseISODate(dateRangeEnd);

  // Find the first Friday at or after the range start.
  const currentDate = new Date(rangeStartDate);
  const dayOfWeek = currentDate.getUTCDay();
  const FRIDAY_DAY_INDEX = 5;
  const DAYS_PER_WEEK = 7;
  const daysUntilFriday = (FRIDAY_DAY_INDEX - dayOfWeek + DAYS_PER_WEEK) % DAYS_PER_WEEK || DAYS_PER_WEEK;
  currentDate.setUTCDate(currentDate.getUTCDate() + daysUntilFriday);

  // Calculate which parent owns this first weekend based on anchor alignment.
  const EOW_CYCLE_LENGTH = 14;
  let weekendCount = 0;
  const iterationDate = new Date(currentDate);

  while (iterationDate < rangeEndDate) {
    const iterationFridayStr = iterationDate.toISOString().split("T")[0];
    const sundayDate = new Date(iterationDate);
    sundayDate.setUTCDate(sundayDate.getUTCDate() + 2);
    const sundayStr = sundayDate.toISOString().split("T")[0];

    // Check if this weekend falls within the range.
    if (parseISODate(iterationFridayStr) < rangeEndDate) {
      const startAtUtc = dateAtTimeInTimezone(iterationFridayStr, fridayHour, 0, timezone);
      const endAtUtc = dateAtTimeInTimezone(sundayStr, sundayHour, 0, timezone);

      const startAt = formatISOWithTimezone(startAtUtc, timezone);
      const endAt = formatISOWithTimezone(endAtUtc, timezone);

      // Determine which parent owns this specific weekend.
      const weekendNumberCurrent = Math.floor(daysBetweenDateStrings(anchorDate, iterationFridayStr) / EOW_CYCLE_LENGTH);
      let ownerParentId: ParentId;
      if (weekendNumberCurrent % 2 === 0) {
        ownerParentId = anchorParentId;
      } else {
        ownerParentId = otherParentId;
      }

      const cycleId = `EOW-weekend-${weekendCount}`;

      events.push({
        start_at: startAt,
        end_at: endAt,
        parent_id: ownerParentId,
        custody_type: "base",
        source_pattern: pattern,
        cycle_id: cycleId,
        child_id,
        family_id: family_id,
      });

      weekendCount++;
    }

    // Move to the next Friday (14 days later).
    iterationDate.setUTCDate(iterationDate.getUTCDate() + EOW_CYCLE_LENGTH);
  }

  return events;
}

/**
 * Merges adjacent events with the same parent into single events.
 */
function mergeAdjacentBlocks(events: ScheduleEvent[]): ScheduleEvent[] {
  if (events.length === 0) {
    return events;
  }

  const merged: ScheduleEvent[] = [];
  let current = { ...events[0] };

  for (let i = 1; i < events.length; i++) {
    const next = events[i];

    // Check if adjacent and same parent.
    if (current.parent_id === next.parent_id && current.end_at === next.start_at) {
      // Merge by extending current's end.
      current.end_at = next.end_at;
      // Keep current's cycle_id; overrides would supersede anyway.
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}



// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates the input and returns an array of validation errors.
 */
function validateInput(input: ScheduleGeneratorInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input.family_id || typeof input.family_id !== "string") {
    errors.push({ field: "family_id", message: "family_id must be a non-empty string" });
  }

  if (!input.child_id || typeof input.child_id !== "string") {
    errors.push({ field: "child_id", message: "child_id must be a non-empty string" });
  }

  if (!input.timezone || typeof input.timezone !== "string") {
    errors.push({ field: "timezone", message: "timezone must be a non-empty string" });
  } else if (!validateTimezone(input.timezone)) {
    errors.push({ field: "timezone", message: `Invalid IANA timezone: ${input.timezone}` });
  }

  if (!input.date_range) {
    errors.push({ field: "date_range", message: "date_range is required" });
  } else {
    const startVal = validateISODate(input.date_range.start);
    if (!startVal.valid) {
      errors.push({ field: "date_range.start", message: startVal.error ?? "Invalid date" });
    }

    const endVal = validateISODate(input.date_range.end);
    if (!endVal.valid) {
      errors.push({ field: "date_range.end", message: endVal.error ?? "Invalid date" });
    }

    if (startVal.valid && endVal.valid) {
      if (input.date_range.start >= input.date_range.end) {
        errors.push({
          field: "date_range",
          message: "start must be before end",
        });
      }
    }
  }

  if (!input.anchor) {
    errors.push({ field: "anchor", message: "anchor is required" });
  } else {
    const anchorVal = validateISODate(input.anchor.anchor_date);
    if (!anchorVal.valid) {
      errors.push({ field: "anchor.anchor_date", message: anchorVal.error ?? "Invalid date" });
    }

    if (!input.anchor.anchor_parent_id) {
      errors.push({ field: "anchor.anchor_parent_id", message: "anchor_parent_id is required" });
    }

    if (!input.anchor.other_parent_id) {
      errors.push({ field: "anchor.other_parent_id", message: "other_parent_id is required" });
    }
  }

  if (input.exchange_times) {
    if (input.exchange_times.hour !== undefined) {
      if (input.exchange_times.hour < 0 || input.exchange_times.hour > HOURS_PER_DAY - 1) {
        errors.push({ field: "exchange_times.hour", message: `hour must be between 0 and ${HOURS_PER_DAY - 1}` });
      }
    }
    if (input.exchange_times.minute !== undefined) {
      if (input.exchange_times.minute < 0 || input.exchange_times.minute > MINUTES_PER_HOUR - 1) {
        errors.push({ field: "exchange_times.minute", message: `minute must be between 0 and ${MINUTES_PER_HOUR - 1}` });
      }
    }
  }

  return errors;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a set of custody ownership events for a given date range,
 * pattern, and configuration.
 *
 * @param input  The schedule generation input with pattern, dates, timezone, etc.
 * @returns      The generated events and diagnostics.
 * @throws       If input validation fails or internal algorithm error occurs.
 */
export function generateCustodySchedule(input: ScheduleGeneratorInput): ScheduleGeneratorOutput {
  // Validate input.
  const validationErrors = validateInput(input);
  if (validationErrors.length > 0) {
    throw new Error(
      `Invalid input:\n${validationErrors.map((e) => `  ${e.field}: ${e.message}`).join("\n")}`
    );
  }

  const { pattern, anchor, merge_adjacent_blocks } = input;

  const warnings: string[] = [];

  let events: ScheduleEvent[] = [];

  try {
    if (pattern === SP.EOW) {
      events = generateEOWEvents(input);
    } else {
      // Build template and generate.
      // For patterns other than EOW, we need both parent IDs.
      const otherParentId = anchor.other_parent_id ?? "other_parent_id";
      const template = buildPatternTemplate(pattern, anchor.anchor_parent_id, otherParentId);
      const cycleLengthDays = template.reduce((sum, seg) => sum + seg.durationDays, 0);

      events = generateBaseEvents(input, template, cycleLengthDays);
    }

    // Optionally merge adjacent blocks.
    if (merge_adjacent_blocks) {
      events = mergeAdjacentBlocks(events);
    }

    // Note: Overrides are now applied post-generation by ScheduleOverrideEngine

    // Detect and log DST transitions.
    const dstWarnings = events
      .map((ev) => {
        const dst = detectDSTTransition(new Date(ev.start_at), input.timezone);
        return dst;
      })
      .filter((w) => w !== null) as string[];

    warnings.push(...dstWarnings);
  } catch (err) {
    let errorMessage: string;
    if (err instanceof Error) {
      errorMessage = err.message;
    } else {
      errorMessage = String(err);
    }
    throw new Error(`Error generating schedule: ${errorMessage}`);
  }

  // Build diagnostics.
  let patternSummary = "";
  switch (pattern) {
    case SP.SEVEN_SEVEN:
      patternSummary = "7-7 Alternating Weeks";
      break;
    case SP.TWO_TWO_THREE:
      patternSummary = "2-2-3 Rotation";
      break;
    case SP.FIVE_TWO_TWO_FIVE:
      patternSummary = "5-2-2-5 Rotation";
      break;
    case SP.EOW:
      patternSummary = "Every-Other-Weekend";
      break;
    default:
      patternSummary = "Unknown";
  }

  const diagnostics: ScheduleGeneratorDiagnostics = {
    version: VERSION,
    pattern_summary: patternSummary,
    total_events: events.length,
    warnings,
  };

  return { events, diagnostics };
}

/**
 * Validates a schedule generator input without generating events.
 * Useful for form validation before submission.
 */
export function validateScheduleInput(input: ScheduleGeneratorInput): {
  valid: boolean;
  errors: ValidationError[];
} {
  const errors = validateInput(input);
  return { valid: errors.length === 0, errors };
}

/**
 * JSON Schema for ScheduleGeneratorInput (AJV-compatible).
 * Can be used for API validation.
 */
export const scheduleInputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Custody Schedule Generator Input",
  type: "object",
  required: ["family_id", "child_id", "pattern", "timezone", "date_range", "anchor"],
  properties: {
    family_id: { type: "string", description: "UUID of the family" },
    child_id: { type: "string", description: "UUID of the child" },
    pattern: {
      type: "string",
      enum: ["SEVEN_SEVEN", "TWO_TWO_THREE", "FIVE_TWO_TWO_FIVE", "EOW"],
      description: "Custody schedule pattern",
    },
    timezone: {
      type: "string",
      description: "IANA timezone (e.g., America/New_York)",
    },
    date_range: {
      type: "object",
      required: ["start", "end"],
      properties: {
        start: { type: "string", pattern: ISO_DATE_PATTERN },
        end: { type: "string", pattern: ISO_DATE_PATTERN },
      },
    },
    anchor: {
      type: "object",
      required: ["anchor_date", "anchor_parent_id"],
      properties: {
        anchor_date: { type: "string", pattern: ISO_DATE_PATTERN },
        anchor_parent_id: { type: "string" },
      },
    },
    exchange_times: {
      type: "object",
      properties: {
        hour: { type: "integer", minimum: 0, maximum: 23 },
        minute: { type: "integer", minimum: 0, maximum: 59 },
      },
    },
    merge_adjacent_blocks: { type: "boolean" },
    overrides: {
      type: "array",
      items: {
        type: "object",
        required: ["start", "end", "parent_id"],
        properties: {
          start: { type: "string" },
          end: { type: "string" },
          parent_id: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
};
