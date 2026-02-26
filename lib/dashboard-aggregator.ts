/**
 * KidSchedule – DashboardAggregator
 *
 * Composes the DashboardData object that drives the parent dashboard UI.
 * The aggregator is a pure function – it accepts raw domain records and
 * returns a single DashboardData snapshot with no side-effects.
 *
 * DESIGN RATIONALE
 * ─────────────────────────────────────────────────────────────────────────────
 * The dashboard needs data from multiple independent domains (custody engine,
 * communication climate, activity feed, reminders, etc.).  Fetching these
 * simultaneously in a Server Component (Promise.all) and then composing them
 * here keeps each domain's logic isolated while giving the UI a single
 * well-typed aggregate to render.
 *
 * PERFORMANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * All CustodyEngine and ConflictClimateAnalyzer computations run in O(B)
 * and O(M × P) respectively (B = schedule blocks, M = messages in window,
 * P = pattern list length – both constant and small).  The aggregator itself
 * is O(E log E) for the event sort – dominated by the number of future events
 * in the calendar query window.
 *
 * This entire module is safe to run on the server (no browser APIs).
 */

import { CustodyEngine } from "@/lib/custody-engine";
import { CalendarMonthEngine } from "@/lib/calendar-engine";
import { ConflictClimateAnalyzer } from "@/lib/conflict-analyzer";
import { SettingsEngine } from "@/lib/settings-engine";
import type {
  ActivityItem,
  CalendarEvent,
  DashboardData,
  Expense,
  Family,
  Message,
  Moment,
  Parent,
  Reminder,
  ScheduleChangeRequest,
} from "@/types";

// ─── Aggregator Inputs ────────────────────────────────────────────────────────

export interface AggregatorInput {
  /** The authenticated user's parent record. */
  currentParent: Parent;
  /** The full family document (includes both parents + children + schedule). */
  family: Family;
  /** All calendar events – aggregator will filter/sort. */
  events: CalendarEvent[];
  /** All change requests for the family. */
  changeRequests: ScheduleChangeRequest[];
  /** All messages in the co-parenting thread. */
  messages: Message[];
  /** All expenses for the family. */
  expenses: Expense[];
  /** Shared moments visible to this parent. */
  moments: Moment[];
  /** Reminders owned by this parent. */
  reminders: Reminder[];
  /** Reference "now" – injectable for testing (defaults to new Date()). */
  now?: Date;
  /** Max upcoming events to surface (defaults to 5). */
  upcomingCount?: number;
  /** Max recent activity items to surface (defaults to 10). */
  activityCount?: number;
}

// ─── Activity Builder ─────────────────────────────────────────────────────────

/**
 * Derives a flat ActivityItem feed from the raw domain records.
 *
 * Each category is mapped to an ActivityItem with a human summary.
 * Items are sorted newest-first; only the most recent `limit` are returned.
 *
 * Complexity: O((E + C + M) log(E + C + M)) for the sort.
 */
function buildActivityFeed(
  input: Omit<AggregatorInput, "now" | "upcomingCount" | "activityCount">,
  limit: number
): ActivityItem[] {
  const expenseItems = input.expenses.map((expense) =>
    createExpenseActivityItem(expense, input.family)
  );

  const messageItems = input.messages
    .filter((msg) => msg.senderId !== input.currentParent.id)
    .map((msg) => createMessageActivityItem(msg, input.family));

  const requestItems = input.changeRequests.map(createChangeRequestActivityItem);

  const items = [...expenseItems, ...messageItems, ...requestItems];

  items.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  return items.slice(0, limit);
}

function createExpenseActivityItem(
  expense: Expense,
  family: Family
): ActivityItem {
  const paidBy = family.parents.find((p) => p.id === expense.paidBy);
  const summary = paidBy
    ? `${paidBy.name} added an expense of $${(expense.totalAmount / 100).toFixed(2)} for ${expense.title.toLowerCase()}.`
    : `Expense of $${(expense.totalAmount / 100).toFixed(2)} added for ${expense.title.toLowerCase()}.`;

  return {
    id: `expense-${expense.id}`,
    type: "expense_added",
    actorId: expense.paidBy,
    occurredAt: expense.createdAt,
    entityId: expense.id,
    summary,
    meta: {
      amountCents: expense.totalAmount,
      currency: expense.currency,
      paymentStatus: expense.paymentStatus,
    },
  };
}

function createMessageActivityItem(msg: Message, family: Family): ActivityItem {
  const sender = family.parents.find((p) => p.id === msg.senderId);
  const preview = msg.body.length > 60 ? `"${msg.body.slice(0, 60)}…"` : `"${msg.body}"`;

  return {
    id: `msg-${msg.id}`,
    type: "message_received",
    actorId: msg.senderId,
    occurredAt: msg.sentAt,
    entityId: msg.id,
    summary: sender
      ? `${sender.name} sent: ${preview}`
      : `New message: ${preview}`,
    meta: { read: !!msg.readAt },
  };
}

function createChangeRequestActivityItem(
  req: ScheduleChangeRequest
): ActivityItem {
  return {
    id: `req-${req.id}`,
    type: getChangeRequestActivityType(req.status),
    actorId: req.requestedBy,
    occurredAt: req.respondedAt ?? req.createdAt,
    entityId: req.id,
    summary: `Schedule change requested: ${req.title}`,
    meta: { status: req.status },
  };
}

function getChangeRequestActivityType(
  status: ScheduleChangeRequest["status"]
): ActivityItem["type"] {
  switch (status) {
    case "accepted":
      return "schedule_change_accepted";
    case "declined":
      return "schedule_change_declined";
    default:
      return "schedule_change_requested";
  }
}

// ─── Main Aggregator Function ─────────────────────────────────────────────────

/**
 * Builds the complete DashboardData object for a single parent's view.
 *
 * All heavy work (CustodyEngine, ConflictClimateAnalyzer) runs synchronously
 * and is fast enough for a Next.js Server Component render.  Callers should
 * fetch raw records in parallel (via Promise.all) before calling this function.
 *
 * @example
 * // In a Next.js Server Component:
 * const [family, events, messages, ...] = await Promise.all([
 *   db.family.findUnique({ where: { id: familyId } }),
 *   db.calendarEvent.findMany({ ... }),
 *   db.message.findMany({ ... }),
 *   ...
 * ]);
 * const dashboard = aggregateDashboard({ currentParent, family, events, messages, ... });
 */
export function aggregateDashboard(input: AggregatorInput): DashboardData {
  const now = input.now ?? new Date();
  const upcomingCount = input.upcomingCount ?? 5;
  const activityCount = input.activityCount ?? 10;

  // ── Custody Status ─────────────────────────────────────────────────────────
  const engine = new CustodyEngine(input.family);
  const custody = engine.getStatus(now);

  // ── Upcoming Events ────────────────────────────────────────────────────────
  const upcomingEvents = input.events
    .filter((e) => new Date(e.startAt).getTime() >= now.getTime())
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    )
    .slice(0, upcomingCount);

  // ── Calendar Conflicts ─────────────────────────────────────────────────────
  const settingsEngine = new SettingsEngine();
  const familySettings = settingsEngine.resolveFamilySettings(input.family.id, {
    conflictWindow: { windowMins: input.conflictWindowMins ?? 120 },
  });
  const calendarEngine = new CalendarMonthEngine(input.family);
  const calendarConflicts = calendarEngine.detectConflicts(
    input.events,
    familySettings.conflictWindow.windowMins
  );

  // ── Pending Change Requests ────────────────────────────────────────────────
  const pendingChangeRequests = input.changeRequests.filter(
    (r) => r.status === "pending"
  );

  // ── Conflict Climate ───────────────────────────────────────────────────────
  const analyzer = new ConflictClimateAnalyzer({ windowDays: 30 });
  const climate = analyzer.analyze(input.messages, now);

  // ── Unread Message Count ───────────────────────────────────────────────────
  const unreadMessageCount = input.messages.filter(
    (m) => m.senderId !== input.currentParent.id && !m.readAt
  ).length;

  // ── Activity Feed ──────────────────────────────────────────────────────────
  const recentActivity = buildActivityFeed(input, activityCount);

  // ── Recent Moments (newest first) ─────────────────────────────────────────
  const moments = [...input.moments].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    family: input.family,
    currentParent: input.currentParent,
    custody,
    upcomingEvents,
    calendarConflicts,
    pendingChangeRequests,
    recentActivity,
    unreadMessageCount,
    climate,
    moments,
    reminders: input.reminders,
  };
}

// ─── Seed / Mock Data ─────────────────────────────────────────────────────────

/**
 * Returns a realistic mock AggregatorInput for development and Storybook.
 *
 * The anchor date is set 12 days ago so the current block is mid-cycle on a
 * 2-2-3 schedule, giving a non-trivial "next transition" time.
 */
export function createMockInput(now: Date = new Date()): AggregatorInput {
  const PARENT_A_ID = "parent-alex-001";
  const PARENT_B_ID = "parent-sarah-002";
  const FAMILY_ID = "family-001";
  const CHILD_ID = "child-emma-001";

  const parentAlex: Parent = {
    id: PARENT_A_ID,
    name: "Alex M.",
    email: "alex@example.com",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAMm9PKE77NmQRxRk8-lRarDuoVKfumrSvirCCC1A-bI8clVSNMQKx4ACuGOkMJh_E_4R-vkLrgaVp-DyFMt5Hk6ZGqn15tajsGHfYRzHlrqJRjiygOAoy_OQA1JOaoLQrL_RX6_PPl7SZ16RDQu9V2DPhgAAf9ioG_LAr-yCPX4bKT4-3Qn-40Q7Zem1C6pZcUwXl_7ORPkJxx2ZQLPcaOYqyOkfTVOMG8NkDh2LrTMf5Q9hZl1NwL_aLAVtgf86GlT7rJ0Cbp_mA",
  };

  const parentSarah: Parent = {
    id: PARENT_B_ID,
    name: "Sarah P.",
    email: "sarah@example.com",
  };

  // Anchor = 12 days ago at 5 PM to put us mid-cycle.
  const anchor = new Date(now);
  anchor.setDate(anchor.getDate() - 12);
  const anchorDate = anchor.toISOString().slice(0, 10);

  const family = {
    id: FAMILY_ID,
    parents: [parentAlex, parentSarah] as [Parent, Parent],
    children: [
      {
        id: CHILD_ID,
        firstName: "Emma",
        lastName: "M.",
        dateOfBirth: "2018-03-14",
      },
    ],
    custodyAnchorDate: anchorDate,
    schedule: {
      id: "sched-001",
      name: "2-2-3 Rotation",
      transitionHour: 17,
      blocks: [
        { parentId: PARENT_A_ID, days: 2, label: "Mon–Tue A" },
        { parentId: PARENT_B_ID, days: 2, label: "Wed–Thu B" },
        { parentId: PARENT_A_ID, days: 3, label: "Fri–Sun A" },
        { parentId: PARENT_B_ID, days: 2, label: "Mon–Tue B" },
        { parentId: PARENT_A_ID, days: 2, label: "Wed–Thu A" },
        { parentId: PARENT_B_ID, days: 3, label: "Fri–Sun B" },
      ],
    },
  };

  const makeDT = (daysFromNow: number, hour = 12): string => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const events: CalendarEvent[] = [
    {
      id: "evt-001",
      familyId: FAMILY_ID,
      title: "Independence Day",
      category: "holiday",
      startAt: makeDT(3, 0),
      endAt: makeDT(3, 23),
      allDay: true,
      confirmationStatus: "pending",
      createdBy: PARENT_A_ID,
    },
    {
      id: "evt-002",
      familyId: FAMILY_ID,
      title: "Soccer Practice",
      category: "activity",
      startAt: makeDT(7, 16),
      endAt: makeDT(7, 17),
      allDay: false,
      location: "West Field",
      confirmationStatus: "confirmed",
      createdBy: PARENT_B_ID,
    },
    {
      id: "evt-003",
      familyId: FAMILY_ID,
      title: "Emma's Dentist",
      category: "medical",
      startAt: makeDT(14, 10),
      endAt: makeDT(14, 11),
      allDay: false,
      location: "Cedar Dental Clinic",
      confirmationStatus: "confirmed",
      createdBy: PARENT_A_ID,
    },
  ];

  const changeRequests: ScheduleChangeRequest[] = [
    {
      id: "req-001",
      familyId: FAMILY_ID,
      requestedBy: PARENT_B_ID,
      title: "July 4th Weekend Swap",
      description: "Requesting to swap the July 4th weekend.",
      givingUpPeriodStart: makeDT(3),
      givingUpPeriodEnd: makeDT(6),
      requestedMakeUpStart: makeDT(17),
      requestedMakeUpEnd: makeDT(20),
      status: "pending",
      createdAt: makeDT(-1),
    },
  ];

  const daysAgo = (n: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  const messages: Message[] = [
    {
      id: "msg-001",
      familyId: FAMILY_ID,
      senderId: PARENT_B_ID,
      body: "Hey, just confirming that I picked up the soccer uniform for the practice on Thursday. Thanks for washing it!",
      sentAt: daysAgo(0.17), // ~4 hrs ago
    },
    {
      id: "msg-002",
      familyId: FAMILY_ID,
      senderId: PARENT_A_ID,
      body: "Sounds good! Emma mentioned she's excited for the game.",
      sentAt: daysAgo(0.1),
      readAt: daysAgo(0.08),
    },
    {
      id: "msg-003",
      familyId: FAMILY_ID,
      senderId: PARENT_B_ID,
      body: "Great. I agree we should confirm the July 4th plan soon. Please let me know.",
      sentAt: daysAgo(3),
    },
    {
      id: "msg-004",
      familyId: FAMILY_ID,
      senderId: PARENT_A_ID,
      body: "I appreciate you being flexible about the dentist appointment.",
      sentAt: daysAgo(7),
      readAt: daysAgo(6),
    },
  ];

  const expenses: Expense[] = [
    {
      id: "exp-001",
      familyId: FAMILY_ID,
      title: "Dental Co-pay",
      description: "Routine checkup co-pay",
      category: "medical",
      totalAmount: 4500, // $45.00 in cents
      currency: "USD",
      splitMethod: "50-50",
      paidBy: PARENT_B_ID,
      paymentStatus: "unpaid",
      date: daysAgo(0.08).slice(0, 10),
      createdAt: daysAgo(0.08),
    },
  ];

  const moments: Moment[] = [
    {
      id: "mom-001",
      familyId: FAMILY_ID,
      uploadedBy: PARENT_A_ID,
      mediaUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBVSQD_RW90_XcodVEx5jQyZiRAosXUpspR99CzIOAMHHiC6yU0WKoXBa5ITQaxnTIwZ0qnubbKnlM8VYtaH6YvDQsgVBSARZpMk1UgAzAv0YDtg2KI18aF64lfH_997FJd9Se-BQZUTPy78CdBIoPaPG_6Z3YwEqdmgy-ZIFEgTe_-p782C-4aQHeKa2_l9HcYC405cPjxAjO0hqYqi85_JNyc7H1OU7tqA7-Gb7F86Er098VgLenHNBar5cy6LdIh-Th3sWUSsYI",
      createdAt: daysAgo(2),
      reactions: [],
    },
    {
      id: "mom-002",
      familyId: FAMILY_ID,
      uploadedBy: PARENT_B_ID,
      mediaUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDWWEeghQBsEf44HL8SZQlf6TBqCRP4weSshS8R4Z-ZM73rawS4n0drf2UvTHVn3N7cPM691SPWfkdDvzCeb7LxZGvelnulIGFOgTAX0fy02SVIA2rt5uan3c1XRlLKYVP4mSLZZ61oQMc60BqIP9e2sgleY2rMSFodrjNH1AK71TP3jC28xoL9AGc6PrxiMHWaDtDnH9Ee8Ev96_iZQw14NXafbIsnHiXud1hu3SDyVaPwavEjY9iMA4Pgg86JUaX6xutupUQYdjk",
      createdAt: daysAgo(5),
      reactions: [{ parentId: PARENT_A_ID, emoji: "❤️", reactedAt: daysAgo(4) }],
    },
    {
      id: "mom-003",
      familyId: FAMILY_ID,
      uploadedBy: PARENT_A_ID,
      mediaUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBbl7-L1CvmkQDZPB9EbM2NOjH_E0SWt5bKXbfVMoNZcDLEXM1KJia2_zFZm3DFQl7tYWt7iBSNWmMUIvoMn0EnyxMq-oQ_f59iBsHkTaA03hfsfgRtACNhVwHfjUyudQhm7PwMt7vtqdRbtF_mkoNij7rVw7Gr1eX6im2Sogy5pXh9NqYknlYsTgKWR12yQBqcK5RNu0zTc_IbfDg4o4IW2ZSW_j_lxF4rU1sNWLwih7TsEfmZ4zWaOdBTsL4EnN05V1OMj30DHLk",
      createdAt: daysAgo(9),
      reactions: [],
    },
  ];

  const reminders: Reminder[] = [
    {
      id: "rem-001",
      familyId: FAMILY_ID,
      parentId: PARENT_A_ID,
      text: "Upload insurance card to Vault",
      completed: false,
    },
    {
      id: "rem-002",
      familyId: FAMILY_ID,
      parentId: PARENT_A_ID,
      text: "Sign school permission slip",
      completed: true,
      completedAt: daysAgo(1),
    },
  ];

  return {
    currentParent: parentAlex,
    family,
    events,
    changeRequests,
    messages,
    expenses,
    moments,
    reminders,
    now,
  };
}
