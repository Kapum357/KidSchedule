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
  | "security.suspicious_activity";

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
