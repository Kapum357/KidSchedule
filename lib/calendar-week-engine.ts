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
  ScheduleEvent,
  ScheduleOverride,
  ScheduleTransition,
} from " @/lib";

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
   * Generate complete week-view data from raw custody and calendar events.
   *
   * @param year          Year being displayed
   * @param month         Month being displayed (1–12)
   * @param referenceDate Any date within the desired week (Mon–Sun boundaries computed automatically)
   * @param custodyEvents Raw custody schedule events from generateCompleteSchedule()
   * @param calendarEvents User-created calendar events
   * @param changeRequests All schedule change requests (pending ones flagged on days)
   * @param parents       [primary, secondary] parent pair
   * @param overrides     Active schedule overrides
   * @param now           Reference "now" for relative labeling
   */
  static getWeekDataFromEvents(
    year: number,
    month: number,
    referenceDate: Date,
    custodyEvents: ScheduleEvent[],
    calendarEvents: CalendarEvent[],
    changeRequests: ScheduleChangeRequest[],
    parents: [Parent, Parent],
    overrides: ScheduleOverride[] = [],
    _now: Date = new Date()
  ): CalendarWeekData {
    const [weekStart, weekEnd] = CalendarWeekEngine.getWeekBounds(referenceDate);
    const weekStartStr = dateToISOString(weekStart);
    const weekEndStr = dateToISOString(weekEnd);

    const primaryParent = parents[0];
    const secondaryParent = parents[1];
    const parentMap = new Map<string, Parent>([
      [primaryParent.id, primaryParent],
      [secondaryParent.id, secondaryParent],
    ]);

    // ── Build custody & transitions for each day of the week ──────────────
    const custodyByDate = new Map<string, Parent>();
    const transitionsByDate = new Map<string, ScheduleTransition>();

    for (const event of custodyEvents) {
      const eventStart = new Date(event.start_at);
      const eventEnd = new Date(event.end_at);

      if (eventEnd <= weekStart || eventStart > weekEnd) continue;

      const clampedStart =
        eventStart > weekStart ? eventStart : new Date(weekStart);
      const clampedEnd = eventEnd <= weekEnd ? eventEnd : new Date(weekEnd);

      for (
        let date = new Date(
          Date.UTC(
            clampedStart.getUTCFullYear(),
            clampedStart.getUTCMonth(),
            clampedStart.getUTCDate()
          )
        );
        date <= clampedEnd;
        date.setUTCDate(date.getUTCDate() + 1)
      ) {
        const dateStr = dateToISOString(date);
        const parent = parentMap.get(event.parent_id);
        if (parent) custodyByDate.set(dateStr, parent);
      }

      // Mid-day start → transition
      const eventDateStr = dateToISOString(eventStart);
      if (eventStart.getUTCHours() > 0 || eventStart.getUTCMinutes() > 0) {
        const existingParent = custodyByDate.get(eventDateStr);
        if (existingParent && existingParent.id !== event.parent_id) {
          transitionsByDate.set(eventDateStr, {
            at: eventStart,
            fromParent: existingParent,
            toParent: parentMap.get(event.parent_id)!,
          });
        }
      }
    }

    // ── Pending requests by date ──────────────────────────────────────────
    const pendingByDate = new Map<string, ScheduleChangeRequest>();
    for (const req of changeRequests) {
      if (req.status === "pending") {
        const dateStr = req.givingUpPeriodStart.split("T")[0] ?? "";
        pendingByDate.set(dateStr, req);
      }
    }

    // ── Overrides by date ─────────────────────────────────────────────────
    const overridesByDate = new Map<string, ScheduleOverride[]>();
    for (const override of overrides) {
      const oStart = new Date(override.effectiveStart);
      oStart.setUTCHours(0, 0, 0, 0);
      const oEnd = new Date(override.effectiveEnd);
      oEnd.setUTCHours(0, 0, 0, 0);
      for (
        let date = new Date(weekStart);
        date <= weekEnd;
        date.setUTCDate(date.getUTCDate() + 1)
      ) {
        if (date >= oStart && date <= oEnd) {
          const dateStr = dateToISOString(date);
          if (!overridesByDate.has(dateStr)) overridesByDate.set(dateStr, []);
          overridesByDate.get(dateStr)!.push(override);
        }
      }
    }

    // ── Build 7-day array (Mon = index 0) ─────────────────────────────────
    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const days: CalendarWeekDay[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setUTCDate(date.getUTCDate() + i);
      const dateStr = dateToISOString(date);

      const custodyParent = custodyByDate.get(dateStr) ?? null;
      const transition = transitionsByDate.get(dateStr);
      const pendingRequest = pendingByDate.get(dateStr);

      const dayAllDayEvents = calendarEvents.filter(
        (e) => e.allDay && (e.startAt.split("T")[0] ?? "") === dateStr
      );

      const allDayEvents: CalendarDayEvent[] = [
        ...(transition
          ? [
              {
                id: `transition-${dateStr}`,
                type: "transition" as const,
                title: `Transition at ${transition.at.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`,
                icon: "swap_horiz",
                iconColor: "text-primary",
              },
            ]
          : []),
        ...dayAllDayEvents.map((e) => ({
          id: e.id,
          type: "event" as const,
          title: e.title,
          icon: "event",
          iconColor: "text-slate-500",
        })),
      ];

      const custodyColor: CustodyColor = transition
        ? "split"
        : custodyParent?.id === primaryParent.id
          ? "primary"
          : "secondary";

      days.push({
        dateStr,
        dayOfWeek: DAY_LABELS[i] ?? "Mon",
        dayOfMonth: date.getUTCDate(),
        custodyParent,
        custodyColor,
        transition,
        allDayEvents,
        hasPendingRequest: !!pendingRequest,
        pendingRequest,
        affectingOverrides: overridesByDate.get(dateStr),
      });
    }

    // ── Build hourly events (timed, non-all-day) ──────────────────────────
    const timedEvents = calendarEvents.filter((e) => {
      if (e.allDay) return false;
      const dateStr = e.startAt.split("T")[0] ?? "";
      return dateStr >= weekStartStr && dateStr <= weekEndStr;
    });

    const hourlyRaw: HourlyEvent[] = timedEvents.map((e) => {
      const startMatch = e.startAt.match(/T(\d{2}):(\d{2})/);
      const endMatch = e.endAt.match(/T(\d{2}):(\d{2})/);
      const startTime = startMatch
        ? `${startMatch[1]}:${startMatch[2]}`
        : "00:00";
      const endTime = endMatch ? `${endMatch[1]}:${endMatch[2]}` : "01:00";
      return {
        id: e.id,
        title: e.title,
        startTime,
        endTime,
        duration: Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime)),
        category: e.category,
        allDay: false,
        parentId: e.parentId,
        dateStr: e.startAt.split("T")[0] ?? "",
      };
    });

    return {
      year,
      month,
      weekStartDate: weekStartStr,
      weekEndDate: weekEndStr,
      days,
      hourlyEvents: CalendarWeekEngine.calculateEventLayout(hourlyRaw),
      currentParent: primaryParent,
      otherParent: secondaryParent,
    };
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
