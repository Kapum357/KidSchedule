// KidSchedule – CalendarMonthEngine

import { CustodyEngine } from "@/lib/custody";

import type {
  CalendarConflict,
  CalendarEvent,
  Family,
  Parent,
  ScheduleChangeRequest,
  ScheduleTransition,
  ScheduleEvent,
  ScheduleOverride,
} from "@/lib";

// ─── Public Types ────────────────────────────────────────────────────────────

export type CustodyColor = "primary" | "secondary" | "split";

export interface CalendarDayState {
  /** ISO date string "YYYY-MM-DD" */
  dateStr: string;
  /** Day of month (1–31) */
  dayOfMonth: number;
  /** Parent with custody for the main part of the day */
  custodyParent: Parent | null;
  /** If this day has a transition, the receiving parent */
  transitionToParent?: Parent;
  /** "primary" | "secondary" | "split" for color coding */
  custodyColor: CustodyColor;
  /**
   * All events on this day, sorted by display priority.
   * Transitions always first, then expenses, then notes.
   */
  events: CalendarDayEvent[];
  /** True if this day has a pending schedule change request */
  hasPendingRequest: boolean;
  /** Pending request details if hasPendingRequest=true */
  pendingRequest?: ScheduleChangeRequest;
  /** Transition details if custodyColor="split" */
  transition?: ScheduleTransition;
  /** Holiday overrides affecting this day (e.g., holiday, swap, mediation) */
  affectingOverrides?: ScheduleOverride[];
}

export interface CalendarDayEvent {
  id: string;
  type: "transition" | "expense" | "event" | "note";
  title: string;
  time?: string; // e.g. "5:00 PM" or "6:00 PM–7:30 PM"
  icon?: string; // Material Symbols name
  iconColor?: string; // Tailwind color class, e.g. "text-emerald-500"
  bgColor?: string; // Tailwind bg class for event pill
}

export interface CalendarMonthData {
  /** Year and month being displayed */
  year: number;
  month: number; // 1–12
  /** Days of month in order (first may include prev-month grayed days) */
  days: CalendarDayState[];
  /** Upcoming transitions for the sidebar (sorted by date) */
  upcomingTransitions: TransitionListItem[];
  /** Parent currently holding custody (for UI labeling) */
  currentParent: Parent;
  /** The other parent */
  otherParent: Parent;
}

export interface TransitionListItem {
  transition: ScheduleTransition;
  /** Human label: "Today", "Tomorrow", "Oct 27", etc. */
  label: string;
  /** Formatted time: "5:00 PM" */
  timeStr: string;
  /** Is this transition upcoming (within next 14 days)? */
  isUpcoming: boolean;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Parse a calendar date to midnight UTC (start of day).
 * JS new Date() treats YYYY-MM-DD as UTC when parsing.
 */
function dateToMidnightUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/**
 * Convert Date to "YYYY-MM-DD" string.
 */
function dateToISOString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

/**
 * Get the number of days in a month (1–12, any year).
 */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getUTCDate();
}

/**
 * Get ISO day of week (0 = Sunday, 6 = Saturday) for a date.
 */
function getStartingDayOfWeek(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.getUTCDay();
}

/**
 * Format a Date as human-readable relative label.
 * Used for the sidebar transitions list.
 *
 * Examples: "Today", "Tomorrow", "Oct 27", "In 5 days"
 */
function formatTransitionLabel(transition: ScheduleTransition, now: Date): string {
  const transDate = transition.at;
  const todayStr = dateToISOString(now);
  const transStr = dateToISOString(transDate);

  if (transStr === todayStr) return "Today";

  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (transStr === dateToISOString(tomorrow)) return "Tomorrow";

  // Otherwise show "Mon, Oct 27" format
  return transDate.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a Date/time as "H:MM AM/PM".
 */
function formatTransitionTime(d: Date): string {
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Event Merging ───────────────────────────────────────────────────────────

/**
 * Merge custody events, calendar events, expenses, and transitions into a
 * per-day list, sorted by priority (transitions first).
 *
 * Complexity: O(E) where E = total events across the month.
 */
function mergeEventsForDay(
  dateStr: string,
  transition: ScheduleTransition | undefined,
  calendarEvents: CalendarEvent[]
): CalendarDayEvent[] {
  const events: CalendarDayEvent[] = [];

  // 1. Transition event (always first if present)
  if (transition) {
    const timeStr = formatTransitionTime(transition.at);

    events.push({
      id: `transition-${dateStr}`,
      type: "transition",
      title: `Exchange ${timeStr}`,
      time: timeStr,
      icon: "swap_driving_apps_wheel",
      bgColor: "bg-secondary/20 text-secondary-900",
    });

    // Add location if available
    if (transition.location) {
      events.push({
        id: `location-${dateStr}`,
        type: "note",
        title: transition.location,
        icon: "location_on",
        bgColor: "bg-slate-100 dark:bg-slate-700",
      });
    }
  }

  // 2. Calendar events on this day
  const dayEvents = calendarEvents.filter((e) =>
    e.startAt.startsWith(dateStr)
  );

  for (const event of dayEvents) {
    const startTime = new Date(event.startAt);
    const timeStr = event.allDay
      ? undefined
      : formatTransitionTime(startTime);

    let icon = "event";
    let iconColor = "text-slate-500";

    if (event.category === "medical") {
      icon = "local_hospital";
      iconColor = "text-red-500";
    } else if (event.category === "activity") {
      icon = "sports_soccer";
      iconColor = "text-orange-500";
    } else if (event.category === "school") {
      icon = "school";
      iconColor = "text-purple-500";
    } else if (event.category === "holiday") {
      icon = "celebration";
      iconColor = "text-amber-500";
    }

    events.push({
      id: event.id,
      type: "event",
      title: event.title,
      time: timeStr,
      icon,
      iconColor,
    });
  }

  // Limit to ~3 items for day cell display
  return events.slice(0, 3);
}

// ─── Conflict Detection ─────────────────────────────────────────────────────

function normalizeEventRangeUTC(event: CalendarEvent): { startMs: number; endMs: number } {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);

  if (event.allDay) {
    const startUTC = Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate(),
      0,
      0,
      0,
      0
    );
    const endUTC = Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate(),
      23,
      59,
      59,
      999
    );
    return { startMs: startUTC, endMs: Math.max(startUTC, endUTC) };
  }

  const startMs = start.getTime();
  const endMs = Math.max(startMs, end.getTime());
  return { startMs, endMs };
}

function conflictsWithWindow(
  a: CalendarEvent,
  b: CalendarEvent,
  windowMins: number
): CalendarConflict | null {
  const aRange = normalizeEventRangeUTC(a);
  const bRange = normalizeEventRangeUTC(b);
  const windowMs = Math.max(0, windowMins) * 60_000;

  const overlapsWithBuffer =
    aRange.startMs < bRange.endMs + windowMs &&
    bRange.startMs < aRange.endMs + windowMs;

  if (!overlapsWithBuffer) return null;

  const directOverlap =
    aRange.startMs < bRange.endMs &&
    bRange.startMs < aRange.endMs;

  const minutesApart = Math.round(Math.abs(aRange.startMs - bRange.startMs) / 60_000);

  return {
    primaryEvent: a,
    conflictingEvent: b,
    minutesApart,
    overlapType: directOverlap ? "overlap" : "buffer_window",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class CalendarMonthEngine {
  private readonly engine: CustodyEngine;
  private readonly family: Family;
  private readonly parentMap: Map<string, Parent>;

  constructor(family: Family) {
    this.family = family;
    this.engine = new CustodyEngine(family);
    this.parentMap = new Map(family.parents.map((p) => [p.id, p]));
  }

  /**
   * Builds the complete calendar data for a month.
   *
   * @param year       4-digit year (e.g. 2024)
   * @param month      Month 1–12
   * @param events     All calendar events for the family
   * @param requests   All custody change requests
   * @param now        Reference "now" for sidebar computation (default: today)
   *
   * @returns Complete CalendarMonthData ready for rendering
   *
   * Complexity: O(31 × B + T + E) where B=blocks, T=transitions, E=events.
   *            In practice: ~O(1) since 31 and small constant multipliers.
   *
   * @example
   * const engine = new CalendarMonthEngine(family);
   * const oct2024 = engine.getMonthData(2024, 10, events, requests);
   * // Render oct2024.days in a 7-column grid
   */
  getMonthData(
    year: number,
    month: number,
    events: CalendarEvent[],
    requests: ScheduleChangeRequest[],
    now: Date = new Date()
  ): CalendarMonthData {
    const daysInMonthNum = daysInMonth(year, month);
    const startingDow = getStartingDayOfWeek(year, month);

    const requestsByDate = this.buildPendingRequestLookup(requests);

    const monthStart = dateToMidnightUTC(
      `${year}-${String(month).padStart(2, "0")}-01`
    );
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCDate(daysInMonthNum);
    monthEnd.setUTCHours(23, 59, 59, 999);

    const transitionsByDate = this.buildTransitionMap(
      this.engine.getTransitionsInRange(monthStart, monthEnd)
    );

    const days: CalendarDayState[] = [
      ...this.buildPrevMonthPadding(startingDow, year, month),
      ...this.buildCurrentMonthDays(
        year,
        month,
        daysInMonthNum,
        events,
        transitionsByDate,
        requestsByDate
      ),
    ];

    return {
      year,
      month,
      days,
      upcomingTransitions: this.buildUpcomingTransitions(now),
      currentParent: this.family.parents[0],
      otherParent: this.family.parents[1],
    };
  }

  /**
   * Builds the complete calendar data for a month using custody events from the schedule generator.
   *
   * @param year         4-digit year (e.g. 2024)
   * @param month        Month 1–12
   * @param custodyEvents Custody events from the schedule generator
   * @param calendarEvents All calendar events for the family
   * @param requests     All custody change requests
   * @param now          Reference "now" for sidebar computation (default: today)
   *
   * @returns Complete CalendarMonthData ready for rendering
   */
  getMonthDataFromEvents(
    year: number,
    month: number,
    custodyEvents: ScheduleEvent[],
    calendarEvents: CalendarEvent[],
    requests: ScheduleChangeRequest[],
    overrides: ScheduleOverride[] = [],
    now: Date = new Date()
  ): CalendarMonthData {
    const daysInMonthNum = daysInMonth(year, month);
    const startingDow = getStartingDayOfWeek(year, month);

    const requestsByDate = this.buildPendingRequestLookup(requests);

    // Build custody and transition data from events
    const { custodyByDate, transitionsByDate } = this.buildCustodyFromEvents(
      custodyEvents,
      year,
      month
    );

    const days: CalendarDayState[] = [
      ...this.buildPrevMonthPadding(startingDow, year, month),
      ...this.buildCurrentMonthDaysFromEvents(
        year,
        month,
        daysInMonthNum,
        custodyByDate,
        transitionsByDate,
        calendarEvents,
        requestsByDate,
        overrides
      ),
    ];

    return {
      year,
      month,
      days,
      upcomingTransitions: this.buildUpcomingTransitionsFromEvents(custodyEvents, now),
      currentParent: this.family.parents[0],
      otherParent: this.family.parents[1],
    };
  }

  private buildPendingRequestLookup(
    requests: ScheduleChangeRequest[]
  ): Map<string, ScheduleChangeRequest> {
    const pendingByDate = new Map<string, ScheduleChangeRequest>();

    for (const req of requests) {
      if (req.status !== "pending") continue;
      const startDate = new Date(req.givingUpPeriodStart);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(req.givingUpPeriodEnd);
      endDate.setUTCHours(0, 0, 0, 0);

      for (
        let cursor = new Date(startDate);
        cursor <= endDate;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        pendingByDate.set(dateToISOString(cursor), req);
      }
    }

    return pendingByDate;
  }

  private buildTransitionMap(
    transitions: ScheduleTransition[]
  ): Map<string, ScheduleTransition> {
    const map = new Map<string, ScheduleTransition>();
    for (const trans of transitions) {
      map.set(dateToISOString(trans.at), trans);
    }
    return map;
  }

  private buildPrevMonthPadding(
    startingDow: number,
    year: number,
    month: number
  ): CalendarDayState[] {
    if (startingDow === 0) return [];

    const prevMonthYear = month === 1 ? year - 1 : year;
    const prevMonthNum = month === 1 ? 12 : month - 1;
    const daysInPrevMonth = daysInMonth(prevMonthYear, prevMonthNum);
    const prevMonthStartDay = daysInPrevMonth - startingDow + 1;
    const monthStr = String(prevMonthNum).padStart(2, "0");

    const days: CalendarDayState[] = [];
    for (let i = 0; i < startingDow; i++) {
      const dayOfMonth = prevMonthStartDay + i;
      const dayStr = String(dayOfMonth).padStart(2, "0");
      const dateStr = `${prevMonthYear}-${monthStr}-${dayStr}`;

      days.push({
        dateStr,
        dayOfMonth,
        custodyParent: null,
        custodyColor: "primary",
        events: [],
        hasPendingRequest: false,
      });
    }

    return days;
  }

  private buildCurrentMonthDays(
    year: number,
    month: number,
    daysInMonthNum: number,
    events: CalendarEvent[],
    transitionsByDate: Map<string, ScheduleTransition>,
    requestsByDate: Map<string, ScheduleChangeRequest>
  ): CalendarDayState[] {
    const days: CalendarDayState[] = [];
    const monthStr = String(month).padStart(2, "0");

    for (let dayOfMonth = 1; dayOfMonth <= daysInMonthNum; dayOfMonth++) {
      const dayStr = String(dayOfMonth).padStart(2, "0");
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      const dayNoon = new Date(
        Date.UTC(year, month - 1, dayOfMonth, 12, 0, 0, 0)
      );
      const custody = this.engine.getStatus(dayNoon);

      const transition = transitionsByDate.get(dateStr);
      let custodyColor: CustodyColor;
      if (transition) {
        custodyColor = "split";
      } else if (custody.currentParent.id === this.family.parents[0].id) {
        custodyColor = "primary";
      } else {
        custodyColor = "secondary";
      }

      const mergedEvents = mergeEventsForDay(
        dateStr,
        transition,
        events.filter((e) => e.startAt.startsWith(dateStr))
      );

      days.push({
        dateStr,
        dayOfMonth,
        custodyParent: custody.currentParent,
        transitionToParent: transition?.toParent,
        custodyColor,
        events: mergedEvents,
        hasPendingRequest: requestsByDate.has(dateStr),
        pendingRequest: requestsByDate.get(dateStr),
        transition,
      });
    }

    return days;
  }

  private buildUpcomingTransitions(now: Date): TransitionListItem[] {
    const upcomingTransitions: TransitionListItem[] = [];
    const sidebarCutoff = new Date(now);
    sidebarCutoff.setUTCDate(sidebarCutoff.getUTCDate() + 14);

    for (const trans of this.engine.getUpcomingTransitions(now, 10)) {
      if (trans.at > sidebarCutoff) break;

      upcomingTransitions.push({
        transition: trans,
        label: formatTransitionLabel(trans, now),
        timeStr: formatTransitionTime(trans.at),
        isUpcoming: trans.at > now,
      });
    }

    return upcomingTransitions;
  }

  /**
   * Get custody coloring for a single day without the full month load.
   *
   * Useful for pre-computing color classes if rendering days individually.
   *
   * Complexity: O(B)
   */
  getDayColor(dateStr: string): CustodyColor {
    const dayNoon = new Date(dateStr);
    dayNoon.setUTCHours(12, 0, 0, 0);
    const status = this.engine.getStatus(dayNoon);

    const monthStart = dateToMidnightUTC(dateStr);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCHours(23, 59, 59, 999);

    const transitions = this.engine.getTransitionsInRange(monthStart, monthEnd);
    const hasTransition = transitions.some(
      (t) => dateToISOString(t.at) === dateStr
    );

    if (hasTransition) return "split";
    return status.currentParent.id === this.family.parents[0].id
      ? "primary"
      : "secondary";
  }

  private buildCustodyFromEvents(
    custodyEvents: ScheduleEvent[],
    year: number,
    month: number
  ): {
    custodyByDate: Map<string, Parent>;
    transitionsByDate: Map<string, ScheduleTransition>;
  } {
    const custodyByDate = new Map<string, Parent>();
    const transitionsByDate = new Map<string, ScheduleTransition>();

    // Filter events for this month
    const monthStart = dateToMidnightUTC(`${year}-${String(month).padStart(2, "0")}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    monthEnd.setUTCDate(0); // Last day of month
    monthEnd.setUTCHours(23, 59, 59, 999);

    for (const event of custodyEvents) {
      const eventStart = new Date(event.start_at);
      const eventEnd = new Date(event.end_at);

      // Skip events outside this month
      if (eventEnd <= monthStart || eventStart >= monthEnd) continue;

      const startDate = eventStart > monthStart ? eventStart : monthStart;
      const endDate = eventEnd < monthEnd ? eventEnd : monthEnd;

      // For each day this event covers
      for (
        let date = new Date(startDate);
        date <= endDate;
        date.setUTCDate(date.getUTCDate() + 1)
      ) {
        const dateStr = dateToISOString(date);
        const parent = this.parentMap.get(event.parent_id);
        if (parent) {
          custodyByDate.set(dateStr, parent);
        }
      }

      // Check if this event represents a transition (starts mid-day)
      const eventDateStr = dateToISOString(eventStart);
      if (eventStart.getUTCHours() > 0 || eventStart.getUTCMinutes() > 0) {
        const existingParent = custodyByDate.get(eventDateStr);
        if (existingParent && existingParent.id !== event.parent_id) {
          // This is a transition day
          transitionsByDate.set(eventDateStr, {
            at: eventStart,
            fromParent: existingParent,
            toParent: this.parentMap.get(event.parent_id)!,
          });
        }
      }
    }

    return { custodyByDate, transitionsByDate };
  }

  /**
   * Build a lookup map of overrides by date range.
   * Maps each calendar date string to the overrides affecting that date.
   */
  private buildOverrideLookupByDate(
    year: number,
    month: number,
    daysInMonthNum: number,
    overrides: ScheduleOverride[]
  ): Map<string, ScheduleOverride[]> {
    const overridesByDate = new Map<string, ScheduleOverride[]>();
    const monthStr = String(month).padStart(2, "0");

    for (let dayOfMonth = 1; dayOfMonth <= daysInMonthNum; dayOfMonth++) {
      const dayStr = String(dayOfMonth).padStart(2, "0");
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      const affectingOverrides: ScheduleOverride[] = [];

      for (const override of overrides) {
        const startDate = new Date(override.effectiveStart);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(override.effectiveEnd);
        endDate.setUTCHours(0, 0, 0, 0);

        const currentDate = new Date(`${dateStr}T00:00:00Z`);
        if (currentDate >= startDate && currentDate <= endDate) {
          affectingOverrides.push(override);
        }
      }

      if (affectingOverrides.length > 0) {
        overridesByDate.set(dateStr, affectingOverrides);
      }
    }

    return overridesByDate;
  }

  private buildCurrentMonthDaysFromEvents(
    year: number,
    month: number,
    daysInMonthNum: number,
    custodyByDate: Map<string, Parent>,
    transitionsByDate: Map<string, ScheduleTransition>,
    calendarEvents: CalendarEvent[],
    requestsByDate: Map<string, ScheduleChangeRequest>,
    overrides: ScheduleOverride[] = [],
  ): CalendarDayState[] {
    const days: CalendarDayState[] = [];
    const monthStr = String(month).padStart(2, "0");
    const overridesByDate = this.buildOverrideLookupByDate(
      year,
      month,
      daysInMonthNum,
      overrides,
    );

    for (let dayOfMonth = 1; dayOfMonth <= daysInMonthNum; dayOfMonth++) {
      const dayStr = String(dayOfMonth).padStart(2, "0");
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      const custodyParent = custodyByDate.get(dateStr) || this.family.parents[0];
      const transition = transitionsByDate.get(dateStr);

      let custodyColor: CustodyColor;
      if (transition) {
        custodyColor = "split";
      } else if (custodyParent.id === this.family.parents[0].id) {
        custodyColor = "primary";
      } else {
        custodyColor = "secondary";
      }

      const mergedEvents = mergeEventsForDay(
        dateStr,
        transition,
        calendarEvents,
      );

      days.push({
        dateStr,
        dayOfMonth,
        custodyParent,
        transitionToParent: transition?.toParent,
        custodyColor,
        events: mergedEvents,
        hasPendingRequest: requestsByDate.has(dateStr),
        pendingRequest: requestsByDate.get(dateStr),
        transition,
        affectingOverrides: overridesByDate.get(dateStr),
      });
    }

    return days;
  }

  private buildUpcomingTransitionsFromEvents(
    custodyEvents: ScheduleEvent[],
    now: Date
  ): TransitionListItem[] {
    const upcomingTransitions: TransitionListItem[] = [];
    const sidebarCutoff = new Date(now);
    sidebarCutoff.setUTCDate(sidebarCutoff.getUTCDate() + 14);

    // Find transition events (events that start mid-day)
    const transitionEvents = custodyEvents.filter((event) => {
      const startTime = new Date(event.start_at);
      return startTime.getUTCHours() > 0 || startTime.getUTCMinutes() > 0;
    });

    for (const event of transitionEvents) {
      const transitionTime = new Date(event.start_at);
      if (transitionTime > sidebarCutoff || transitionTime < now) continue;

      const fromParent = this.family.parents.find(p => p.id !== event.parent_id)!;
      const toParent = this.parentMap.get(event.parent_id)!;

      upcomingTransitions.push({
        transition: {
          at: transitionTime,
          fromParent,
          toParent,
        },
        label: formatTransitionLabel({
          at: transitionTime,
          fromParent,
          toParent,
        }, now),
        timeStr: formatTransitionTime(transitionTime),
        isUpcoming: transitionTime > now,
      });
    }

    // Sort by date
    upcomingTransitions.sort((a, b) => a.transition.at.getTime() - b.transition.at.getTime());

    return upcomingTransitions.slice(0, 10);
  }

  /**
   * Returns the CSS class(es) for custody color on a day.
   *
   * @param color "primary" | "secondary" | "split"
   * @returns Tailwind class string
   */
  static colorToCSSClass(color: CustodyColor): string {
    if (color === "primary") return "bg-primary/5";
    if (color === "secondary") return "bg-secondary/5";
    // split: both halves shown via absolute positioning
    return "split";
  }

  /**
   * Detect conflicts among events using a configurable window.
   *
   * Predicate:
   * startA < endB + window AND startB < endA + window
   */
  detectConflicts(events: CalendarEvent[], windowMins: number): CalendarConflict[] {
    const conflicts: CalendarConflict[] = [];

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const conflict = conflictsWithWindow(events[i], events[j], windowMins);
        if (conflict) conflicts.push(conflict);
      }
    }

    return conflicts.sort((a, b) => a.minutesApart - b.minutesApart);
  }
}

/**
 * KidSchedule – Calendar List Engine
 *
 * Generates list-view data (chronological event stream) for custody calendars.
 * Handles event sorting, filtering, date labeling, and grouping.
 */

import type {
  EventCategory
} from "@/lib";

// ─── Public Types ────────────────────────────────────────────────────────────

export interface ListViewEvent {
  id: string;
  title: string;
  startAt: string; // ISO datetime "YYYY-MM-DDTHH:MM:SS"
  endAt: string;
  dateStr: string; // "YYYY-MM-DD"
  /** Human-friendly date label: "Today", "Tomorrow", "Mon, Mar 7", etc. */
  dateLabel: string;
  /** Time range: "2:30 PM – 3:45 PM" or "All day" */
  timeRange: string;
  category: EventCategory;
  icon: string; // Material Symbols icon
  iconColor: string; // Tailwind color class
  custodyColor?: "primary" | "secondary" | "split"; // For transitions
  parentId?: string;
  allDay: boolean;
  /** If this is a transition event */
  transition?: ScheduleTransition;
  /** If this is a change request event */
  changeRequest?: ScheduleChangeRequest;
  /** Event type for UI rendering */
  eventType: "transition" | "calendar" | "request";
}

export interface ListViewFilter {
  /** Filter by event category */
  categoryFilter?: EventCategory[];
  /** Filter by start date (inclusive) */
  dateRangeStart?: string; // "YYYY-MM-DD"
  /** Filter by end date (inclusive) */
  dateRangeEnd?: string;
  /** Search by title substring */
  searchQuery?: string;
}

export interface CalendarListData {
  year: number;
  month: number;
  events: ListViewEvent[]; // Chronological order
  /** Events grouped by date for UI rendering */
  dateGrouping: Map<string, ListViewEvent[]>;
  filters: ListViewFilter;
  totalEventCount: number;
  filteredEventCount: number;
  currentParent: Parent;
  otherParent: Parent;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Parse ISO datetime and extract date part.
 */
function extractDateFromISO(isoDatetime: string): string {
  return isoDatetime.split("T")[0] || "1970-01-01";
}

/**
 * Convert ISO datetime to 12-hour format time string.
 * "2024-03-07T14:30:00Z" → "2:30 PM"
 */
function formatTime(isoDatetime: string): string {
  const match = isoDatetime.match(/T(\d{2}):(\d{2})/);
  if (!match) return "";

  const [, hour, min] = match;
  let h = parseInt(hour, 10);
  const m = min;

  const ampm = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;

  return `${h}:${m} ${ampm}`;
}

/**
 * Build human-friendly date label relative to "now".
 */
function buildDateLabel(dateStr: string, now: Date): string {
  const eventDate = new Date(`${dateStr}T00:00:00Z`);
  const todayDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const daysDiff = Math.floor(
    (eventDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDiff === 0) return "Today";
  if (daysDiff === 1) return "Tomorrow";
  if (daysDiff === -1) return "Yesterday";
  if (daysDiff > -7 && daysDiff < 0) {
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `Last ${weekdays[eventDate.getUTCDay()]}`;
  }
  if (daysDiff > 0 && daysDiff < 7) {
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return weekdays[eventDate.getUTCDay()];
  }

  // Fallback: "Mon, Mar 7"
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return formatter.format(eventDate);
}

/**
 * Parse ISO datetime range to time range string.
 * "2024-03-07T14:30:00Z" to "2024-03-07T15:45:00Z" → "2:30 PM – 3:45 PM"
 */
function formatTimeRange(startAt: string, endAt: string, allDay: boolean): string {
  if (allDay) return "All day";
  const start = formatTime(startAt);
  const end = formatTime(endAt);
  return `${start} – ${end}`;
}

/**
 * Sort events chronologically by startAt.
 */
function sortEventsByTime(events: ListViewEvent[]): ListViewEvent[] {
  return events.slice().sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/**
 * Group events by date string.
 */
function groupEventsByDate(events: ListViewEvent[]): Map<string, ListViewEvent[]> {
  const grouped = new Map<string, ListViewEvent[]>();
  for (const event of events) {
    if (!grouped.has(event.dateStr)) {
      grouped.set(event.dateStr, []);
    }
    grouped.get(event.dateStr)!.push(event);
  }
  return grouped;
}

/**
 * Determine icon for event based on category.
 */
function getIconForCategory(category: EventCategory): string {
  switch (category) {
    case "school":
      return "school";
    case "medical":
      return "local_hospital";
    case "activity":
      return "interests";
    case "holiday":
      return "celebration";
    case "custody":
      return "swap_horiz";
    default:
      return "event";
  }
}

/**
 * Determine icon color for event.
 */
function getColorForCategory(category: EventCategory): string {
  switch (category) {
    case "school":
      return "text-blue-500";
    case "medical":
      return "text-red-500";
    case "activity":
      return "text-purple-500";
    case "holiday":
      return "text-amber-500";
    case "custody":
      return "text-primary";
    default:
      return "text-slate-500";
  }
}

// ─── Public Class ────────────────────────────────────────────────────────────

export class CalendarListEngine {
  /**
   * Build event stream from calendar events, transitions, and change requests.
   * Returns sorted, deduplicated list with human-friendly labels.
   */
  static buildEventStream(
    calendarEvents: CalendarEvent[],
    transitions: ScheduleTransition[],
    changeRequests: ScheduleChangeRequest[],
    now: Date,
    startDate?: string, // "YYYY-MM-DD"
    endDate?: string
  ): ListViewEvent[] {
    const events: ListViewEvent[] = [];

    // Add calendar events
    for (const event of calendarEvents) {
      const eventDateStr = extractDateFromISO(event.startAt);

      // Filter by date range if provided
      if (startDate && eventDateStr < startDate) continue;
      if (endDate && eventDateStr > endDate) continue;

      events.push({
        id: event.id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        dateStr: eventDateStr,
        dateLabel: buildDateLabel(eventDateStr, now),
        timeRange: formatTimeRange(event.startAt, event.endAt, event.allDay),
        category: event.category,
        icon: getIconForCategory(event.category),
        iconColor: getColorForCategory(event.category),
        parentId: event.parentId,
        allDay: event.allDay,
        eventType: "calendar",
      });
    }

    // Add transitions
    for (const transition of transitions) {
      const isoDateTime = transition.at.toISOString();
      const transitionDateStr = extractDateFromISO(isoDateTime);

      // Filter by date range
      if (startDate && transitionDateStr < startDate) continue;
      if (endDate && transitionDateStr > endDate) continue;

      events.push({
        id: `transition-${transition.toParent.id}`,
        title: `Transition to ${transition.toParent.name}`,
        startAt: isoDateTime,
        endAt: isoDateTime, // Instant event
        dateStr: transitionDateStr,
        dateLabel: buildDateLabel(transitionDateStr, now),
        timeRange: formatTime(isoDateTime),
        category: "custody",
        icon: "swap_horiz",
        iconColor: "text-primary",
        custodyColor: "split",
        allDay: false,
        transition,
        eventType: "transition",
      });
    }

    // Add change requests
    for (const request of changeRequests) {
      const requestDateStr = extractDateFromISO(request.givingUpPeriodStart);

      // Filter by date range
      if (startDate && requestDateStr < startDate) continue;
      if (endDate && requestDateStr > endDate) continue;

      events.push({
        id: `request-${request.id}`,
        title: `Schedule Change Request: ${request.title}`,
        startAt: request.givingUpPeriodStart,
        endAt: request.givingUpPeriodEnd,
        dateStr: requestDateStr,
        dateLabel: buildDateLabel(requestDateStr, now),
        timeRange: formatTimeRange(request.givingUpPeriodStart, request.givingUpPeriodEnd, false),
        category: "other",
        icon: "edit_calendar",
        iconColor: "text-amber-500",
        allDay: false,
        changeRequest: request,
        eventType: "request",
      });
    }

    return sortEventsByTime(events);
  }

  /**
   * Group events by date string for UI rendering.
   * Exposed as public static so callers (e.g. page.tsx) can build CalendarListData.
   */
  static groupEventsByDate(
    events: ListViewEvent[]
  ): Map<string, ListViewEvent[]> {
    return groupEventsByDate(events);
  }

  /**
   * Apply filters to event stream.
   */
  static filterEvents(events: ListViewEvent[], filters: ListViewFilter): ListViewEvent[] {
    return events.filter((event) => {
      // Category filter
      if (filters.categoryFilter && filters.categoryFilter.length > 0) {
        if (!filters.categoryFilter.includes(event.category)) {
          return false;
        }
      }

      // Date range filter
      if (filters.dateRangeStart && event.dateStr < filters.dateRangeStart) {
        return false;
      }
      if (filters.dateRangeEnd && event.dateStr > filters.dateRangeEnd) {
        return false;
      }

      // Search filter
      if (filters.searchQuery && filters.searchQuery.length > 0) {
        const query = filters.searchQuery.toLowerCase();
        if (!event.title.toLowerCase().includes(query)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get unique dates from event stream.
   */
  static getUniqueDates(events: ListViewEvent[]): string[] {
    const dates = new Set(events.map((e) => e.dateStr));
    return Array.from(dates).sort();
  }

  /**
   * Get date range of events.
   */
  static getDateRange(events: ListViewEvent[]): [string, string] | null {
    if (events.length === 0) return null;
    const dates = CalendarListEngine.getUniqueDates(events);
    return [dates[0], dates[dates.length - 1]];
  }
}

/**
 * KidSchedule – Calendar Week Engine
 *
 * Generates week-view data (7-day grid with hourly breakdown) for custody calendars.
 * Handles event positioning, time normalization, and responsive layout calculations.
 */

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
