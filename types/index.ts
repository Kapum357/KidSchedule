/**
 * KidSchedule – Core Domain Types
 *
 * These types model the shared vocabulary for the entire application.
 * They are intentionally framework-agnostic so they can be reused in
 * API route handlers, server components, and client components alike.
 */

// ─── Identity ────────────────────────────────────────────────────────────────

export type ParentId = string; // opaque UUID

export interface Parent {
  id: ParentId;
  name: string;
  email: string;
  avatarUrl?: string;
  /** Phone number used for SMS verification */
  phone?: string;
}

export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO-8601 date string "YYYY-MM-DD"
  avatarUrl?: string;
}

export interface Family {
  id: string;
  parents: [Parent, Parent];
  children: Child[];
  /** The ISO-8601 date that the custody arrangement started for cycle math */
  custodyAnchorDate: string;
  schedule: CustodySchedule;
}

// ─── Custody Schedule ─────────────────────────────────────────────────────────

/**
 * A schedule is composed of an ordered list of blocks.  The engine repeats
 * this list cyclically starting from `Family.custodyAnchorDate`.
 *
 * Example – alternating weeks:
 *   [{ parentId: "A", days: 7 }, { parentId: "B", days: 7 }]
 *
 * Example – 2-2-3 standard rotation (parent A holds first block):
 *   [
 *     { parentId: "A", days: 2 },
 *     { parentId: "B", days: 2 },
 *     { parentId: "A", days: 3 },
 *     { parentId: "B", days: 2 },
 *     { parentId: "A", days: 2 },
 *     { parentId: "B", days: 3 },
 *   ]
 *
 * The engine loops through these blocks indefinitely from the anchor date.
 */
export interface ScheduleBlock {
  parentId: ParentId;
  days: number; // number of 24-hour calendar days in this continuous block
  /** Optional label shown in the calendar (e.g. "Weekend", "Weekday") */
  label?: string;
}

export interface CustodySchedule {
  id: string;
  name: string; // e.g. "2-2-3 Rotation", "Alternating Weeks"
  blocks: ScheduleBlock[];
  /**
   * Hour of day (0-23) at which transitions occur.
   * Default is 17 (5 PM – school pickup).
   */
  transitionHour: number;
}

// ─── Computed Custody State ───────────────────────────────────────────────────

export interface CustodyStatus {
  /** Parent who currently holds custody */
  currentParent: Parent;
  /** Exact moment custody began for this period */
  periodStart: Date;
  /** Exact moment this custody period ends (= next transition) */
  periodEnd: Date;
  /** Human-friendly label for where the transition happens */
  transitionLocation?: string;
  /** Minutes remaining until the next transition */
  minutesUntilTransition: number;
}

export interface ScheduleTransition {
  at: Date;
  fromParent: Parent;
  toParent: Parent;
  location?: string;
}

// ─── Calendar Events ──────────────────────────────────────────────────────────

export type EventCategory =
  | "custody"      // auto-generated from schedule engine
  | "school"
  | "medical"
  | "activity"     // sports, clubs, lessons
  | "holiday"      // statutory holiday with special schedule rules
  | "other";

export type ConfirmationStatus = "confirmed" | "pending" | "declined";

export interface CalendarEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  category: EventCategory;
  startAt: string; // ISO-8601 datetime
  endAt: string;   // ISO-8601 datetime
  allDay: boolean;
  location?: string;
  /** Which parent is responsible / present */
  parentId?: ParentId;
  confirmationStatus: ConfirmationStatus;
  createdBy: ParentId;
}

// ─── Schedule Change Requests ─────────────────────────────────────────────────

export type ChangeRequestStatus =
  | "draft"
  | "pending"    // submitted, awaiting other parent's response
  | "accepted"
  | "declined"
  | "countered"  // other parent proposed a different swap
  | "expired";   // no response within the deadline

export interface ScheduleChangeRequest {
  id: string;
  familyId: string;
  requestedBy: ParentId;
  title: string;
  description?: string;
  /** The period the requesting parent wants to give up */
  givingUpPeriodStart: string;
  givingUpPeriodEnd: string;
  /** The make-up period they want in return */
  requestedMakeUpStart: string;
  requestedMakeUpEnd: string;
  status: ChangeRequestStatus;
  createdAt: string;
  respondedAt?: string;
  responseNote?: string;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | "medical"
  | "education"
  | "clothing"
  | "activity"
  | "childcare"
  | "other";

export type SplitMethod = "50-50" | "custom" | "one-parent";

export type PaymentStatus = "unpaid" | "paid" | "disputed";

export interface Expense {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  category: ExpenseCategory;
  totalAmount: number; // in cents to avoid float rounding
  currency: string;   // ISO-4217, e.g. "USD"
  splitMethod: SplitMethod;
  /** Only used when splitMethod = "custom". Values sum to 1.0 */
  splitRatio?: Record<ParentId, number>;
  paidBy: ParentId;
  paymentStatus: PaymentStatus;
  receiptUrl?: string;
  date: string; // ISO-8601 date
  createdAt: string;
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  familyId: string;
  senderId: ParentId;
  body: string;
  sentAt: string; // ISO-8601 datetime
  readAt?: string;
  /** Optional attachment references (stored in Vault) */
  attachmentIds?: string[];
}

// ─── Moments (Shared Photos / Videos) ────────────────────────────────────────

export interface Moment {
  id: string;
  familyId: string;
  uploadedBy: ParentId;
  mediaUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  takenAt?: string; // ISO-8601 date
  createdAt: string;
  reactions: MomentReaction[];
}

export interface MomentReaction {
  parentId: ParentId;
  emoji: string; // e.g. "❤️"
  reactedAt: string;
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

export type ActivityType =
  | "expense_added"
  | "expense_paid"
  | "message_received"
  | "schedule_change_requested"
  | "schedule_change_accepted"
  | "schedule_change_declined"
  | "moment_uploaded"
  | "event_added"
  | "event_confirmed";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  actorId: ParentId;
  occurredAt: string; // ISO-8601 datetime
  /** Polymorphic reference – the id of the relevant entity */
  entityId: string;
  /** Pre-rendered human description (for display) */
  summary: string;
  /** Extra data needed to render action buttons */
  meta?: Record<string, unknown>;
}

// ─── Reminders ────────────────────────────────────────────────────────────────

export interface Reminder {
  id: string;
  familyId: string;
  parentId: ParentId;
  text: string;
  dueAt?: string; // ISO-8601 datetime – optional, some are undated
  completed: boolean;
  completedAt?: string;
}

// ─── Conflict Climate ─────────────────────────────────────────────────────────

export type ClimateLevel = "low" | "medium" | "high";

export interface ConflictClimate {
  level: ClimateLevel;
  /** 0 = perfectly calm · 100 = maximum tension */
  tensionScore: number;
  /** Short AI-generated coaching tip for the current user */
  tip: string;
  /** Number of messages analysed in the rolling window */
  sampleSize: number;
  /** ISO-8601 datetime of oldest message included in analysis */
  windowStart: string;
}

// ─── Dashboard Aggregate ──────────────────────────────────────────────────────

export interface DashboardData {
  family: Family;
  currentParent: Parent;
  custody: CustodyStatus;
  upcomingEvents: CalendarEvent[];
  pendingChangeRequests: ScheduleChangeRequest[];
  recentActivity: ActivityItem[];
  unreadMessageCount: number;
  climate: ConflictClimate;
  moments: Moment[];
  reminders: Reminder[];
}
