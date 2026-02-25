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

// ─── Blog ────────────────────────────────────────────────────────────────────

export type BlogCategory =
  | "custody_tips"
  | "legal_advice"
  | "emotional_wellness"
  | "communication"
  | "financial_planning"
  | "featured";

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  preview: string; // 150–200 char summary
  content: string; // Full markdown or HTML
  categories: BlogCategory[];
  author: {
    name: string;
    title: string; // e.g. "Child Psychologist"
    avatarUrl?: string;
  };
  featuredImageUrl: string;
  publishedAt: string; // ISO-8601 datetime
  updatedAt?: string;
  readTimeMinutes: number;
  /** Engagement metrics for ranking */
  viewCount: number;
  shareCount: number;
  commentCount: number;
  /** Set by editorial team to pin to featured section */
  isFeatured?: boolean;
}

export interface BlogPage {
  posts: BlogPost[];
  pageNumber: number;
  totalPages: number;
  totalPostCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SearchResult {
  post: BlogPost;
  /** 0–100 relevance score for this search query */
  relevanceScore: number;
  /** Highlighted preview showing matched terms */
  highlightedPreview: string;
}

export type SearchDocType = "event" | "message" | "pta" | "blog";

export type SearchDoc = {
  id: string;
  type: SearchDocType;
  fields: Record<string, string>;
  /** Optional recency tie-breaker; ISO-8601 string */
  updatedAt?: string;
};

export type SearchOptions = {
  limit?: number;
  keys?: string[];
  minMatchCharLength?: number;
  threshold?: number;
};

export type SearchHit = {
  id: string;
  score: number;
  type: SearchDocType;
};

export type SearchBackend = "trigram" | "fuse";

export interface SearchAdapter {
  index(docs: ReadonlyArray<SearchDoc>): void;
  search(query: string, opts?: SearchOptions): ReadonlyArray<SearchHit>;
}

export type ConflictWindowSetting = {
  windowMins: number;
};

export type FamilySettings = {
  familyId: string;
  conflictWindow: ConflictWindowSetting;
  searchBackend: SearchBackend;
};

export interface CalendarConflict {
  primaryEvent: CalendarEvent;
  conflictingEvent: CalendarEvent;
  minutesApart: number;
  overlapType: "overlap" | "buffer_window";
}

export interface BlogRecommendation {
  post: BlogPost;
  reason: string; // e.g. "Similar to posts you've read", "Popular in Communication"
  score: number;
}

// ─── Blog Article Reading ─────────────────────────────────────────────────────

export interface ArticleReadingSession {
  sessionId: string;
  postId: string;
  readerId?: string; // Anonymous if undefined
  startedAt: Date;
  lastActivityAt: Date;
  scrollPercentage: number; // 0–100
  isCompleted: boolean;
  completedAt?: Date;
  timeSpentSeconds: number;
}

export interface ArticleEngagementMetric {
  postId: string;
  viewCount: number;
  uniqueViewers: number;
  shareCount: number;
  commentCount: number;
  avgTimeSpentSeconds: number;
  avgScrollPercentage: number;
  completionRate: number; // 0–100 (% of readers who reached 90%+ scroll)
}

export type ArticleHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

export type TableOfContents = ArticleHeading[];

export interface ArticleWithMetadata extends BlogPost {
  toc: TableOfContents; // Table of contents extracted from headings
  relatedPosts: BlogRecommendation[];
  estimatedReadTime: number;
  keyTakeaways?: string[]; // Extracted or hardcoded key points
}

// ─── Authentication ───────────────────────────────────────────────────────────

export type AuthProvider = "email" | "google" | "apple";

export type AuthErrorCode =
  | "invalid_credentials"
  | "account_locked"         // Too many failed attempts
  | "rate_limited"           // Too many requests from IP
  | "email_not_verified"
  | "account_disabled"
  | "token_expired"
  | "token_invalid"
  | "oauth_failed";

export interface AuthCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignupCredentials {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreedToTerms: boolean;
}

export interface SignupResult {
  success: boolean;
  session?: AuthSession;
  error?: AuthErrorCode;
  errorMessage?: string;
  /** Field-specific errors (e.g. { email: "Email already registered" }) */
  fieldErrors?: Record<string, string>;
}

export interface OAuthCredentials {
  provider: "google" | "apple";
  idToken: string;           // Provider-issued ID token
  accessToken?: string;
}

export interface AuthSession {
  sessionId: string;
  userId: string;
  parentId: ParentId;
  email: string;
  accessToken: string;       // Short-lived JWT (15 min)
  refreshToken: string;      // Long-lived opaque token (30 days)
  expiresAt: Date;           // Access token expiry
  refreshExpiresAt: Date;    // Refresh token expiry
  createdAt: Date;
  rememberMe: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResult {
  success: boolean;
  session?: AuthSession;
  error?: AuthErrorCode;
  errorMessage?: string;
  /** Number of attempts remaining before lockout */
  attemptsRemaining?: number;
  /** ISO datetime when lockout expires (if locked) */
  lockedUntil?: string;
}

export interface RateLimitState {
  key: string;               // IP address or email
  attempts: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  lockedUntil?: Date;
}

export interface PasswordResetRequest {
  id: string;
  email: string;
  token: string;             // Hashed reset token
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
  ipAddress?: string;
}

// ─── Phone Verification ────────────────────────────────────────────────────────

export interface PhoneVerificationRequest {
  id: string;
  phone: string;               // Full phone number (E.164 format: +1234567890)
  phoneDisplay: string;        // Masked display (e.g., "+1 (555) ***-88")
  otp: string;                 // Hashed OTP code
  otpAttempts: number;         // Failed verification attempts
  expiresAt: Date;             // OTP expiry (usually 5-10 minutes)
  verifiedAt?: Date;           // Marked verified after valid OTP entry
  createdAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface PhoneVerificationResult {
  success: boolean;
  error?: "invalid_otp" | "otp_expired" | "too_many_attempts" | "rate_limited" | "phone_not_found";
  errorMessage?: string;
  attemptsRemaining?: number;
  lockedUntil?: string;        // ISO datetime when rate limit expires
  verificationId?: string;
}

export type OTPVerificationError =
  | "invalid_otp"
  | "otp_expired"
  | "too_many_attempts"
  | "rate_limited"
  | "phone_not_found";

// ─── School / PTA Portal ──────────────────────────────────────────────────────

export type SchoolEventType =
  | "pta_meeting"
  | "bake_sale"
  | "conference"
  | "rehearsal"
  | "performance"
  | "parade"
  | "field_trip"
  | "sports"
  | "other";

export type VolunteerStatus = "open" | "assigned" | "completed" | "cancelled";

export type DocumentStatus =
  | "available"
  | "pending_signature"
  | "signed"
  | "expired";

export type ContactRole =
  | "teacher"
  | "principal"
  | "vice_principal"
  | "nurse"
  | "counselor"
  | "pta_board"
  | "coach"
  | "staff";

export interface SchoolEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  eventType: SchoolEventType;
  startAt: string;              // ISO-8601 datetime
  endAt: string;                // ISO-8601 datetime
  location?: string;
  isAllDay: boolean;
  /** IDs of parents confirmed as attending */
  attendingParentIds: ParentId[];
  /** Requires user action (RSVP, sign permission slip, etc.) */
  actionRequired: boolean;
  actionDeadline?: string;      // ISO-8601 datetime
  actionDescription?: string;
  /** Volunteer task IDs nested under this event */
  volunteerTaskIds: string[];
  /** UI accent: teal = volunteering, amber = action required */
  accentColor?: "teal" | "amber" | "blue" | "rose" | "purple";
  /** Material symbols icon name */
  icon?: string;
}

export interface VolunteerTask {
  id: string;
  familyId: string;
  eventId: string;
  title: string;
  description?: string;
  /** Undefined = open/unassigned */
  assignedParentId?: ParentId;
  status: VolunteerStatus;
  /** Estimated commitment in hours */
  estimatedHours: number;
  scheduledFor: string;         // ISO-8601 datetime
  completedAt?: string;
  /** Material symbols icon name */
  icon?: string;
  /** Tailwind color class segment, e.g. "teal", "blue", "purple" */
  iconColor?: string;
}

export interface SchoolContact {
  id: string;
  name: string;
  /** 2–3 character avatar fallback */
  initials: string;
  role: ContactRole;
  roleLabel: string;
  email?: string;
  phone?: string;
  /** Tailwind color segment for avatar: "indigo", "rose", "emerald", "slate" */
  avatarColor: string;
}

export interface SchoolVaultDocument {
  id: string;
  familyId: string;
  title: string;
  fileType: "pdf" | "image" | "archive" | "document" | "spreadsheet";
  status: DocumentStatus;
  /** Human-readable label e.g. "Added 2 days ago", "Pending Signature" */
  statusLabel: string;
  addedAt: string;              // ISO-8601 datetime
  addedBy: ParentId;
  sizeBytes?: number;
  url?: string;
  actionDeadline?: string;      // ISO-8601 datetime; set when signature required
}

export interface LunchMenuItem {
  name: string;
  description?: string;
  isVegetarian?: boolean;
  isGlutenFree?: boolean;
}

export interface LunchMenu {
  date: string;                 // ISO-8601 date "YYYY-MM-DD"
  mainOption: LunchMenuItem;
  alternativeOption?: LunchMenuItem;
  side?: string;
  accountBalance: number;       // USD
}

/**
 * Volunteer hour commitment per parent, used for fairness balancing.
 * When suggesting who should take an open task, the engine prefers the
 * parent with fewer totalHoursCommitted.
 */
export interface VolunteerBalance {
  parentId: ParentId;
  totalHoursCommitted: number;
  completedHours: number;
  upcomingHours: number;
  taskCount: number;
}

/** Contact search result with relevance score */
export interface ContactSearchResult {
  contact: SchoolContact;
  /** 0–100 relevance score */
  score: number;
}

/** Aggregated PTA portal data for server component rendering */
export interface PTAPortalData {
  family: Family;
  currentParent: Parent;
  upcomingEvents: SchoolEvent[];
  volunteerTasks: VolunteerTask[];
  contacts: SchoolContact[];
  vaultDocuments: SchoolVaultDocument[];
  todayLunch?: LunchMenu;
  volunteerBalances: VolunteerBalance[];
}

// ─── Dashboard Aggregate ──────────────────────────────────────────────────────

export interface DashboardData {
  family: Family;
  currentParent: Parent;
  custody: CustodyStatus;
  upcomingEvents: CalendarEvent[];
  calendarConflicts: CalendarConflict[];
  pendingChangeRequests: ScheduleChangeRequest[];
  recentActivity: ActivityItem[];
  unreadMessageCount: number;
  climate: ConflictClimate;
  moments: Moment[];
  reminders: Reminder[];
}

// ─── Observability ────────────────────────────────────────────────────────────

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorEvent {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Coarse severity level */
  severity: ErrorSeverity;
  /** Error message (safe to display; no stack traces or internal details) */
  message: string;
  /** Unique error digest from Next.js error boundary, if available */
  digest?: string;
  /** Current pathname when error occurred */
  pathname?: string;
  /** Anonymized family ID, if authenticated */
  familyId?: string;
  /** Anonymized parent ID, if authenticated */
  parentId?: string;
}
