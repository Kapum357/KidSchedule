/**
 * KidSchedule – Calendar List Engine
 *
 * Generates list-view data (chronological event stream) for custody calendars.
 * Handles event sorting, filtering, date labeling, and grouping.
 */

import type {
  CalendarEvent,
  EventCategory,
  Parent,
  ScheduleChangeRequest,
  ScheduleTransition,
} from "@/types";

// ─── Public Types ────────────────────────────────────────────────────────────

export type CustodyColor = "primary" | "secondary" | "split";

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
  custodyColor?: CustodyColor; // For transitions
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
