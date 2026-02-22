/**
 * KidSchedule – Mock Database Implementation
 *
 * In-memory implementation of repositories for development and testing.
 * Replace with Prisma/Drizzle implementation for production.
 *
 * ⚠️ This implementation resets on server restart.
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
import type {
  UnitOfWork,
  UserRepository,
  SessionRepository,
  PasswordResetRepository,
  PhoneVerificationRepository,
  AuditLogRepository,
  RateLimitRepository,
  FamilyRepository,
  ParentRepository,
  ChildRepository,
  CalendarEventRepository,
  ScheduleChangeRequestRepository,
  BlogPostRepository,
  SchoolEventRepository,
  VolunteerTaskRepository,
} from "./repositories";

// ─── In-Memory Stores ─────────────────────────────────────────────────────────

const stores = {
  users: new Map<string, DbUser>(),
  sessions: new Map<string, DbSession>(),
  passwordResets: new Map<string, DbPasswordResetRequest>(),
  phoneVerifications: new Map<string, DbPhoneVerification>(),
  auditLogs: new Map<string, DbAuditLog>(),
  rateLimits: new Map<string, DbRateLimit>(),
  families: new Map<string, DbFamily>(),
  parents: new Map<string, DbParent>(),
  children: new Map<string, DbChild>(),
  calendarEvents: new Map<string, DbCalendarEvent>(),
  scheduleChangeRequests: new Map<string, DbScheduleChangeRequest>(),
  blogPosts: new Map<string, DbBlogPost>(),
  schoolEvents: new Map<string, DbSchoolEvent>(),
  volunteerTasks: new Map<string, DbVolunteerTask>(),
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ─── User Repository Implementation ───────────────────────────────────────────

const userRepository: UserRepository = {
  async findById(id) {
    return stores.users.get(id) ?? null;
  },
  async findByEmail(email) {
    const normalized = email.toLowerCase();
    for (const user of stores.users.values()) {
      if (user.email.toLowerCase() === normalized) return user;
    }
    return null;
  },
  async create(data) {
    const user: DbUser = {
      id: generateId(),
      createdAt: now(),
      updatedAt: now(),
      ...data,
    };
    stores.users.set(user.id, user);
    return user;
  },
  async update(id, data) {
    const user = stores.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...data, updatedAt: now() };
    stores.users.set(id, updated);
    return updated;
  },
  async updatePassword(id, passwordHash) {
    const user = stores.users.get(id);
    if (!user) return false;
    stores.users.set(id, { ...user, passwordHash, updatedAt: now() });
    return true;
  },
  async markEmailVerified(id) {
    const user = stores.users.get(id);
    if (!user) return false;
    stores.users.set(id, { ...user, emailVerified: true, emailVerifiedAt: now(), updatedAt: now() });
    return true;
  },
  async markPhoneVerified(id, phone) {
    const user = stores.users.get(id);
    if (!user) return false;
    stores.users.set(id, { ...user, phone, phoneVerified: true, phoneVerifiedAt: now(), updatedAt: now() });
    return true;
  },
  async disable(id, reason) {
    const user = stores.users.get(id);
    if (!user) return false;
    stores.users.set(id, { ...user, isDisabled: true, disabledAt: now(), disabledReason: reason, updatedAt: now() });
    return true;
  },
};

// ─── Session Repository Implementation ────────────────────────────────────────

const sessionRepository: SessionRepository = {
  async findById(id) {
    return stores.sessions.get(id) ?? null;
  },
  async findByRefreshTokenHash(hash) {
    for (const session of stores.sessions.values()) {
      if (session.refreshTokenHash === hash && !session.isRevoked) return session;
    }
    return null;
  },
  async findActiveByUserId(userId) {
    const results: DbSession[] = [];
    for (const session of stores.sessions.values()) {
      if (session.userId === userId && !session.isRevoked) results.push(session);
    }
    return results;
  },
  async create(data) {
    const session: DbSession = { id: generateId(), createdAt: now(), ...data };
    stores.sessions.set(session.id, session);
    return session;
  },
  async rotate(id, newRefreshTokenHash, newExpiresAt) {
    const session = stores.sessions.get(id);
    if (!session) return null;
    const rotated = { ...session, refreshTokenHash: newRefreshTokenHash, expiresAt: newExpiresAt, rotatedAt: now() };
    stores.sessions.set(id, rotated);
    return rotated;
  },
  async revoke(id, reason) {
    const session = stores.sessions.get(id);
    if (!session) return false;
    stores.sessions.set(id, { ...session, isRevoked: true, revokedAt: now(), revokeReason: reason });
    return true;
  },
  async revokeAllForUser(userId, reason) {
    let count = 0;
    for (const [id, session] of stores.sessions) {
      if (session.userId === userId && !session.isRevoked) {
        stores.sessions.set(id, { ...session, isRevoked: true, revokedAt: now(), revokeReason: reason });
        count++;
      }
    }
    return count;
  },
  async deleteExpired() {
    const cutoff = now();
    let count = 0;
    for (const [id, session] of stores.sessions) {
      if (session.expiresAt < cutoff) {
        stores.sessions.delete(id);
        count++;
      }
    }
    return count;
  },
};

// ─── Password Reset Repository Implementation ─────────────────────────────────

const passwordResetRepository: PasswordResetRepository = {
  async findById(id) {
    return stores.passwordResets.get(id) ?? null;
  },
  async findByTokenHash(hash) {
    for (const request of stores.passwordResets.values()) {
      if (request.tokenHash === hash) return request;
    }
    return null;
  },
  async findByEmail(email) {
    const results: DbPasswordResetRequest[] = [];
    const normalized = email.toLowerCase();
    for (const request of stores.passwordResets.values()) {
      if (request.email.toLowerCase() === normalized) results.push(request);
    }
    return results;
  },
  async create(data) {
    const request: DbPasswordResetRequest = { id: generateId(), ...data };
    stores.passwordResets.set(request.id, request);
    return request;
  },
  async markUsed(id) {
    const request = stores.passwordResets.get(id);
    if (!request) return false;
    stores.passwordResets.set(id, { ...request, usedAt: now() });
    return true;
  },
  async deleteExpired() {
    const cutoff = now();
    let count = 0;
    for (const [id, request] of stores.passwordResets) {
      if (request.expiresAt < cutoff) {
        stores.passwordResets.delete(id);
        count++;
      }
    }
    return count;
  },
  async countRecentByEmail(email, windowMs) {
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const normalized = email.toLowerCase();
    let count = 0;
    for (const request of stores.passwordResets.values()) {
      if (request.email.toLowerCase() === normalized && request.requestedAt > cutoff) count++;
    }
    return count;
  },
};

// ─── Phone Verification Repository Implementation ─────────────────────────────

const phoneVerificationRepository: PhoneVerificationRepository = {
  async findById(id) {
    return stores.phoneVerifications.get(id) ?? null;
  },
  async findByUserId(userId) {
    for (const verification of stores.phoneVerifications.values()) {
      if (verification.userId === userId && !verification.verifiedAt) return verification;
    }
    return null;
  },
  async findByPhone(phone) {
    for (const verification of stores.phoneVerifications.values()) {
      if (verification.phone === phone && !verification.verifiedAt) return verification;
    }
    return null;
  },
  async create(data) {
    const verification: DbPhoneVerification = { id: generateId(), ...data };
    stores.phoneVerifications.set(verification.id, verification);
    return verification;
  },
  async incrementAttempts(id) {
    const verification = stores.phoneVerifications.get(id);
    if (!verification) return null;
    const updated = { ...verification, attemptCount: verification.attemptCount + 1 };
    stores.phoneVerifications.set(id, updated);
    return updated;
  },
  async markVerified(id) {
    const verification = stores.phoneVerifications.get(id);
    if (!verification) return false;
    stores.phoneVerifications.set(id, { ...verification, verifiedAt: now() });
    return true;
  },
  async deleteExpired() {
    const cutoff = now();
    let count = 0;
    for (const [id, verification] of stores.phoneVerifications) {
      if (verification.expiresAt < cutoff) {
        stores.phoneVerifications.delete(id);
        count++;
      }
    }
    return count;
  },
};

// ─── Audit Log Repository Implementation ──────────────────────────────────────

const auditLogRepository: AuditLogRepository = {
  async create(data) {
    const log: DbAuditLog = { id: generateId(), timestamp: now(), ...data };
    stores.auditLogs.set(log.id, log);
    return log;
  },
  async findByUserId(userId, limit = 100) {
    const results: DbAuditLog[] = [];
    for (const log of stores.auditLogs.values()) {
      if (log.userId === userId) results.push(log);
    }
    return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  },
  async findByAction(action, limit = 100) {
    const results: DbAuditLog[] = [];
    for (const log of stores.auditLogs.values()) {
      if (log.action === action) results.push(log);
    }
    return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  },
  async findRecent(limit) {
    return Array.from(stores.auditLogs.values())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  },
};

// ─── Rate Limit Repository Implementation ─────────────────────────────────────

const rateLimitRepository: RateLimitRepository = {
  async get(key) {
    return stores.rateLimits.get(key) ?? null;
  },
  async increment(key, windowMs) {
    const existing = stores.rateLimits.get(key);
    const windowStart = new Date(Date.now() - windowMs).toISOString();

    if (existing && existing.windowStartedAt > windowStart) {
      const updated = { ...existing, count: existing.count + 1 };
      stores.rateLimits.set(key, updated);
      return updated;
    }

    const fresh: DbRateLimit = { key, windowStartedAt: now(), count: 1 };
    stores.rateLimits.set(key, fresh);
    return fresh;
  },
  async setLockout(key, lockedUntil) {
    const existing = stores.rateLimits.get(key);
    if (existing) {
      stores.rateLimits.set(key, { ...existing, lockedUntil });
    } else {
      stores.rateLimits.set(key, { key, windowStartedAt: now(), count: 0, lockedUntil });
    }
  },
  async clear(key) {
    stores.rateLimits.delete(key);
  },
  async clearExpired() {
    const cutoff = now();
    let count = 0;
    for (const [key, limit] of stores.rateLimits) {
      if (limit.lockedUntil && limit.lockedUntil < cutoff) {
        stores.rateLimits.delete(key);
        count++;
      }
    }
    return count;
  },
};

// ─── Placeholder Repositories ─────────────────────────────────────────────────

const familyRepository: FamilyRepository = {
  async findById(id) { return stores.families.get(id) ?? null; },
  async findByParentUserId() { return null; }, // Requires join
  async create(data) {
    const family: DbFamily = { id: generateId(), createdAt: now(), updatedAt: now(), ...data };
    stores.families.set(family.id, family);
    return family;
  },
  async update(id, data) {
    const family = stores.families.get(id);
    if (!family) return null;
    const updated = { ...family, ...data, updatedAt: now() };
    stores.families.set(id, updated);
    return updated;
  },
};

const parentRepository: ParentRepository = {
  async findById(id) { return stores.parents.get(id) ?? null; },
  async findByUserId(userId) {
    for (const parent of stores.parents.values()) {
      if (parent.userId === userId) return parent;
    }
    return null;
  },
  async findByFamilyId(familyId) {
    return Array.from(stores.parents.values()).filter(p => p.familyId === familyId);
  },
  async create(data) {
    const parent: DbParent = { id: generateId(), createdAt: now(), ...data };
    stores.parents.set(parent.id, parent);
    return parent;
  },
  async update(id, data) {
    const parent = stores.parents.get(id);
    if (!parent) return null;
    const updated = { ...parent, ...data };
    stores.parents.set(id, updated);
    return updated;
  },
};

const childRepository: ChildRepository = {
  async findById(id) { return stores.children.get(id) ?? null; },
  async findByFamilyId(familyId) {
    return Array.from(stores.children.values()).filter(c => c.familyId === familyId);
  },
  async create(data) {
    const child: DbChild = { id: generateId(), createdAt: now(), ...data };
    stores.children.set(child.id, child);
    return child;
  },
  async update(id, data) {
    const child = stores.children.get(id);
    if (!child) return null;
    const updated = { ...child, ...data };
    stores.children.set(id, updated);
    return updated;
  },
  async delete(id) {
    return stores.children.delete(id);
  },
};

const calendarEventRepository: CalendarEventRepository = {
  async findById(id) { return stores.calendarEvents.get(id) ?? null; },
  async findByFamilyId(familyId) {
    return Array.from(stores.calendarEvents.values()).filter(e => e.familyId === familyId);
  },
  async findByFamilyIdAndDateRange(familyId, startAt, endAt) {
    return Array.from(stores.calendarEvents.values()).filter(
      e => e.familyId === familyId && e.startAt >= startAt && e.startAt <= endAt
    );
  },
  async create(data) {
    const event: DbCalendarEvent = { id: generateId(), createdAt: now(), updatedAt: now(), ...data };
    stores.calendarEvents.set(event.id, event);
    return event;
  },
  async update(id, data) {
    const event = stores.calendarEvents.get(id);
    if (!event) return null;
    const updated = { ...event, ...data, updatedAt: now() };
    stores.calendarEvents.set(id, updated);
    return updated;
  },
  async delete(id) { return stores.calendarEvents.delete(id); },
};

const scheduleChangeRequestRepository: ScheduleChangeRequestRepository = {
  async findById(id) { return stores.scheduleChangeRequests.get(id) ?? null; },
  async findByFamilyId(familyId) {
    return Array.from(stores.scheduleChangeRequests.values()).filter(r => r.familyId === familyId);
  },
  async findPendingByFamilyId(familyId) {
    return Array.from(stores.scheduleChangeRequests.values()).filter(
      r => r.familyId === familyId && r.status === "pending"
    );
  },
  async create(data) {
    const request: DbScheduleChangeRequest = { id: generateId(), createdAt: now(), ...data };
    stores.scheduleChangeRequests.set(request.id, request);
    return request;
  },
  async update(id, data) {
    const request = stores.scheduleChangeRequests.get(id);
    if (!request) return null;
    const updated = { ...request, ...data };
    stores.scheduleChangeRequests.set(id, updated);
    return updated;
  },
};

const blogPostRepository: BlogPostRepository = {
  async findById(id) { return stores.blogPosts.get(id) ?? null; },
  async findBySlug(slug) {
    for (const post of stores.blogPosts.values()) {
      if (post.slug === slug) return post;
    }
    return null;
  },
  async findPublished({ limit, offset, categories, sort }) {
    let posts = Array.from(stores.blogPosts.values()).filter(p => p.isPublished);
    if (categories?.length) {
      posts = posts.filter(p => {
        const postCats = JSON.parse(p.categories) as string[];
        return categories.some(c => postCats.includes(c));
      });
    }
    if (sort === "popular") {
      posts.sort((a, b) => b.viewCount - a.viewCount);
    } else {
      posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    }
    return { posts: posts.slice(offset, offset + limit), total: posts.length };
  },
  async findFeatured() {
    for (const post of stores.blogPosts.values()) {
      if (post.isFeatured && post.isPublished) return post;
    }
    return null;
  },
  async incrementViewCount(id) {
    const post = stores.blogPosts.get(id);
    if (post) stores.blogPosts.set(id, { ...post, viewCount: post.viewCount + 1 });
  },
  async incrementShareCount(id) {
    const post = stores.blogPosts.get(id);
    if (post) stores.blogPosts.set(id, { ...post, shareCount: post.shareCount + 1 });
  },
};

const schoolEventRepository: SchoolEventRepository = {
  async findById(id) { return stores.schoolEvents.get(id) ?? null; },
  async findByFamilyId(familyId) {
    return Array.from(stores.schoolEvents.values()).filter(e => e.familyId === familyId);
  },
  async findUpcoming(familyId, fromDate) {
    return Array.from(stores.schoolEvents.values())
      .filter(e => e.familyId === familyId && e.startAt >= fromDate)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  },
  async create(data) {
    const event: DbSchoolEvent = { id: generateId(), createdAt: now(), updatedAt: now(), ...data };
    stores.schoolEvents.set(event.id, event);
    return event;
  },
  async update(id, data) {
    const event = stores.schoolEvents.get(id);
    if (!event) return null;
    const updated = { ...event, ...data, updatedAt: now() };
    stores.schoolEvents.set(id, updated);
    return updated;
  },
  async delete(id) { return stores.schoolEvents.delete(id); },
};

const volunteerTaskRepository: VolunteerTaskRepository = {
  async findById(id) { return stores.volunteerTasks.get(id) ?? null; },
  async findByFamilyId(familyId) {
    return Array.from(stores.volunteerTasks.values()).filter(t => t.familyId === familyId);
  },
  async findByEventId(eventId) {
    return Array.from(stores.volunteerTasks.values()).filter(t => t.eventId === eventId);
  },
  async findUnassigned(familyId) {
    return Array.from(stores.volunteerTasks.values()).filter(
      t => t.familyId === familyId && !t.assignedParentId
    );
  },
  async create(data) {
    const task: DbVolunteerTask = { id: generateId(), createdAt: now(), updatedAt: now(), ...data };
    stores.volunteerTasks.set(task.id, task);
    return task;
  },
  async assign(id, parentId) {
    const task = stores.volunteerTasks.get(id);
    if (!task) return null;
    const updated = { ...task, assignedParentId: parentId, status: "assigned", updatedAt: now() };
    stores.volunteerTasks.set(id, updated);
    return updated;
  },
  async complete(id) {
    const task = stores.volunteerTasks.get(id);
    if (!task) return null;
    const updated = { ...task, status: "completed", completedAt: now(), updatedAt: now() };
    stores.volunteerTasks.set(id, updated);
    return updated;
  },
};

// ─── Unit of Work Factory ─────────────────────────────────────────────────────

export function createMockUnitOfWork(): UnitOfWork {
  return {
    users: userRepository,
    sessions: sessionRepository,
    passwordResets: passwordResetRepository,
    phoneVerifications: phoneVerificationRepository,
    auditLogs: auditLogRepository,
    rateLimits: rateLimitRepository,
    families: familyRepository,
    parents: parentRepository,
    children: childRepository,
    calendarEvents: calendarEventRepository,
    scheduleChangeRequests: scheduleChangeRequestRepository,
    blogPosts: blogPostRepository,
    schoolEvents: schoolEventRepository,
    volunteerTasks: volunteerTaskRepository,

    async beginTransaction() {
      // No-op for in-memory store
    },
    async commit() {
      // No-op for in-memory store
    },
    async rollback() {
      // No-op for in-memory store
    },
  };
}
