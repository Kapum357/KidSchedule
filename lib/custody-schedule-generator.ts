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
} from "@/types";
import { SchedulePattern as SP } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
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
