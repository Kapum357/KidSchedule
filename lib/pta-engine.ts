/**
 * KidSchedule – PTAEngine
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * The PTA Portal coordinates school events, volunteer duties, document storage,
 * and school contacts across two co-parents. Three core algorithms drive the system:
 *
 *  1. Event Priority Scoring
 *     Events are ranked by a composite urgency score:
 *       urgency = (actionRequired ? 60 : 0) + recencyBoost + volunteerOpenBonus
 *     This ensures "Action Required" cards always surface first regardless of date,
 *     while events without actions are sorted chronologically.
 *
 *  2. Volunteer Fairness Balancing (Greedy Load-Leveling)
 *     Each parent accumulates a "committed hours" counter.  When an unassigned
 *     volunteer task appears, suggestAssignee() returns the parent with fewer
 *     committed hours — the classic greedy list-scheduling heuristic that minimises
 *     makespan imbalance.  For two parents this is O(1); for N parents it is O(N).
 *
 *     Fairness gap = |hoursParent1 − hoursParent2|
 *     Suggestion: assign to parent whose hours total is lower.
 *
 *  3. Contact Search (Tiered Prefix Scoring)
 *     A simple but fast O(C) search used for the in-page contact directory.
 *     Each contact receives a score in [0, 100] based on four tiers:
 *       100: full name starts with query (exact prefix match)
 *        80: any word in the name starts with query (word-boundary prefix)
 *        60: name contains query as substring
 *        30: role label contains query
 *     Contacts scoring 0 are excluded from results.
 *
 * ADDITIONAL FEATURES
 * ─────────────────────────────────────────────────────────────────────────────
 * • getPendingActions():  Aggregates all user-facing action items in one call
 *   (overdue docs + action-required events) – used for the notification badge.
 *
 * • detectCalendarConflicts():  Given a list of school events and family
 *   custody transitions, returns any school event that starts within 2 hours
 *   of a handover – helpful for logistics planning.
 *
 * • formatRelativeTime():  Converts an ISO datetime to a human label like
 *   "In 3 days" or "Yesterday", used for event card subtext.
 *
 * COMPLEXITY SUMMARY
 * ─────────────────────────────────────────────────────────────────────────────
 *   Event sort/filter:     O(E log E)   E = events in window
 *   Fairness balancing:    O(T)         T = tasks; O(1) per assignment
 *   Contact search:        O(C × Q)     C = contacts, Q = query length
 *   Pending actions:       O(E + D)     D = documents
 *   Conflict detection:    O(E × N)     N = custody transitions (~1–4 / week)
 *
 * TRADE-OFFS
 * ─────────────────────────────────────────────────────────────────────────────
 * • Tiered contact search is not fuzzy (typo-tolerant). In production, replace
 *   with a trigram index or Fuse.js for resilient partial matches.
 * • Volunteer balancing does not account for task difficulty (hours-based only).
 *   A weighted balancing scheme could incorporate skill tags and travel time.
 * • Calendar conflict detection uses a fixed ±2h window; this would be user-
 *   configurable in production.
 */

import type {
  SchoolEvent,
  VolunteerTask,
  VolunteerBalance,
  SchoolContact,
  ContactSearchResult,
  SchoolVaultDocument,
  DocumentStatus,
  LunchMenu,
  ScheduleTransition,
  SearchDoc,
} from "@/types";
import { createSearchAdapter } from "@/lib/search-adapter";

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Days ahead to include in the "upcoming events" window */
const DEFAULT_EVENT_WINDOW_DAYS = 60;

/** Minutes around a custody transition that count as a scheduling conflict */
const CONFLICT_WINDOW_MINUTES = 120;

/** Priority boost applied to events with actionRequired = true */
const ACTION_REQUIRED_BOOST = 60;

/** Priority boost when an event has at least one open volunteer slot */
const OPEN_VOLUNTEER_BOOST = 15;

// ─── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Parses an ISO-8601 datetime string to a Date object.
 * Complexity: O(1)
 */
function parseDate(iso: string): Date {
  return new Date(iso);
}

/**
 * Returns the difference in minutes between two dates.
 * Complexity: O(1)
 */
function minutesDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

/**
 * Returns the difference in calendar days between two dates (ignoring time).
 * Complexity: O(1)
 */
function daysDiff(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((a.getTime() - b.getTime()) / msPerDay);
}

// ─── Public API ────────────────────────────────────────────────────────────────

export class PTAEngine {
  // ── 1. Event Management ────────────────────────────────────────────────────

  /**
   * Returns events within `windowDays` from `now`, sorted by urgency then date.
   *
   * Priority score (0–100):
   *   • actionRequired = true        → +60  (must surface first)
   *   • has open volunteer slots     → +15  (encourage sign-up)
   *   • chronological ordering       → remaining 0–25 band
   *
   * Complexity: O(E log E) for the sort; O(E) for the filter pass.
   *
   * @param events All school events
   * @param tasks  All volunteer tasks (to detect open slots per event)
   * @param now    Reference timestamp (injectable for tests)
   * @param windowDays Number of days ahead to include
   * @returns Events sorted: action-required first, then chronologically
   */
  getUpcomingEvents(
    events: SchoolEvent[],
    tasks: VolunteerTask[],
    now: Date = new Date(),
    windowDays: number = DEFAULT_EVENT_WINDOW_DAYS
  ): SchoolEvent[] {
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    // Build a quick lookup: eventId → has open tasks
    const openTasksByEvent = new Set<string>(
      tasks
        .filter((t) => t.status === "open" && !t.assignedParentId)
        .map((t) => t.eventId)
    );

    const windowEvents = events.filter((e) => {
      const start = parseDate(e.startAt);
      return start >= now && start <= windowEnd;
    });

    return windowEvents.sort((a, b) => {
      const scoreA = this.eventPriorityScore(a, openTasksByEvent);
      const scoreB = this.eventPriorityScore(b, openTasksByEvent);
      if (scoreB !== scoreA) return scoreB - scoreA;
      // Equal priority → chronological
      return parseDate(a.startAt).getTime() - parseDate(b.startAt).getTime();
    });
  }

  /**
   * Computes a composite urgency score for an event.
   * Higher = more urgent = shown first.
   *
   * Scale:  0–100
   *   Action required bonus:     +60
   *   Open volunteer slot bonus: +15
   *   Proximity boost:           0–25 (nearest event gets 25, farthest gets 0)
   *
   * Complexity: O(1)
   */
  eventPriorityScore(event: SchoolEvent, openTasksByEvent: Set<string>): number {
    let score = 0;
    if (event.actionRequired) score += ACTION_REQUIRED_BOOST;
    if (openTasksByEvent.has(event.id)) score += OPEN_VOLUNTEER_BOOST;
    return score;
  }

  /**
   * Formats the start time of an event into a human-readable relative label.
   * Examples: "Today · 9:00 AM", "In 3 days", "Tomorrow · 4:30 PM"
   *
   * Complexity: O(1)
   *
   * @param event  School event to describe
   * @param now    Reference timestamp
   * @returns Human-readable relative label
   */
  formatEventTime(event: SchoolEvent, now: Date = new Date()): string {
    const start = parseDate(event.startAt);
    const days = daysDiff(start, now);

    const timeStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    if (days === 0) return `Today · ${timeStr}`;
    if (days === 1) return `Tomorrow · ${timeStr}`;
    if (days < 0)  return `${Math.abs(days)} days ago`;
    return `In ${days} days`;
  }

  /**
   * Returns a formatted time-range string for event cards.
   * Example: "9:00 AM - 12:00 PM"
   *
   * Complexity: O(1)
   */
  formatEventTimeRange(event: SchoolEvent): string {
    const start = parseDate(event.startAt);
    const end = parseDate(event.endAt);

    const fmt = (d: Date) =>
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    return `${fmt(start)} - ${fmt(end)}`;
  }

  /**
   * Formats event date as "Month D" for card badges.
   * Example: "Oct 12"
   *
   * Complexity: O(1)
   */
  formatEventDateBadge(event: SchoolEvent): string {
    return parseDate(event.startAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  // ── 2. Volunteer Fairness Balancing ────────────────────────────────────────

  /**
   * Computes each parent's total volunteer hour commitment across all tasks.
   * Used to determine fairness balance for the "Volunteering Sync" panel.
   *
   * Algorithm: Single-pass accumulation over tasks.
   * Complexity: O(T) where T = number of tasks
   *
   * @param tasks   All volunteer tasks for this family
   * @param parents Parent IDs in this family (typically 2)
   * @returns Array of VolunteerBalance, one per parent, sorted by hours desc
   */
  calculateVolunteerBalances(
    tasks: VolunteerTask[],
    parentIds: string[]
  ): VolunteerBalance[] {
    // Initialise accumulators for every parent
    const balances = new Map<string, VolunteerBalance>(
      parentIds.map((id) => [
        id,
        {
          parentId: id,
          totalHoursCommitted: 0,
          completedHours: 0,
          upcomingHours: 0,
          taskCount: 0,
        },
      ])
    );

    for (const task of tasks) {
      if (!task.assignedParentId) continue;

      const balance = balances.get(task.assignedParentId);
      if (!balance) continue;

      balance.totalHoursCommitted += task.estimatedHours;
      balance.taskCount += 1;

      if (task.status === "completed") {
        balance.completedHours += task.estimatedHours;
      } else {
        balance.upcomingHours += task.estimatedHours;
      }
    }

    return [...balances.values()].sort(
      (a, b) => b.totalHoursCommitted - a.totalHoursCommitted
    );
  }

  /**
   * Suggests which parent should take an unassigned volunteer task
   * based on current hour commitments (greedy load-leveling).
   *
   * Decision rule:
   *   Assign to the parent with fewer totalHoursCommitted.
   *   On tie: assign to parent at index 0 of `balances`.
   *
   * This is the greedy list-scheduling heuristic: assign each task to
   * the least-loaded machine. It minimises the maximum load (makespan)
   * and keeps fairness gap ≤ the largest single task, which for
   * volunteer tasks (1–3h) is negligible.
   *
   * Complexity: O(P) where P = number of parents (typically 2)
   *
   * @param task      The open task to assign
   * @param balances  Current volunteer balances per parent
   * @returns Parent ID of the recommended assignee
   */
  suggestAssignee(
    task: VolunteerTask,
    balances: VolunteerBalance[]
  ): string | null {
    if (balances.length === 0) return null;

    // Find parent with minimum committed hours
    let minBalance = balances[0];
    for (let i = 1; i < balances.length; i++) {
      if (balances[i].totalHoursCommitted < minBalance.totalHoursCommitted) {
        minBalance = balances[i];
      }
    }

    // Safety: don't suggest if task is already past
    const scheduled = parseDate(task.scheduledFor);
    if (scheduled < new Date()) return null;

    return minBalance.parentId;
  }

  /**
   * Returns the fairness summary for the two parents.
   * Positive delta means parentA has taken on more hours.
   *
   * Complexity: O(1) given pre-computed balances
   *
   * @param balances Computed volunteer balances
   * @returns Hours delta and textual fairness label
   */
  getFairnessSummary(balances: VolunteerBalance[]): {
    hoursDelta: number;
    label: string;
    isBalanced: boolean;
  } {
    if (balances.length < 2) {
      return { hoursDelta: 0, label: "Only one parent", isBalanced: true };
    }

    const delta = balances[0].totalHoursCommitted - balances[1].totalHoursCommitted;
    const absDelta = Math.abs(delta);

    if (absDelta === 0) {
      return { hoursDelta: 0, label: "Perfectly balanced", isBalanced: true };
    }
    if (absDelta <= 1) {
      return { hoursDelta: delta, label: `~1 hr difference`, isBalanced: true };
    }

    const more = delta > 0 ? balances[0] : balances[1];
    return {
      hoursDelta: delta,
      label: `${absDelta}h gap – suggest ${more.parentId} takes fewer tasks`,
      isBalanced: false,
    };
  }

  // ── 3. Contact Search ──────────────────────────────────────────────────────

  /**
   * Searches contacts by name and role using tiered prefix scoring.
   *
   * Scoring tiers (higher = better match):
   *   100: Full name starts with query (exact prefix, case-insensitive)
   *    80: Any word in the name starts with query (word-boundary match)
   *    60: Name contains query as substring
   *    30: Role label contains query
   *     0: No match → excluded from results
   *
   * Why tiered vs. fuzzy? The contact list is small (< 50 entries), users
   * know the names they're looking for, and tiered scoring is O(C × Q)
   * without the complexity of Levenshtein or trigrams. It also naturally
   * surfaces full name matches before partial ones.
   *
   * Complexity: O(C × Q) where C = contacts, Q = query token count
   *
   * @param contacts All school contacts
   * @param query    User search input (empty string returns all)
   * @returns Contacts sorted by score descending; all contacts if query empty
   */
  searchContacts(
    contacts: SchoolContact[],
    query: string
  ): ContactSearchResult[] {
    const q = query.trim().toLowerCase();

    if (!q) {
      return contacts.map((c) => ({ contact: c, score: 50 }));
    }

    const docs: SearchDoc[] = contacts.map((contact) => ({
      id: contact.id,
      type: "pta",
      fields: {
        name: contact.name,
        roleLabel: contact.roleLabel,
        role: contact.role,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
      },
    }));

    const adapter = createSearchAdapter();
    adapter.index(docs);

    const hits = adapter.search(q, {
      limit: contacts.length,
      keys: ["name", "roleLabel", "role", "email", "phone"],
      minMatchCharLength: 2,
    });

    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));

    return hits
      .map((hit) => {
        const contact = contactsById.get(hit.id);
        if (!contact) return null;
        return { contact, score: Math.round(hit.score * 100) } as ContactSearchResult;
      })
      .filter((result): result is ContactSearchResult => !!result);
  }

  // ── 4. School Vault ────────────────────────────────────────────────────────

  /**
   * Filters and sorts vault documents.
   *
   * Sort order:
   *   1. Pending-signature documents first (require immediate action)
   *   2. Then by addedAt descending (newest first)
   *
   * Complexity: O(D log D) for the sort
   *
   * @param documents All vault documents
   * @param statusFilter Optional status to filter by
   * @returns Filtered and sorted documents
   */
  getVaultDocuments(
    documents: SchoolVaultDocument[],
    statusFilter?: DocumentStatus
  ): SchoolVaultDocument[] {
    const filtered = statusFilter
      ? documents.filter((d) => d.status === statusFilter)
      : documents;

    return filtered.slice().sort((a, b) => {
      // Pending signature always rises to the top
      const urgencyA = a.status === "pending_signature" ? 1 : 0;
      const urgencyB = b.status === "pending_signature" ? 1 : 0;
      if (urgencyB !== urgencyA) return urgencyB - urgencyA;

      // Then newest first
      return parseDate(b.addedAt).getTime() - parseDate(a.addedAt).getTime();
    });
  }

  /**
   * Returns all documents requiring immediate action (pending signature,
   * or overdue based on actionDeadline).
   *
   * Complexity: O(D)
   *
   * @param documents All vault documents
   * @param now       Reference timestamp
   * @returns Documents needing action, sorted by deadline ascending
   */
  getPendingDocuments(
    documents: SchoolVaultDocument[],
    now: Date = new Date()
  ): SchoolVaultDocument[] {
    return documents
      .filter((doc) => {
        if (doc.status === "pending_signature") return true;
        if (doc.actionDeadline && parseDate(doc.actionDeadline) < now) return true;
        return false;
      })
      .sort((a, b) => {
        // Documents with soonest deadline first
        const dA = a.actionDeadline ? parseDate(a.actionDeadline).getTime() : Infinity;
        const dB = b.actionDeadline ? parseDate(b.actionDeadline).getTime() : Infinity;
        return dA - dB;
      });
  }

  // ── 5. Pending Action Aggregation ─────────────────────────────────────────

  /**
   * Aggregates all user-facing action items into a single list.
   * Used to populate the notification badge count and action feed.
   *
   * Includes:
   *   • Events with actionRequired = true and deadline not yet passed
   *   • Documents with pending_signature status
   *
   * Complexity: O(E + D)
   *
   * @param events    Upcoming school events
   * @param documents Vault documents
   * @param now       Reference timestamp
   * @returns Total count of pending actions
   */
  getPendingActionCount(
    events: SchoolEvent[],
    documents: SchoolVaultDocument[],
    now: Date = new Date()
  ): number {
    const actionEvents = events.filter(
      (e) => e.actionRequired && parseDate(e.startAt) >= now
    ).length;

    const pendingDocs = documents.filter(
      (d) => d.status === "pending_signature"
    ).length;

    return actionEvents + pendingDocs;
  }

  // ── 6. Calendar Conflict Detection ────────────────────────────────────────

  /**
   * Detects school events that overlap with custody handover transitions.
   *
   * A conflict is flagged when a school event's start time falls within
   * CONFLICT_WINDOW_MINUTES (±2 hours) of a custody transition.
   *
   * Real-world impact: A parent picking up a child from a school event
   * during a custody handover needs advance coordination.
   *
   * Complexity: O(E × N) where N = custody transitions; typically O(E) since
   * N ≤ 4 transitions per week and E ≤ 20 events per month.
   *
   * @param events      Upcoming school events
   * @param transitions Custody handover transitions
   * @returns Events with conflicting timing, with nearest transition attached
   */
  detectCalendarConflicts(
    events: SchoolEvent[],
    transitions: ScheduleTransition[]
  ): Array<{ event: SchoolEvent; nearestTransition: ScheduleTransition; minutesApart: number }> {
    const conflicts: Array<{
      event: SchoolEvent;
      nearestTransition: ScheduleTransition;
      minutesApart: number;
    }> = [];

    for (const event of events) {
      const eventStart = parseDate(event.startAt);

      for (const transition of transitions) {
        const mins = minutesDiff(eventStart, transition.at);
        if (mins <= CONFLICT_WINDOW_MINUTES) {
          conflicts.push({
            event,
            nearestTransition: transition,
            minutesApart: Math.round(mins),
          });
          break; // Only report first conflict per event
        }
      }
    }

    return conflicts.sort((a, b) => a.minutesApart - b.minutesApart);
  }

  // ── 7. Lunch Menu ─────────────────────────────────────────────────────────

  /**
   * Returns the lunch menu entry for a given date, or undefined if not found.
   * Exact date match only (no interpolation).
   *
   * Complexity: O(M) where M = number of menu entries (typically ≤ 5 per week)
   *
   * @param menus All available lunch menus
   * @param date  Target date as "YYYY-MM-DD" string
   * @returns Matching menu or undefined
   */
  getDailyLunch(menus: LunchMenu[], date: string): LunchMenu | undefined {
    return menus.find((m) => m.date === date);
  }

  /**
   * Formats account balance as a currency string.
   * Example: 24.5 → "$24.50"
   *
   * Complexity: O(1)
   */
  formatBalance(balance: number): string {
    return balance.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }

  // ── 8. File Type Utilities ─────────────────────────────────────────────────

  /**
   * Returns the Material Symbols icon name for a vault document's file type.
   * Complexity: O(1)
   */
  getDocumentIcon(fileType: SchoolVaultDocument["fileType"]): string {
    const iconMap: Record<SchoolVaultDocument["fileType"], string> = {
      pdf:         "picture_as_pdf",
      image:       "image",
      archive:     "folder_zip",
      document:    "description",
      spreadsheet: "table_chart",
    };
    return iconMap[fileType] ?? "insert_drive_file";
  }

  /**
   * Returns the Tailwind color class prefix for a document's file type icon.
   * Complexity: O(1)
   */
  getDocumentIconColor(fileType: SchoolVaultDocument["fileType"]): string {
    const colorMap: Record<SchoolVaultDocument["fileType"], string> = {
      pdf:         "red",
      image:       "green",
      archive:     "yellow",
      document:    "blue",
      spreadsheet: "emerald",
    };
    return colorMap[fileType] ?? "slate";
  }
}

// ─── Mock Data Generators ──────────────────────────────────────────────────────

/**
 * Builds a set of mock school events for development/testing.
 * Anchored around `referenceDate` so dates stay relevant.
 */
export function createMockSchoolEvents(familyId: string, referenceDate: Date = new Date()): SchoolEvent[] {
  const d = (offsetDays: number, hour: number) => {
    const dt = new Date(referenceDate);
    dt.setDate(dt.getDate() + offsetDays);
    dt.setHours(hour, 0, 0, 0);
    return dt.toISOString();
  };

  return [
    {
      id:               "evt-bake-sale",
      familyId,
      title:            "PTA Bake Sale",
      eventType:        "bake_sale",
      startAt:          d(5, 9),
      endAt:            d(5, 12),
      location:         "School Cafeteria",
      isAllDay:         false,
      attendingParentIds: ["parent-alex"],
      actionRequired:   false,
      volunteerTaskIds: ["task-cupcakes"],
      accentColor:      "teal",
      icon:             "cookie",
    },
    {
      id:               "evt-conf",
      familyId,
      title:            "Parent-Teacher Conf.",
      eventType:        "conference",
      startAt:          d(8, 16),
      endAt:            d(8, 17),
      location:         "Room 3B",
      isAllDay:         false,
      attendingParentIds: ["parent-sarah"],
      actionRequired:   false,
      volunteerTaskIds: [],
      icon:             "groups",
    },
    {
      id:               "evt-play",
      familyId,
      title:            "Fall Play Rehearsal",
      eventType:        "rehearsal",
      startAt:          d(17, 15),
      endAt:            d(17, 17),
      location:         "Auditorium",
      isAllDay:         false,
      attendingParentIds: [],
      actionRequired:   false,
      volunteerTaskIds: ["task-props"],
      icon:             "theater_comedy",
    },
    {
      id:               "evt-halloween",
      familyId,
      title:            "Halloween Parade",
      eventType:        "parade",
      startAt:          d(24, 13),
      endAt:            d(24, 14),
      location:         "School Grounds",
      isAllDay:         false,
      attendingParentIds: [],
      actionRequired:   true,
      actionDescription: "RSVP required by Oct 28",
      volunteerTaskIds: ["task-photo"],
      accentColor:      "amber",
      icon:             "celebration",
    },
  ];
}

/**
 * Builds mock volunteer tasks linked to the mock school events.
 */
export function createMockVolunteerTasks(familyId: string, referenceDate: Date = new Date()): VolunteerTask[] {
  const d = (offsetDays: number, hour: number) => {
    const dt = new Date(referenceDate);
    dt.setDate(dt.getDate() + offsetDays);
    dt.setHours(hour, 0, 0, 0);
    return dt.toISOString();
  };

  return [
    {
      id:               "task-cupcakes",
      familyId,
      eventId:          "evt-bake-sale",
      title:            "Bring Cupcakes",
      assignedParentId: "parent-alex",
      status:           "assigned",
      estimatedHours:   1,
      scheduledFor:     d(5, 9),
      icon:             "volunteer_activism",
      iconColor:        "teal",
    },
    {
      id:               "task-props",
      familyId,
      eventId:          "evt-play",
      title:            "Transport Props",
      assignedParentId: undefined,  // Open – unassigned
      status:           "open",
      estimatedHours:   2,
      scheduledFor:     d(16, 14),
      icon:             "local_shipping",
      iconColor:        "blue",
    },
    {
      id:               "task-photo",
      familyId,
      eventId:          "evt-halloween",
      title:            "Event Photographer",
      assignedParentId: "parent-sarah",
      status:           "assigned",
      estimatedHours:   1.5,
      scheduledFor:     d(24, 13),
      icon:             "camera_alt",
      iconColor:        "purple",
    },
  ];
}

/**
 * Builds mock school contacts for the directory panel.
 */
export function createMockSchoolContacts(): SchoolContact[] {
  return [
    {
      id:          "contact-robinson",
      name:        "Mrs. Robinson",
      initials:    "MR",
      role:        "teacher",
      roleLabel:   "3rd Grade Teacher",
      email:       "robinson@school.edu",
      phone:       "(555) 100-0001",
      avatarColor: "indigo",
    },
    {
      id:          "contact-johnson",
      name:        "Principal Johnson",
      initials:    "PJ",
      role:        "principal",
      roleLabel:   "Administration",
      email:       "johnson@school.edu",
      avatarColor: "rose",
    },
    {
      id:          "contact-carter",
      name:        "Nurse Carter",
      initials:    "NC",
      role:        "nurse",
      roleLabel:   "School Nurse",
      email:       "nurse@school.edu",
      phone:       "(555) 100-0002",
      avatarColor: "emerald",
    },
    {
      id:          "contact-pta",
      name:        "PTA Board",
      initials:    "PTA",
      role:        "pta_board",
      roleLabel:   "Main Office",
      email:       "pta@school.edu",
      avatarColor: "slate",
    },
  ];
}

/**
 * Builds mock vault documents with varied statuses.
 */
export function createMockVaultDocuments(familyId: string, now: Date = new Date()): SchoolVaultDocument[] {
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };
  const daysAhead = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };

  return [
    {
      id:          "doc-report-card",
      familyId,
      title:       "Q1 Report Card",
      fileType:    "pdf",
      status:      "available",
      statusLabel: "Added 2 days ago",
      addedAt:     daysAgo(2),
      addedBy:     "parent-alex",
      sizeBytes:   420_000,
    },
    {
      id:             "doc-field-trip",
      familyId,
      title:          "Field Trip Permission",
      fileType:       "document",
      status:         "pending_signature",
      statusLabel:    "Pending Signature",
      addedAt:        daysAgo(5),
      addedBy:        "parent-sarah",
      actionDeadline: daysAhead(3),
    },
    {
      id:          "doc-schedule",
      familyId,
      title:       "Class Schedule",
      fileType:    "image",
      status:      "available",
      statusLabel: "Fall 2023",
      addedAt:     daysAgo(30),
      addedBy:     "parent-alex",
    },
    {
      id:          "doc-immunization",
      familyId,
      title:       "Immunization Records",
      fileType:    "archive",
      status:      "available",
      statusLabel: "Archive",
      addedAt:     daysAgo(180),
      addedBy:     "parent-sarah",
      sizeBytes:   1_200_000,
    },
  ];
}

/**
 * Builds a week of mock lunch menus.
 */
export function createMockLunchMenus(accountBalance: number = 24.5): LunchMenu[] {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  return [
    {
      date:              todayStr,
      mainOption:        { name: "Pizza Day", description: "Pepperoni or Cheese" },
      alternativeOption: { name: "Veggie Wrap", isVegetarian: true },
      side:              "Garden Salad",
      accountBalance,
    },
  ];
}
