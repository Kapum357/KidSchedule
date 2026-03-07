/**
 * KidSchedule – Calendar Week Engine
 *
 * Generates week-view data (7-day grid with hourly breakdown) for custody calendars.
 * Handles event positioning, time normalization, and responsive layout calculations.
 */

import type {
  CalendarEvent,
  EventCategory,
  Parent,
  ScheduleChangeRequest,
  ScheduleOverride,
  ScheduleTransition,
} from "@/types";

// ─── Public Types ────────────────────────────────────────────────────────────

export type CustodyColor = "primary" | "secondary" | "split";

export interface CalendarWeekDay {
  /** ISO date string "YYYY-MM-DD" */
  dateStr: string;
  /** Weekday label: "Mon", "Tue", etc. */
  dayOfWeek: string;
  /** Day of month (1–31) */
  dayOfMonth: number;
  /** Parent with custody for this day */
  custodyParent: Parent | null;
  /** Color coding */
  custodyColor: CustodyColor;
  /** Transition details if this is a transition day */
  transition?: ScheduleTransition;
  /** All-day events for this day */
  allDayEvents: CalendarDayEvent[];
  /** True if pending schedule change request */
  hasPendingRequest: boolean;
  /** Pending request if exists */
  pendingRequest?: ScheduleChangeRequest;
  /** Holiday/swap overrides */
  affectingOverrides?: ScheduleOverride[];
}

export interface CalendarDayEvent {
  id: string;
  type: "transition" | "expense" | "event" | "note";
  title: string;
  time?: string; // e.g. "5:00 PM"
  icon?: string; // Material Symbols name
  iconColor?: string; // Tailwind color
  bgColor?: string; // Tailwind bg class
}

export interface HourlyEvent {
  id: string;
  title: string;
  startTime: string; // "14:30"
  endTime: string; // "15:45"
  duration: number; // minutes
  category: EventCategory;
  icon?: string;
  iconColor?: string;
  allDay: boolean;
  parentId?: string;
  dateStr: string; // "YYYY-MM-DD"
  /** CSS grid row position (for layout) */
  startRow?: number;
  /** CSS grid row span (for layout) */
  rowSpan?: number;
}

export interface CalendarWeekData {
  year: number;
  month: number;
  weekStartDate: string; // "YYYY-MM-DD" Monday of week
  weekEndDate: string; // "YYYY-MM-DD" Sunday of week
  days: CalendarWeekDay[];
  /** All timed events in week, sorted by start time */
  hourlyEvents: HourlyEvent[];
  /** Current parent (for labels) */
  currentParent: Parent;
  /** Other parent */
  otherParent: Parent;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Parse date string to midnight UTC.
 */
function dateToMidnightUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/**
 * Convert Date to ISO string.
 */
function dateToISOString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

/**
 * Get the Monday of the week containing the given date.
 * Assumes ISO 8601 week (Mon-Sun).
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  // Convert Sun=0 to Mon=1 offset
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
}

/**
 * Get the Sunday of the week containing the given date.
 */
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

/**
 * Format time as "HH:MM" for sorting/comparison.
 */
function formatTimeAsHHMM(time: string | undefined): string {
  if (!time) return "00:00";
  // Handle "5:00 PM" → "17:00"
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return "00:00";
  const [, hour, min, ampm] = match;
  let h = parseInt(hour, 10);
  if (ampm?.toUpperCase() === "PM" && h !== 12) h += 12;
  if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

/**
 * Calculate minutes from midnight for time string.
 * "14:30" → 870, "23:59" → 1439
 */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Convert minutes from midnight to row number in hourly grid.
 * Assuming 1 row = 15 minutes (4 rows per hour)
 */
function minutesToGridRow(minutes: number): number {
  return Math.floor(minutes / 15) + 1; // +1 for header row
}

// ─── Public Class ────────────────────────────────────────────────────────────

export class CalendarWeekEngine {
  /**
   * Get [start, end] dates for the week containing the given date.
   * Week is Mon-Sun (ISO 8601).
   */
  static getWeekBounds(date: Date): [Date, Date] {
    return [getWeekStart(date), getWeekEnd(date)];
  }

  /**
   * Build hourly timeline for week events.
   * Returns map of minute-of-day → events occurring at that time.
   */
  static buildHourlyTimeline(
    events: HourlyEvent[]
  ): Map<number, HourlyEvent[]> {
    const timeline = new Map<number, HourlyEvent[]>();

    for (const event of events) {
      const startMin = timeToMinutes(event.startTime);
      if (!timeline.has(startMin)) {
        timeline.set(startMin, []);
      }
      timeline.get(startMin)!.push(event);
    }

    return timeline;
  }

  /**
   * Categorize events into all-day vs timed.
   */
  static categorizeEvents(events: CalendarEvent[]): {
    allDay: CalendarEvent[];
    timed: CalendarEvent[];
  } {
    return {
      allDay: events.filter((e) => e.allDay),
      timed: events.filter((e) => !e.allDay),
    };
  }

  /**
   * Calculate grid row positions for events based on time.
   * Assumes 15-minute row height (4 rows per hour).
   */
  static calculateEventLayout(events: HourlyEvent[]): HourlyEvent[] {
    return events.map((event) => {
      const startMin = timeToMinutes(event.startTime);
      const endMin = timeToMinutes(event.endTime);
      const durationMin = endMin - startMin;

      return {
        ...event,
        startRow: minutesToGridRow(startMin),
        rowSpan: Math.max(1, Math.ceil(durationMin / 15)),
      };
    });
  }

  /**
   * Detect overlapping events and assign column positions.
   * Returns events with column and totalColumns properties.
   */
  static layoutOverlappingEvents(
    events: HourlyEvent[]
  ): (HourlyEvent & { column: number; totalColumns: number })[] {
    // Group events by start time
    const byTime = new Map<string, HourlyEvent[]>();
    for (const event of events) {
      const key = event.startTime;
      if (!byTime.has(key)) {
        byTime.set(key, []);
      }
      byTime.get(key)!.push(event);
    }

    // Assign columns within each time group
    const result: (HourlyEvent & { column: number; totalColumns: number })[] =
      [];
    for (const [, groupEvents] of byTime) {
      const totalCols = groupEvents.length;
      groupEvents.forEach((event, idx) => {
        result.push({
          ...event,
          column: idx,
          totalColumns: totalCols,
        });
      });
    }

    return result;
  }
}
