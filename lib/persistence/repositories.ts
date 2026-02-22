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
  DbCalendarEvent,
  DbScheduleChangeRequest,
  DbBlogPost,
  DbSchoolEvent,
  DbVolunteerTask,
  AuditAction,
} from "./types";

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
  findPendingByFamilyId(familyId: string): Promise<DbScheduleChangeRequest[]>;
  create(
    request: Omit<DbScheduleChangeRequest, "id" | "createdAt">
  ): Promise<DbScheduleChangeRequest>;
  update(
    id: string,
    data: Partial<DbScheduleChangeRequest>
  ): Promise<DbScheduleChangeRequest | null>;
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
  calendarEvents: CalendarEventRepository;
  scheduleChangeRequests: ScheduleChangeRequestRepository;
  blogPosts: BlogPostRepository;
  schoolEvents: SchoolEventRepository;
  volunteerTasks: VolunteerTaskRepository;

  /** Begin a transaction */
  beginTransaction(): Promise<void>;
  /** Commit the transaction */
  commit(): Promise<void>;
  /** Rollback the transaction */
  rollback(): Promise<void>;
}
