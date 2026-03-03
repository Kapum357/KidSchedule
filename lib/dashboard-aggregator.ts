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

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Calculate monthly ownership percentages for the current month.
 */
function calculateMonthlyOwnership(engine: CustodyEngine, family: Family, now: Date): { [parentId: string]: number } {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const transitions = engine.getTransitionsInRange(monthStart, monthEnd);

  const ownership: { [parentId: string]: number } = {};
  const totalMs = monthEnd.getTime() - monthStart.getTime();

  // Initialize ownership for all parents
  for (const parent of family.parents) {
    ownership[parent.id] = 0;
  }

  // Add the initial period from month start to first transition
  let currentTime = monthStart.getTime();
  let currentParent = engine.getStatus(monthStart).currentParent;

  for (const transition of transitions) {
    const periodMs = transition.at.getTime() - currentTime;
    ownership[currentParent.id] += periodMs;
    currentParent = transition.toParent;
    currentTime = transition.at.getTime();
  }

  // Add the final period from last transition to month end
  const finalPeriodMs = monthEnd.getTime() - currentTime;
  ownership[currentParent.id] += finalPeriodMs;

  // Convert to percentages
  const percentages: { [parentId: string]: number } = {};
  for (const [parentId, ms] of Object.entries(ownership)) {
    percentages[parentId] = Math.round((ms / totalMs) * 100);
  }

  return percentages;
}

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
  /** Conflict detection window in minutes (defaults to 120). */
  conflictWindowMins?: number;
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

  // ── Upcoming Transitions ───────────────────────────────────────────────────
  const upcomingTransitions = engine.getUpcomingTransitions(now, 5);

  // ── Monthly Ownership Percentages ──────────────────────────────────────────
  const monthlyOwnership = calculateMonthlyOwnership(engine, input.family, now);

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
    upcomingTransitions,
    monthlyOwnership,
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

