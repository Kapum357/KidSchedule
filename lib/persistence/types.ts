/**
 * KidSchedule – Persistence Layer Types
 *
 * Database entity types for production persistence.
 * These are storage-focused types that may differ slightly from domain types.
 *
 * Naming conventions:
 *   - Entity types are prefixed with "Db" (e.g., DbUser, DbSession)
 *   - All timestamps are stored as ISO-8601 strings for portability
 *   - IDs are opaque strings (UUIDs recommended)
 */

// ─── User & Auth Entities ─────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  phoneVerified: boolean;
  phoneVerifiedAt?: string;
  isDisabled: boolean;
  disabledAt?: string;
  disabledReason?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
}

export interface DbSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  createdAt: string;
  expiresAt: string;
  rotatedAt?: string;
  ip?: string;
  userAgent?: string;
  isRevoked: boolean;
  revokedAt?: string;
  revokeReason?: string;
}

export interface DbPasswordResetRequest {
  id: string;
  email: string;
  tokenHash: string;
  requestedAt: string;
  expiresAt: string;
  usedAt?: string;
  ip?: string;
  userAgent?: string;
}

export interface DbPhoneVerification {
  id: string;
  userId: string;
  phone: string;
  otpHash: string;
  requestedAt: string;
  expiresAt: string;
  attemptCount: number;
  verifiedAt?: string;
  ip?: string;
  userAgent?: string;
}

// ─── Audit Log Entity ─────────────────────────────────────────────────────────

export type AuditAction =
  | "user.login"
  | "user.login_failed"
  | "user.logout"
  | "user.register"
  | "user.password_reset_request"
  | "user.password_reset_complete"
  | "user.phone_verify_request"
  | "user.phone_verify_success"
  | "user.phone_verify_failed"
  | "session.create"
  | "session.refresh"
  | "session.revoke"
  | "session.revoke_all"
  | "rate_limit.triggered"
  | "security.suspicious_activity"
  | "calendar.event.create"
  | "calendar.event.update"
  | "calendar.event.delete"
  | "holiday.rule.propose"
  | "holiday.rule.confirm"
  | "holiday.rule.reject"
  | "holiday.definition.create";

export interface DbAuditLog {
  id: string;
  userId?: string;
  action: AuditAction;
  metadata: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

// ─── Rate Limiting Entity ─────────────────────────────────────────────────────

export interface DbRateLimit {
  key: string;                // e.g., "email:user@example.com", "ip:192.168.1.1", "otp:+1234567890"
  windowStartedAt: string;
  count: number;
  lockedUntil?: string;
}

// ─── Family & Domain Entities ─────────────────────────────────────────────────

export interface DbFamily {
  id: string;
  name: string;
  custodyAnchorDate: string;
  scheduleId: string;
  proxyPhoneNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbParent {
  id: string;
  userId: string;
  familyId: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: "primary" | "secondary";
  createdAt: string;
}

export interface DbChild {
  id: string;
  familyId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface DbCustodySchedule {
  id: string;
  familyId: string;
  name: string;
  transitionHour: number;
  blocks: string;             // JSON-serialized ScheduleBlock[]
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DbCalendarEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  category: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string;
  parentId?: string;
  confirmationStatus: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbScheduleChangeRequest {
  id: string;
  familyId: string;
  requestedBy: string;
  title: string;
  description?: string;
  givingUpPeriodStart: string;
  givingUpPeriodEnd: string;
  requestedMakeUpStart: string;
  requestedMakeUpEnd: string;
  status: string;
  createdAt: string;
  respondedAt?: string;
  responseNote?: string;
}

// ─── Blog Entities ────────────────────────────────────────────────────────────

export interface DbBlogPost {
  id: string;
  slug: string;
  title: string;
  preview: string;
  content: string;
  categories: string;         // JSON-serialized string[]
  authorName: string;
  authorTitle: string;
  authorAvatarUrl?: string;
  featuredImageUrl: string;
  publishedAt: string;
  updatedAt?: string;
  readTimeMinutes: number;
  viewCount: number;
  shareCount: number;
  commentCount: number;
  isFeatured: boolean;
  isPublished: boolean;
}

// ─── School/PTA Entities ──────────────────────────────────────────────────────

export interface DbSchoolEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  eventType: string;
  startAt: string;
  endAt: string;
  location?: string;
  isAllDay: boolean;
  attendingParentIds: string; // JSON-serialized string[]
  actionRequired: boolean;
  actionDeadline?: string;
  actionDescription?: string;
  volunteerTaskIds: string;   // JSON-serialized string[]
  accentColor?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbVolunteerTask {
  id: string;
  familyId: string;
  eventId: string;
  title: string;
  description?: string;
  assignedParentId?: string;
  status: string;
  estimatedHours: number;
  scheduledFor: string;
  completedAt?: string;
  icon?: string;
  iconColor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbSchoolContact {
  id: string;
  familyId: string;
  name: string;
  initials: string;
  role: string;
  roleLabel: string;
  email?: string;
  phone?: string;
  avatarColor: string;
  createdAt: string;
}

export interface DbSchoolVaultDocument {
  id: string;
  familyId: string;
  title: string;
  fileType: string;
  status: string;
  statusLabel: string;
  addedAt: string;
  addedBy: string;
  sizeBytes?: number;
  url?: string;
  actionDeadline?: string;
}

export interface DbLunchMenuItem {
  name: string;
  description?: string;
  isVegetarian?: boolean;
  isGlutenFree?: boolean;
}

export interface DbLunchMenu {
  familyId: string;
  date: string; // ISO-8601 date "YYYY-MM-DD"
  mainOption: DbLunchMenuItem;
  alternativeOption?: DbLunchMenuItem;
  side?: string;
  accountBalance: number;
}

// ─── Expense Entities ─────────────────────────────────────────────────────────

export interface DbExpense {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  category: "medical" | "education" | "clothing" | "activity" | "childcare" | "other";
  totalAmount: number; // cents
  currency: string;
  splitMethod: "50-50" | "custom" | "one-parent";
  splitRatio?: Record<string, number>; // parentId → percentage mapping
  paidBy: string; // parentId
  paymentStatus: "unpaid" | "paid" | "disputed";
  receiptUrl?: string;
  date: string; // ISO date
  createdAt: string;
  updatedAt: string;
}

// ─── Messaging & Hash Chain Entities ───────────────────────────────────────────

export interface DbMessageThread {
  id: string;
  familyId: string;
  subject?: string;
  createdAt: string;
  lastMessageAt: string;
}

export interface DbMessage {
  id: string;
  threadId: string;
  familyId: string;
  senderId: string; // parentId
  body: string;
  sentAt: string;
  readAt?: string;
  attachmentIds: string[]; // file IDs
  toneAnalysis?: {
    isHostile: boolean;
    indicators?: string[];
  };
  messageHash: string; // SHA256 of content + metadata
  previousHash?: string; // Links to previous message in thread
  chainIndex: number; // Sequential position in thread
  createdAt: string;
  updatedAt: string;
}

export interface DbHashChainVerification {
  id: string;
  threadId: string;
  verifiedAt: string;
  verifiedBy?: string; // parentId
  isValid: boolean;
  tamperDetectedAtIndex?: number;
  verificationReport?: Record<string, unknown>;
}

export interface DbSmsRelayParticipant {
  id: string;
  familyId: string;
  parentId: string;
  phone: string; // E.164 format (e.g., +14155552671)
  proxyNumber: string; // From pool (e.g., +14155552671)
  isActive: boolean;
  enrolledAt: string;
}

// ─── Export & Hash Verification Entities ──────────────────────────────────

export interface DbExportMetadata {
  id: string;
  exportId: string; // Reference to export_jobs table
  familyId: string;
  reportType: string; // "custody-compliance", "message-transcript", etc.
  hashChainVerificationId?: string; // Reference to hash_chain_verifications
  includedMessageIds: string[]; // UUID[]
  custodyPeriodStart?: string;
  custodyPeriodEnd?: string;
  pdfHash: string; // SHA-256 of the PDF buffer
  pdfSizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface DbExportMessageHash {
  id: string;
  exportMetadataId: string;
  messageId: string;
  chainIndex: number;
  messageHash: string; // SHA-256
  previousHash: string; // Link to previous message
  sentAt: string;
  senderId: string;
  messagePreview?: string;
  createdAt: string;
}

export interface DbExportVerificationAttempt {
  id: string;
  exportMetadataId: string;
  verifiedBy: string; // parentId
  verifiedAt: string;
  verificationStatus: string; // "pending", "valid", "tampered"
  isValid: boolean;
  integrityStatus?: string;
  pdfHashMatch?: boolean;
  errorsDetected?: string[];
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

// ─── Moment Entities ──────────────────────────────────────────────────────────

export interface DbMoment {
  id: string;
  familyId: string;
  uploadedBy: string; // parentId
  mediaUrl: string;
  thumbnailUrl?: string;
  mediaType: "photo" | "video";
  caption?: string;
  takenAt?: string; // ISO date when photo was taken
  createdAt: string;
  updatedAt: string;
}

export interface DbMomentReaction {
  id: string;
  momentId: string;
  parentId: string;
  emoji: string;
  reactedAt: string;
}

// ─── Schedule Override Entities ───────────────────────────────────────────────

export interface DbScheduleOverride {
  id: string;
  familyId: string;
  /**
   * Type of schedule override (primary field).
   * Corresponds to the "type" column in the database.
   */
  type: "holiday" | "swap" | "mediation" | "manual";
  /**
   * Type of schedule override (legacy field, alias for 'type').
   * Kept for backward compatibility with existing code.
   * Prefer using 'type' for new code.
   */
  overrideType: "holiday" | "swap" | "mediation" | "manual";
  title: string;
  description?: string;
  effectiveStart: string;
  effectiveEnd: string;
  custodianParentId: string;
  sourceEventId?: string;
  sourceRequestId?: string;
  sourceMediationId?: string;
  priority: number;
  status: "active" | "expired" | "superseded" | "cancelled";
  createdAt: string;
  createdBy: string;
  notes?: string;
}

export interface DbHolidayDefinition {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: "federal" | "state" | "religious" | "cultural" | "custom";
  jurisdiction: string;
  description?: string;
  familyId?: string; // For custom family-specific holidays
  createdAt: string;
}

export interface DbHolidayExceptionRule {
  id: string;
  familyId: string;
  holidayId: string;
  custodianParentId: string; // The parent who receives the holiday custody override
  isEnabled: boolean;
  notes?: string;
  approvalStatus: "pending" | "approved" | "rejected";
  proposedBy: string; // parentId who proposed this rule
  proposedAt: string; // ISO timestamp
  confirmedBy?: string; // parentId who approved/rejected, null if pending
  confirmedAt?: string; // ISO timestamp, null if pending
  changeLog: Array<{
    action: "propose" | "confirm" | "reject";
    actor: string; // parentId
    timestamp: string; // ISO timestamp
    details?: Record<string, unknown>;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ─── Scheduled Notifications ─────────────────────────────────────────────────

export interface DbScheduledNotification {
  id: string;
  familyId: string;
  parentId: string;
  notificationType: "transition_24h" | "transition_same_day" | "transition_reminder";
  scheduledAt: string;
  sentAt?: string;
  deliveryStatus: "pending" | "sent" | "failed" | "cancelled";
  deliveryMethod: "sms" | "email" | "push";
  messageId?: string;
  errorMessage?: string;
  transitionAt: string;
  fromParentId: string;
  toParentId: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Billing Entities (BILL-001) ──────────────────────────────────────────────

export interface DbStripeCustomer {
  id: string;
  userId: string;
  stripeCustomerId: string;
  email: string;
  name?: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export type InvoiceStatus = "draft" | "open" | "paid" | "uncollectible" | "void";

export interface DbPaymentMethod {
  id: string;
  stripeCustomerId: string;       // FK to stripe_customers.id (local UUID)
  stripePaymentMethodId: string;
  type: string;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbSubscription {
  id: string;
  stripeCustomerId: string;       // FK to stripe_customers.id (local UUID)
  stripeSubscriptionId: string;
  stripePriceId: string;
  planTier: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  cancelAt?: string;
  trialStart?: string;
  trialEnd?: string;
  quantity: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DbInvoice {
  id: string;
  stripeCustomerId: string;       // FK to stripe_customers.id (local UUID)
  subscriptionId?: string;
  stripeInvoiceId: string;
  status: InvoiceStatus;
  billingReason?: string;
  currency: string;
  subtotal: number;               // cents
  total: number;                  // cents
  amountDue: number;              // cents
  amountPaid: number;             // cents
  amountRemaining: number;        // cents
  tax: number;                    // cents
  dueDate?: string;
  paidAt?: string;
  voidedAt?: string;
  invoicePdf?: string;
  hostedInvoiceUrl?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DbWebhookEvent {
  id: string;
  stripeEventId: string;          // evt_xxx — idempotency key
  type: string;                   // e.g. 'customer.subscription.updated'
  apiVersion?: string;
  payload: Record<string, unknown>;
  processedAt?: string;
  processingError?: string;
  retryCount: number;
  createdAt: string;
}

export interface DbPlanTier {
  id: string;                     // 'free', 'starter', 'professional'
  displayName: string;
  stripePriceId?: string;
  monthlyPriceCents: number;
  annualPriceId?: string;
  annualPriceCents: number;
  features: string[];
  maxChildren?: number;
  maxDocuments?: number;
  isActive: boolean;
  createdAt: string;
}

// ─── Mediation Entities ───────────────────────────────────────────────────────

export interface DbMediationTopic {
  id: string;
  familyId: string;
  parentId: string; // which parent created this topic
  title: string;
  description?: string;
  status: "draft" | "in_progress" | "resolved";
  draftSuggestion?: string; // AI-suggested neutral response
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbMediationWarning {
  id: string;
  familyId: string;
  messageId: string;
  senderParentId: string;
  category: string; // aggressive_capitalization, emotional_intensity, etc.
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  excerpt: string;
  flaggedAt: string;
  dismissed: boolean;
  dismissedAt?: string;
  dismissedBy?: string;
  createdAt: string;
  updatedAt: string;
}
