/**
 * KidSchedule – PostgreSQL Unit of Work
 *
 * Implements the UnitOfWork interface with PostgreSQL repositories.
 * Provides transactional support for multi-repository operations.
 */

import type { UnitOfWork } from "../repositories";
import type { SqlClient } from "./client";
import { createUserRepository } from "./user-repository";
import { createSessionRepository } from "./session-repository";
import { createPasswordResetRepository } from "./password-reset-repository";
import { createPhoneVerificationRepository } from "./phone-verification-repository";
import { createAuditLogRepository } from "./audit-log-repository";
import { createRateLimitRepository } from "./rate-limit-repository";
import { createFamilyRepository } from "./family-repository";
import { createParentRepository } from "./parent-repository";
import { createChildRepository } from "./child-repository";
import { createCalendarEventRepository } from "./calendar-event-repository";
import { createScheduleChangeRequestRepository } from "./schedule-change-request-repository";
import { createBlogPostRepository } from "./blog-post-repository";
import { createSchoolEventRepository } from "./school-event-repository";
import { createVolunteerTaskRepository } from "./volunteer-task-repository";
import { createSchoolContactRepository } from "./school-contact-repository";
import { createSchoolVaultDocumentRepository } from "./school-vault-document-repository";
import { createLunchMenuRepository } from "./lunch-menu-repository";
import { createExpenseRepository } from "./expense-repository";
import {
  createMessageThreadRepository,
  createMessageRepository,
  createHashChainVerificationRepository,
} from "./messaging-repository";
import { createMomentRepository, createMomentReactionRepository } from "./moments-repository";

// ─── Unit of Work Implementation ──────────────────────────────────────────────

/**
 * Creates a new PostgreSQL UnitOfWork instance.
 *
 * For non-transactional operations, call without arguments:
 *   const uow = createPostgresUnitOfWork();
 *   const user = await uow.users.findById(id);
 *
 * For transactional operations, use withTransaction:
 *   await withTransaction(async (tx) => {
 *     const uow = createPostgresUnitOfWork(tx);
 *     await uow.users.create(...);
 *     await uow.sessions.create(...);
 *   });
 */
export function createPostgresUnitOfWork(tx?: SqlClient): UnitOfWork {
  return {
    users: createUserRepository(tx),
    sessions: createSessionRepository(tx),
    passwordResets: createPasswordResetRepository(tx),
    phoneVerifications: createPhoneVerificationRepository(tx),
    auditLogs: createAuditLogRepository(tx),
    rateLimits: createRateLimitRepository(tx),
    families: createFamilyRepository(tx),
    parents: createParentRepository(tx),
    children: createChildRepository(tx),
    calendarEvents: createCalendarEventRepository(tx),
    scheduleChangeRequests: createScheduleChangeRequestRepository(tx),
    blogPosts: createBlogPostRepository(tx),
    schoolEvents: createSchoolEventRepository(tx),
    volunteerTasks: createVolunteerTaskRepository(tx),
    schoolContacts: createSchoolContactRepository(tx),
    schoolVaultDocuments: createSchoolVaultDocumentRepository(tx),
    lunchMenus: createLunchMenuRepository(tx),
    expenses: createExpenseRepository(),
    messageThreads: createMessageThreadRepository(),
    messages: createMessageRepository(),
    hashChainVerifications: createHashChainVerificationRepository(),
    moments: createMomentRepository(),
    momentReactions: createMomentReactionRepository(),

    // Transaction methods - these are no-ops for direct UoW usage
    // Use withTransaction() for actual transaction support
    async beginTransaction() {
      console.warn(
        "[UoW] beginTransaction() called on non-transactional UoW. Use withTransaction() instead."
      );
    },
    async commit() {
      console.warn(
        "[UoW] commit() called on non-transactional UoW. Use withTransaction() instead."
      );
    },
    async rollback() {
      console.warn(
        "[UoW] rollback() called on non-transactional UoW. Use withTransaction() instead."
      );
    },
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { sql, withTransaction, checkDatabaseConnection, closeDatabaseConnection } from "./client";
export type { SqlClient, Transaction } from "./client";
