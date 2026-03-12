/**
 * KidSchedule – Repository Interfaces
 *
 * Repository pattern for database access. Each repository handles
 * a specific entity type with CRUD operations.
 *
 * Implementation notes:
 *   - All methods are async (database calls are inherently async)
 *   - Return null instead of throwing for "not found" cases
 *   - Throw errors for unexpected database failures
 *   - Use transactions for multi-step operations via UnitOfWork
 */

import type {
  DbUser,
  DbSession,
  DbPasswordResetRequest,
  DbPhoneVerification,
  DbAuditLog,
  DbRateLimit,
  DbFamily,
  DbParent,
  DbChild,
  DbCustodySchedule,
  DbCalendarEvent,
  DbScheduleChangeRequest,
  DbChangeRequestMessage,
  DbScheduleOverride,
  DbHolidayDefinition,
  DbHolidayExceptionRule,
  DbBlogPost,
  DbBlogCategory,
  DbSchoolEvent,
  DbVolunteerTask,
  DbSchoolContact,
  DbSchoolVaultDocument,
  DbLunchMenu,
  DbLunchAccount,
  DbLunchTransaction,
  DbExpense,
  DbMessageThread,
  DbMessage,
  DbHashChainVerification,
  DbSmsRelayParticipant,
  DbMoment,
  DbMomentReaction,
  DbScheduledNotification,
  DbExportMetadata,
  DbExportMessageHash,
  DbExportVerificationAttempt,
  DbExportShareToken,
  DbStripeCustomer,
  DbPaymentMethod,
  DbSubscription,
  DbInvoice,
  DbWebhookEvent,
  DbTwilioWebhookEvent,
  DbPlanTier,
  DbReminder,
  DbConflictWindow,
  DbMediationTopic,
  DbMediationWarning,
  AuditAction,
} from "./types";
import type { ExportJobRecord } from "@/lib";

// ─── User Repository ──────────────────────────────────────────────────────────

export interface UserRepository {
  findById(id: string): Promise<DbUser | null>;
  findByEmail(email: string): Promise<DbUser | null>;
  create(user: Omit<DbUser, "id" | "createdAt" | "updatedAt">): Promise<DbUser>;
  update(id: string, data: Partial<DbUser>): Promise<DbUser | null>;
  updatePassword(id: string, passwordHash: string): Promise<boolean>;
  markEmailVerified(id: string): Promise<boolean>;
  markPhoneVerified(id: string, phone: string): Promise<boolean>;
  disable(id: string, reason?: string): Promise<boolean>;
}

// ─── Session Repository ───────────────────────────────────────────────────────

export interface SessionRepository {
  findById(id: string): Promise<DbSession | null>;
  findByRefreshTokenHash(hash: string): Promise<DbSession | null>;
  findActiveByUserId(userId: string): Promise<DbSession[]>;
  create(session: Omit<DbSession, "id" | "createdAt">): Promise<DbSession>;
  rotate(id: string, newRefreshTokenHash: string, newExpiresAt: string): Promise<DbSession | null>;
  revoke(id: string, reason?: string): Promise<boolean>;
  revokeAllForUser(userId: string, reason?: string): Promise<number>;
  deleteExpired(): Promise<number>;
}

// ─── Password Reset Repository ────────────────────────────────────────────────

export interface PasswordResetRepository {
  findById(id: string): Promise<DbPasswordResetRequest | null>;
  findByTokenHash(hash: string): Promise<DbPasswordResetRequest | null>;
  findByEmail(email: string): Promise<DbPasswordResetRequest[]>;
  create(request: Omit<DbPasswordResetRequest, "id">): Promise<DbPasswordResetRequest>;
  markUsed(id: string): Promise<boolean>;
  deleteExpired(): Promise<number>;
  countRecentByEmail(email: string, windowMs: number): Promise<number>;
}

// ─── Phone Verification Repository ────────────────────────────────────────────

export interface PhoneVerificationRepository {
  findById(id: string): Promise<DbPhoneVerification | null>;
  findByUserId(userId: string): Promise<DbPhoneVerification | null>;
  findByPhone(phone: string): Promise<DbPhoneVerification | null>;
  create(verification: Omit<DbPhoneVerification, "id">): Promise<DbPhoneVerification>;
  incrementAttempts(id: string): Promise<DbPhoneVerification | null>;
  markVerified(id: string): Promise<boolean>;
  deleteExpired(): Promise<number>;
}

// ─── Audit Log Repository ─────────────────────────────────────────────────────

export interface AuditLogRepository {
  create(log: Omit<DbAuditLog, "id" | "timestamp">): Promise<DbAuditLog>;
  findByUserId(userId: string, limit?: number): Promise<DbAuditLog[]>;
  findByAction(action: AuditAction, limit?: number): Promise<DbAuditLog[]>;
  findRecent(limit: number): Promise<DbAuditLog[]>;
}

// ─── Rate Limit Repository ────────────────────────────────────────────────────

export interface RateLimitRepository {
  get(key: string): Promise<DbRateLimit | null>;
  increment(key: string, windowMs: number): Promise<DbRateLimit>;
  setLockout(key: string, lockedUntil: string): Promise<void>;
  clear(key: string): Promise<void>;
  clearExpired(): Promise<number>;
}

// ─── Family Repository ────────────────────────────────────────────────────────

export interface FamilyRepository {
  findById(id: string): Promise<DbFamily | null>;
  findByParentUserId(userId: string): Promise<DbFamily | null>;
  create(family: Omit<DbFamily, "id" | "createdAt" | "updatedAt">): Promise<DbFamily>;
  update(id: string, data: Partial<DbFamily>): Promise<DbFamily | null>;
}

// ─── Parent Repository ────────────────────────────────────────────────────────

export interface ParentRepository {
  findById(id: string): Promise<DbParent | null>;
  findByUserId(userId: string): Promise<DbParent | null>;
  findByFamilyId(familyId: string): Promise<DbParent[]>;
  create(parent: Omit<DbParent, "id" | "createdAt">): Promise<DbParent>;
  update(id: string, data: Partial<DbParent>): Promise<DbParent | null>;
}

// ─── Child Repository ─────────────────────────────────────────────────────────

export interface ChildRepository {
  findById(id: string): Promise<DbChild | null>;
  findByFamilyId(familyId: string): Promise<DbChild[]>;
  create(child: Omit<DbChild, "id" | "createdAt">): Promise<DbChild>;
  update(id: string, data: Partial<DbChild>): Promise<DbChild | null>;
  delete(id: string): Promise<boolean>;
}

// ─── Custody Schedule Repository ─────────────────────────────────────────────

export interface CustodyScheduleRepository {
  findById(id: string): Promise<DbCustodySchedule | null>;
  findByFamilyId(familyId: string): Promise<DbCustodySchedule[]>;
  findActiveByFamilyId(familyId: string): Promise<DbCustodySchedule | null>;
  create(schedule: Omit<DbCustodySchedule, "id" | "createdAt" | "updatedAt">): Promise<DbCustodySchedule>;
  update(id: string, data: Partial<DbCustodySchedule>): Promise<DbCustodySchedule | null>;
  setActive(familyId: string, scheduleId: string): Promise<boolean>;
}

// ─── Calendar Event Repository ────────────────────────────────────────────────

export interface CalendarEventRepository {
  findById(id: string): Promise<DbCalendarEvent | null>;
  findByFamilyId(familyId: string): Promise<DbCalendarEvent[]>;
  findByFamilyIdAndDateRange(
    familyId: string,
    startAt: string,
    endAt: string
  ): Promise<DbCalendarEvent[]>;
  create(event: Omit<DbCalendarEvent, "id" | "createdAt" | "updatedAt">): Promise<DbCalendarEvent>;
  update(id: string, data: Partial<DbCalendarEvent>): Promise<DbCalendarEvent | null>;
  delete(id: string): Promise<boolean>;
}

// ─── Schedule Change Request Repository ───────────────────────────────────────

export interface ScheduleChangeRequestRepository {
  findById(id: string): Promise<DbScheduleChangeRequest | null>;
  findByFamilyId(familyId: string): Promise<DbScheduleChangeRequest[]>;
  findByFamilyIdAndStatus(familyId: string, status: string): Promise<DbScheduleChangeRequest[]>;
  findByRequestedBy(familyId: string, parentId: string): Promise<DbScheduleChangeRequest[]>;
  findPendingByFamilyId(familyId: string): Promise<DbScheduleChangeRequest[]>;
  create(request: Omit<DbScheduleChangeRequest, "id" | "createdAt">): Promise<DbScheduleChangeRequest>;
  approve(id: string, respondedBy: string, responseNote?: string): Promise<DbScheduleChangeRequest | null>;
  decline(id: string, respondedBy: string, responseNote?: string): Promise<DbScheduleChangeRequest | null>;
  counter(id: string, respondedBy: string, responseNote: string): Promise<DbScheduleChangeRequest | null>;
  withdraw(id: string, withdrawnBy: string): Promise<boolean>;
}

// ─── Change Request Message Repository ───────────────────────────────────────

export interface ChangeRequestMessageRepository {
  findByRequestId(requestId: string): Promise<DbChangeRequestMessage[]>;
  create(msg: Omit<DbChangeRequestMessage, "id" | "createdAt">): Promise<DbChangeRequestMessage>;
}

// ─── Schedule Override Repository ─────────────────────────────────────────────

export interface ScheduleOverrideRepository {
  findById(id: string): Promise<DbScheduleOverride | null>;
  findByFamilyId(familyId: string): Promise<DbScheduleOverride[]>;
  findActiveByFamilyId(familyId: string): Promise<DbScheduleOverride[]>;
  findByTimeRange(
    familyId: string,
    startDate: string,
    endDate: string
  ): Promise<DbScheduleOverride[]>;
  create(
    override: Omit<DbScheduleOverride, "id" | "createdAt">
  ): Promise<DbScheduleOverride>;
  update(
    id: string,
    data: Partial<DbScheduleOverride>
  ): Promise<DbScheduleOverride | null>;
  cancel(id: string): Promise<boolean>;
}

// ─── Holiday Repository ───────────────────────────────────────────────────────

export interface HolidayRepository {
  findById(id: string): Promise<DbHolidayDefinition | null>;
  findByJurisdiction(jurisdiction: string): Promise<DbHolidayDefinition[]>;
  findByDateRange(
    jurisdiction: string,
    startDate: string,
    endDate: string
  ): Promise<DbHolidayDefinition[]>;
  findByFamily(familyId: string): Promise<DbHolidayDefinition[]>;
  create(
    holiday: Omit<DbHolidayDefinition, "id" | "createdAt">
  ): Promise<DbHolidayDefinition>;
}

// ─── Holiday Exception Rule Repository ────────────────────────────────────────

export interface HolidayExceptionRuleRepository {
  findByFamilyId(familyId: string): Promise<DbHolidayExceptionRule[]>;
  findByFamilyAndHoliday(
    familyId: string,
    holidayId: string
  ): Promise<DbHolidayExceptionRule | null>;
  findPendingByFamilyId(familyId: string): Promise<DbHolidayExceptionRule[]>;
  propose(
    rule: Omit<DbHolidayExceptionRule, "id" | "approvalStatus" | "confirmedBy" | "confirmedAt" | "changeLog" | "createdAt" | "updatedAt" | "proposedBy" | "proposedAt">,
    proposedBy: string
  ): Promise<DbHolidayExceptionRule>;
  confirm(
    familyId: string,
    holidayId: string,
    confirmedBy: string,
    approved: boolean
  ): Promise<DbHolidayExceptionRule | null>;
  delete(familyId: string, holidayId: string): Promise<boolean>;
}

// ─── Blog Post Repository ─────────────────────────────────────────────────────

export interface BlogPostRepository {
  findById(id: string): Promise<DbBlogPost | null>;
  findBySlug(slug: string): Promise<DbBlogPost | null>;
  findPublished(options: {
    limit: number;
    offset: number;
    categories?: string[];
    sort?: "recent" | "popular";
  }): Promise<{ posts: DbBlogPost[]; total: number }>;
  findFeatured(): Promise<DbBlogPost | null>;
  incrementViewCount(id: string): Promise<void>;
  incrementShareCount(id: string): Promise<void>;
}

// ─── Blog Category Repository ─────────────────────────────────────────────────

export interface BlogCategoryRepository {
  findAll(): Promise<DbBlogCategory[]>;
  findBySlug(slug: string): Promise<DbBlogCategory | null>;
}

// ─── School Event Repository ──────────────────────────────────────────────────

export interface SchoolEventRepository {
  findById(id: string): Promise<DbSchoolEvent | null>;
  findByFamilyId(familyId: string): Promise<DbSchoolEvent[]>;
  findUpcoming(familyId: string, fromDate: string): Promise<DbSchoolEvent[]>;
  create(event: Omit<DbSchoolEvent, "id" | "createdAt" | "updatedAt">): Promise<DbSchoolEvent>;
  update(id: string, data: Partial<DbSchoolEvent>): Promise<DbSchoolEvent | null>;
  delete(id: string): Promise<boolean>;
}

// ─── Volunteer Task Repository ────────────────────────────────────────────────

export interface VolunteerTaskRepository {
  findById(id: string): Promise<DbVolunteerTask | null>;
  findByFamilyId(familyId: string): Promise<DbVolunteerTask[]>;
  findByEventId(eventId: string): Promise<DbVolunteerTask[]>;
  findUnassigned(familyId: string): Promise<DbVolunteerTask[]>;
  create(task: Omit<DbVolunteerTask, "id" | "createdAt" | "updatedAt">): Promise<DbVolunteerTask>;
  assign(id: string, parentId: string): Promise<DbVolunteerTask | null>;
  complete(id: string): Promise<DbVolunteerTask | null>;
}

// ─── School Contact Repository ───────────────────────────────────────────────

export interface SchoolContactRepository {
  findById(id: string): Promise<DbSchoolContact | null>;
  findByFamilyId(familyId: string): Promise<DbSchoolContact[]>;
}

// ─── School Vault Document Repository ────────────────────────────────────────

/**
 * Error thrown during vault document operations that should result in specific HTTP status codes.
 * API routes can catch this error and use statusCode to set the response status.
 *
 * Example:
 * ```typescript
 * try {
 *   const doc = await db.schoolVaultDocuments.create(input);
 * } catch (error) {
 *   if (error instanceof HttpError) {
 *     return NextResponse.json({ error: error.message }, { status: error.statusCode });
 *   }
 *   throw error;
 * }
 * ```
 */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type CreateVaultDocumentInput = {
  familyId: string;
  title: string;
  fileType: string;
  addedBy: string;
  sizeBytes?: number;
  url?: string;
  actionDeadline?: string;
};

export type UpdateVaultDocumentInput = {
  status?: string;
  title?: string;
  actionDeadline?: string | null;
};

export interface SchoolVaultDocumentRepository {
  findById(id: string): Promise<DbSchoolVaultDocument | null>;
  findByFamilyId(familyId: string): Promise<DbSchoolVaultDocument[]>;
  /**
   * Find documents with a specific status, optionally paginated.
   *
   * Respects soft-delete filter (is_deleted = false).
   * Documents ordered by added_at DESC.
   * Supports pagination via limit and offset.
   *
   * Valid statuses: 'available', 'pending_signature', 'signed', 'expired'
   */
  findByStatus(familyId: string, status: string, limit?: number, offset?: number): Promise<DbSchoolVaultDocument[]>;
  /**
   * Find documents with expired status OR past action_deadline.
   *
   * Respects soft-delete filter (is_deleted = false).
   * Documents ordered by added_at DESC.
   * Supports pagination via limit and offset.
   *
   * Returns documents that are either:
   * - status = 'expired', OR
   * - action_deadline < NOW() (for pending_signature documents)
   */
  findExpired(familyId: string, limit?: number, offset?: number): Promise<DbSchoolVaultDocument[]>;
  /**
   * Find documents awaiting signature (pending_signature status).
   *
   * Respects soft-delete filter (is_deleted = false).
   * Documents ordered by added_at DESC.
   * Supports pagination via limit and offset.
   */
  findPending(familyId: string, limit?: number, offset?: number): Promise<DbSchoolVaultDocument[]>;
  create(input: CreateVaultDocumentInput): Promise<DbSchoolVaultDocument>;
  update(id: string, input: UpdateVaultDocumentInput): Promise<DbSchoolVaultDocument | null>;
  /**
   * Soft-delete a vault document and reclaim storage quota.
   *
   * Sets is_deleted = true and updated_at = NOW() for FERPA 30-day retention compliance.
   * Automatically reclaims used_storage_bytes from the family's subscription quota.
   *
   * Returns true if document was deleted, false if not found or already deleted.
   * Throws HttpError if operation fails (e.g., document not found or already deleted).
   */
  delete(id: string, familyId: string): Promise<boolean>;
  /**
   * Hard-delete documents that have been soft-deleted for 30+ days.
   *
   * Query: DELETE FROM school_vault_documents WHERE is_deleted=true AND added_at < NOW() - 30 days
   * For each hard-deleted document, reclaim its size_bytes from quota.
   *
   * Returns count of documents permanently deleted.
   * FERPA compliance: Only deletes documents past 30-day retention window.
   */
  hardDelete(): Promise<number>;
}

// ─── Lunch Menu Repository ───────────────────────────────────────────────────

export interface LunchMenuRepository {
  findByFamilyIdSince(familyId: string, fromDate: string): Promise<DbLunchMenu[]>;
}

// ─── Lunch Account Repository ─────────────────────────────────────────────────

export interface LunchAccountRepository {
  findById(id: string): Promise<DbLunchAccount | null>;
  findByFamilyId(familyId: string): Promise<DbLunchAccount[]>;
  findByChildId(childId: string): Promise<DbLunchAccount | null>;
  create(data: Omit<DbLunchAccount, "id" | "createdAt">): Promise<DbLunchAccount>;
  updateBalance(id: string, balanceCents: number): Promise<DbLunchAccount | null>;
}

// ─── Lunch Transaction Repository ────────────────────────────────────────────

export interface LunchTransactionRepository {
  findByAccountId(accountId: string, limit?: number): Promise<DbLunchTransaction[]>;
  create(data: Omit<DbLunchTransaction, "id" | "createdAt">): Promise<DbLunchTransaction>;
}

// ─── Expense Repository ───────────────────────────────────────────────────────

export interface ExpenseRepository {
  findById(id: string): Promise<DbExpense | null>;
  findByFamilyId(familyId: string): Promise<DbExpense[]>;
  findByFamilyIdAndDateRange(
    familyId: string,
    startDate: string,
    endDate: string
  ): Promise<DbExpense[]>;
  create(expense: Omit<DbExpense, "id" | "createdAt" | "updatedAt">): Promise<DbExpense>;
  update(id: string, data: Partial<DbExpense>): Promise<DbExpense | null>;
  delete(id: string): Promise<boolean>;
}

// ─── Message Thread Repository ────────────────────────────────────────────────

export interface MessageThreadRepository {
  findById(id: string): Promise<DbMessageThread | null>;
  findByFamilyId(familyId: string): Promise<DbMessageThread[]>;
  /** Find a thread containing both participant IDs whose subject includes the keyword. */
  findByParticipantsAndSubject(
    familyId: string,
    participantIds: [string, string],
    subjectKeyword: string
  ): Promise<DbMessageThread | null>;
  create(thread: Omit<DbMessageThread, "id" | "createdAt" | "lastMessageAt">): Promise<DbMessageThread>;
  update(id: string, data: Partial<DbMessageThread>): Promise<DbMessageThread | null>;
}

// ─── Message Repository ───────────────────────────────────────────────────────

export interface MessageRepository {
  findById(id: string): Promise<DbMessage | null>;
  findByThreadId(threadId: string): Promise<DbMessage[]>;
  findByFamilyId(familyId: string): Promise<DbMessage[]>;
  findUnreadByFamilyId(familyId: string): Promise<DbMessage[]>;
  create(message: Omit<DbMessage, "id" | "createdAt" | "updatedAt">): Promise<DbMessage>;
  markAsRead(id: string, readAt: string): Promise<DbMessage | null>;
  update(id: string, data: Partial<DbMessage>): Promise<DbMessage | null>;
}

// ─── Hash Chain Verification Repository ────────────────────────────────────────

export interface HashChainVerificationRepository {
  findById(id: string): Promise<DbHashChainVerification | null>;
  findByThreadId(threadId: string): Promise<DbHashChainVerification[]>;
  create(
    verification: Omit<DbHashChainVerification, "id">
  ): Promise<DbHashChainVerification>;
  findLatestByThreadId(threadId: string): Promise<DbHashChainVerification | null>;
}

// ─── SMS Relay Participant Repository ──────────────────────────────────────────

export interface SmsRelayParticipantRepository {
  findByParentId(parentId: string): Promise<DbSmsRelayParticipant | null>;
  findByFamilyId(familyId: string): Promise<DbSmsRelayParticipant[]>;
  findByProxyNumber(proxyNumber: string): Promise<DbSmsRelayParticipant | null>;
  findByPhoneAndFamily(phone: string, familyId: string): Promise<DbSmsRelayParticipant | null>;
  create(data: {
    familyId: string;
    parentId: string;
    phone: string;
    proxyNumber: string;
  }): Promise<DbSmsRelayParticipant>;
  deactivate(parentId: string): Promise<void>;
}

// ─── Moment Repository ────────────────────────────────────────────────────────

export interface MomentRepository {
  findById(id: string): Promise<DbMoment | null>;
  findByFamilyId(familyId: string): Promise<DbMoment[]>;
  findByFamilyIdOrderedByRecent(
    familyId: string,
    limit?: number,
    offset?: number
  ): Promise<DbMoment[]>;
  create(moment: Omit<DbMoment, "id" | "createdAt" | "updatedAt">): Promise<DbMoment>;
  update(id: string, data: Partial<DbMoment>): Promise<DbMoment | null>;
  delete(id: string): Promise<boolean>;
}

// ─── Moment Reaction Repository ───────────────────────────────────────────────

export interface MomentReactionRepository {
  findById(id: string): Promise<DbMomentReaction | null>;
  findByMomentId(momentId: string): Promise<DbMomentReaction[]>;
  findByMomentIdAndParentId(momentId: string, parentId: string): Promise<DbMomentReaction | null>;
  findByMomentIdsWithReactions(momentIds: string[]): Promise<Map<string, DbMomentReaction[]>>;
  create(
    reaction: Omit<DbMomentReaction, "id">
  ): Promise<DbMomentReaction>;
  addReaction(momentId: string, parentId: string, emoji: string): Promise<{ id: string; isNew: boolean }>;
  delete(id: string): Promise<boolean>;
  deleteByMomentIdAndParentId(momentId: string, parentId: string): Promise<boolean>;
}

// ─── Scheduled Notification Repository ────────────────────────────────────────

export interface ScheduledNotificationRepository {
  findById(id: string): Promise<DbScheduledNotification | null>;
  findPendingByTimeRange(startTime: string, endTime: string, limit?: number): Promise<DbScheduledNotification[]>;
  findPendingByTimeRangeForDelivery(startTime: string, endTime: string, limit?: number): Promise<DbScheduledNotification[]>;
  findByFamilyId(familyId: string): Promise<DbScheduledNotification[]>;
  findByParentId(parentId: string): Promise<DbScheduledNotification[]>;
  findFailed(limit?: number): Promise<DbScheduledNotification[]>;
  findExisting(transitionAt: string, parentId: string, notificationType: DbScheduledNotification["notificationType"]): Promise<DbScheduledNotification | null>;
  findFailedForRetry(limit?: number): Promise<DbScheduledNotification[]>;
  create(notification: Omit<DbScheduledNotification, "id" | "createdAt" | "updatedAt">): Promise<DbScheduledNotification>;
  update(id: string, data: Partial<DbScheduledNotification>): Promise<DbScheduledNotification | null>;
  cancel(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// ─── Export Jobs Repository ───────────────────────────────────────────────────

export interface ExportJobsRepository {
  findById(id: string): Promise<ExportJobRecord | null>;
  findByFamilyId(familyId: string): Promise<ExportJobRecord[]>;
  findByUserId(userId: string): Promise<ExportJobRecord[]>;
  findByStatus(status: string): Promise<ExportJobRecord[]>;
  findByMessageId(messageId: string): Promise<ExportJobRecord[]>;
  create(data: {
    familyId: string;
    userId: string;
    type: string;
    params: Record<string, unknown>;
  }): Promise<ExportJobRecord>;
  update(id: string, data: Partial<ExportJobRecord>): Promise<ExportJobRecord | null>;
}

// ─── Export Metadata Repository ────────────────────────────────────────────

export interface ExportMetadataRepository {
  findById(id: string): Promise<DbExportMetadata | null>;
  findByExportId(exportId: string): Promise<DbExportMetadata | null>;
  findByFamilyId(familyId: string): Promise<DbExportMetadata[]>;
  create(data: Omit<DbExportMetadata, "id" | "createdAt" | "updatedAt">): Promise<DbExportMetadata>;
  update(id: string, data: Partial<DbExportMetadata>): Promise<DbExportMetadata | null>;
  linkVerification(exportMetadataId: string, verificationId: string): Promise<boolean>;
}

// ─── Export Message Hash Repository ────────────────────────────────────────

export interface ExportMessageHashRepository {
  findByExportMetadataId(exportMetadataId: string): Promise<DbExportMessageHash[]>;
  createBatch(hashes: Omit<DbExportMessageHash, "id" | "createdAt">[]): Promise<DbExportMessageHash[]>;
}

// ─── Export Verification Attempt Repository ───────────────────────────────

export interface ExportVerificationAttemptRepository {
  findByExportMetadataId(exportMetadataId: string): Promise<DbExportVerificationAttempt[]>;
  create(data: Omit<DbExportVerificationAttempt, "id" | "createdAt">): Promise<DbExportVerificationAttempt>;
}

// ─── Export Share Token Repository ────────────────────────────────────────────

export interface ExportShareTokenRepository {
  findByToken(token: string): Promise<DbExportShareToken | null>;
  findByExportId(exportId: string): Promise<DbExportShareToken[]>;
  create(
    exportId: string,
    userId: string,
    expiresAt: Date,
    scope?: "internal" | "external"
  ): Promise<{ token: string; id: string }>;
  updateAccessCount(tokenId: string): Promise<void>;
  revoke(tokenId: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

// ─── Reminder Repository ──────────────────────────────────────────────────────

export interface ReminderRepository {
  findById(id: string): Promise<DbReminder | null>;
  findByParentId(parentId: string): Promise<DbReminder[]>;
  findPendingByParentId(parentId: string): Promise<DbReminder[]>;
  findByFamilyId(familyId: string): Promise<DbReminder[]>;
  create(reminder: Omit<DbReminder, "id" | "createdAt">): Promise<DbReminder>;
  complete(id: string): Promise<DbReminder | null>;
  update(id: string, data: Partial<DbReminder>): Promise<DbReminder | null>;
  delete(id: string): Promise<boolean>;
}

// ─── Conflict Window Repository ───────────────────────────────────────────────

export interface ConflictWindowRepository {
  findByFamilyId(familyId: string): Promise<DbConflictWindow | null>;
  upsert(familyId: string, windowMins: number): Promise<DbConflictWindow>;
}

// ─── Billing Repositories ─────────────────────────────────────────────────────

export interface StripeCustomerRepository {
  findByUserId(userId: string): Promise<DbStripeCustomer | null>;
  findByStripeId(stripeCustomerId: string): Promise<DbStripeCustomer | null>;
  create(data: Omit<DbStripeCustomer, "id" | "createdAt" | "updatedAt">): Promise<DbStripeCustomer>;
  update(id: string, data: Partial<DbStripeCustomer>): Promise<DbStripeCustomer | null>;
}

export interface SubscriptionRepository {
  findByCustomer(stripeCustomerLocalId: string): Promise<DbSubscription | null>;
  findByStripeId(stripeSubscriptionId: string): Promise<DbSubscription | null>;
  findActive(stripeCustomerLocalId: string): Promise<DbSubscription | null>;
  create(data: Omit<DbSubscription, "id" | "createdAt" | "updatedAt">): Promise<DbSubscription>;
  update(id: string, data: Partial<DbSubscription>): Promise<DbSubscription | null>;
}

export interface PaymentMethodRepository {
  findByCustomer(stripeCustomerLocalId: string): Promise<DbPaymentMethod[]>;
  findDefault(stripeCustomerLocalId: string): Promise<DbPaymentMethod | null>;
  findByStripeId(stripePaymentMethodId: string): Promise<DbPaymentMethod | null>;
  create(data: Omit<DbPaymentMethod, "id" | "createdAt" | "updatedAt">): Promise<DbPaymentMethod>;
  setDefault(id: string, stripeCustomerLocalId: string): Promise<void>;
  softDelete(id: string): Promise<void>;
}

export interface InvoiceRepository {
  findByCustomer(stripeCustomerLocalId: string, limit?: number): Promise<DbInvoice[]>;
  findByStripeId(stripeInvoiceId: string): Promise<DbInvoice | null>;
  findBySubscription(subscriptionId: string): Promise<DbInvoice[]>;
  findOpen(stripeCustomerLocalId: string): Promise<DbInvoice[]>;
  upsert(data: Omit<DbInvoice, "id" | "createdAt" | "updatedAt">): Promise<DbInvoice>;
}

export interface WebhookEventRepository {
  findByStripeEventId(stripeEventId: string): Promise<DbWebhookEvent | null>;
  createIfNotExists(data: Omit<DbWebhookEvent, "id" | "createdAt">): Promise<{ event: DbWebhookEvent; alreadyProcessed: boolean }>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  findUnprocessed(limit?: number): Promise<DbWebhookEvent[]>;
}

export interface TwilioWebhookEventRepository {
  create(data: Omit<DbTwilioWebhookEvent, "id" | "createdAt">): Promise<DbTwilioWebhookEvent>;
  findByMessageSid(messageSid: string): Promise<DbTwilioWebhookEvent | null>;
  findByPhoneAndEventType(
    phoneNumber: string,
    eventType: string,
    timestamp?: string
  ): Promise<DbTwilioWebhookEvent | null>;
  markProcessed(id: string, processedAt?: string): Promise<void>;
  markError(id: string, errorMessage: string): Promise<void>;
  findUnprocessed(limit?: number): Promise<DbTwilioWebhookEvent[]>;
  findOlderThan(daysOld: number, limit?: number): Promise<DbTwilioWebhookEvent[]>;
}

export interface PlanTierRepository {
  findAll(): Promise<DbPlanTier[]>;
  findById(id: string): Promise<DbPlanTier | null>;
}

// ─── Mediation Topic Repository ───────────────────────────────────────────────

export interface MediationTopicRepository {
  findById(id: string): Promise<DbMediationTopic | null>;
  findByFamilyId(familyId: string): Promise<DbMediationTopic[]>;
  findByFamilyIdAndStatus(
    familyId: string,
    status: "draft" | "in_progress" | "resolved"
  ): Promise<DbMediationTopic[]>;
  create(
    topic: Omit<DbMediationTopic, "id" | "createdAt" | "updatedAt">
  ): Promise<DbMediationTopic>;
  update(
    id: string,
    data: Partial<Omit<DbMediationTopic, "id" | "familyId" | "createdAt">>
  ): Promise<DbMediationTopic | null>;
  saveDraft(id: string, draftSuggestion: string): Promise<DbMediationTopic | null>;
  resolve(id: string): Promise<DbMediationTopic | null>;
  delete(id: string): Promise<boolean>;
}

// ─── Mediation Warning Repository ─────────────────────────────────────────────

export interface MediationWarningRepository {
  findById(id: string): Promise<DbMediationWarning | null>;
  findByFamilyId(familyId: string): Promise<DbMediationWarning[]>;
  findByFamilyIdAndDateRange(
    familyId: string,
    startDate: string,
    endDate: string
  ): Promise<DbMediationWarning[]>;
  findUndismissedByFamilyId(familyId: string): Promise<DbMediationWarning[]>;
  create(
    warning: Omit<DbMediationWarning, "id" | "createdAt" | "updatedAt">
  ): Promise<DbMediationWarning>;
  dismiss(id: string, dismissedBy: string): Promise<DbMediationWarning | null>;
  getStats(familyId: string): Promise<{
    total: number;
    undismissed: number;
    highSeverityCount: number;
  }>;
}

// ─── Unit of Work ─────────────────────────────────────────────────────────────

/**
 * Unit of Work pattern for transactional operations.
 * Groups multiple repository operations into a single transaction.
 */
export interface UnitOfWork {
  users: UserRepository;
  sessions: SessionRepository;
  passwordResets: PasswordResetRepository;
  phoneVerifications: PhoneVerificationRepository;
  auditLogs: AuditLogRepository;
  rateLimits: RateLimitRepository;
  families: FamilyRepository;
  parents: ParentRepository;
  children: ChildRepository;
  custodySchedules: CustodyScheduleRepository;
  calendarEvents: CalendarEventRepository;
  scheduleChangeRequests: ScheduleChangeRequestRepository;
  changeRequestMessages: ChangeRequestMessageRepository;
  scheduleOverrides: ScheduleOverrideRepository;
  holidays: HolidayRepository;
  holidayExceptionRules: HolidayExceptionRuleRepository;
  blogPosts: BlogPostRepository;
  blogCategories: BlogCategoryRepository;
  schoolEvents: SchoolEventRepository;
  volunteerTasks: VolunteerTaskRepository;
  schoolContacts: SchoolContactRepository;
  schoolVaultDocuments: SchoolVaultDocumentRepository;
  lunchMenus: LunchMenuRepository;
  lunchAccounts: LunchAccountRepository;
  lunchTransactions: LunchTransactionRepository;
  expenses: ExpenseRepository;
  reminders: ReminderRepository;
  conflictWindows: ConflictWindowRepository;
  messageThreads: MessageThreadRepository;
  messages: MessageRepository;
  hashChainVerifications: HashChainVerificationRepository;
  smsRelayParticipants: SmsRelayParticipantRepository;
  moments: MomentRepository;
  momentReactions: MomentReactionRepository;
  scheduledNotifications: ScheduledNotificationRepository;
  exportJobs: ExportJobsRepository;
  stripeCustomers: StripeCustomerRepository;
  paymentMethods: PaymentMethodRepository;
  subscriptions: SubscriptionRepository;
  invoices: InvoiceRepository;
  webhookEvents: WebhookEventRepository;
  twilioWebhookEvents: TwilioWebhookEventRepository;
  planTiers: PlanTierRepository;
  exportMetadata: ExportMetadataRepository;
  exportMessageHashes: ExportMessageHashRepository;
  exportVerificationAttempts: ExportVerificationAttemptRepository;
  exportShareTokens: ExportShareTokenRepository;
  mediationTopics: MediationTopicRepository;
  mediationWarnings: MediationWarningRepository;

  /** Begin a transaction */
  beginTransaction(): Promise<void>;
  /** Commit the transaction */
  commit(): Promise<void>;
  /** Rollback the transaction */
  rollback(): Promise<void>;
}
