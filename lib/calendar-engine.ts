/**
 * KidSchedule – CalendarMonthEngine
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * The calendar view must integrate custody state, events, transitions, and
 * pending requests into a cohesive month grid. The engine orchestrates:
 *
 *   1. Custody per-day coloring using the CustodyEngine
 *   2. Split-custody detection (transition times that fall on a calendar day)
 *   3. Event overlay and stacking (transitions > expenses > notes)
 *   4. Sidebar sidebar transitions with location metadata
 *
 * DESIGN RATIONALE
 * ─────────────────────────────────────────────────────────────────────────────
 * The calendar is purely *read* – it computes derived state from raw records
 * without mutation. All algorithms are O(days in month × blocks) or O(events),
 * which are constant for any month view.
 *
 * Split-custody days are inferred by checking if a transition time falls
 * between midnight and midnight of the calendar day. This avoids storing
 * a separate "split day" flag in the database.
 */

import { CustodyEngine } from "@/lib/custody-engine";
import type {
  CalendarConflict,
  CalendarEvent,
  Family,
  Parent,
  ScheduleChangeRequest,
  ScheduleTransition,
} from "@/types";

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
