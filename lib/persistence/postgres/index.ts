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
import { createCustodyScheduleRepository } from "./custody-schedule-repository";
import { createCalendarEventRepository } from "./calendar-event-repository";
import {
  createScheduleChangeRequestRepository,
  createChangeRequestMessageRepository,
  createScheduleOverrideRepository,
} from "./schedule-repository";
import { createHolidayRepository, createHolidayExceptionRuleRepository } from "./holiday-repository";
import { createBlogPostRepository, createBlogCategoryRepository } from "./blog-repository";
import { createVolunteerTaskRepository } from "./volunteer-task-repository";
import {
  createSchoolContactRepository,
  createSchoolEventRepository,
  createSchoolVaultDocumentRepository,
} from "./school-repository";
import {
  createLunchMenuRepository,
  createLunchAccountRepository,
  createLunchTransactionRepository,
} from "./lunch-repository";
import { createExpenseRepository } from "./expense-repository";
import { createReminderRepository } from "./reminder-repository";
import { createConflictWindowRepository } from "./conflict-window-repository";
import {
  createMessageThreadRepository,
  createMessageRepository,
  createHashChainVerificationRepository,
} from "./messaging-repository";
import { createSmsRelayParticipantRepository } from "./sms-relay-repository";
import { createSmsSubscriptionRepository } from "./sms-subscriptions-repository";
import { createMomentRepository, createMomentReactionRepository } from "./moments-repository";
import { createScheduledNotificationRepository } from "./scheduled-notification-repository";
import {
  createExportJobsRepository,
  createExportMetadataRepository,
  createExportMessageHashRepository,
  createExportVerificationAttemptRepository,
} from "./export-repository";
import { createExportShareTokenRepository } from "./export-share-token-repository";
import {
  createStripeCustomerRepository,
  createPaymentMethodRepository,
  createSubscriptionRepository,
  createInvoiceRepository,
  createWebhookEventRepository,
  createTwilioWebhookEventRepository,
  createPlanTierRepository,
} from "./billing-repository";
import {
  createMediationTopicRepository,
  createMediationWarningRepository,
} from "./mediation-repository";

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
    custodySchedules: createCustodyScheduleRepository(tx),
    calendarEvents: createCalendarEventRepository(tx),
    scheduleChangeRequests: createScheduleChangeRequestRepository(tx),
    changeRequestMessages: createChangeRequestMessageRepository(tx),
    scheduleOverrides: createScheduleOverrideRepository(tx),
    holidays: createHolidayRepository(tx),
    holidayExceptionRules: createHolidayExceptionRuleRepository(tx),
    blogPosts: createBlogPostRepository(tx),
    blogCategories: createBlogCategoryRepository(tx),
    schoolEvents: createSchoolEventRepository(tx),
    volunteerTasks: createVolunteerTaskRepository(tx),
    schoolContacts: createSchoolContactRepository(tx),
    schoolVaultDocuments: createSchoolVaultDocumentRepository(tx),
    lunchMenus: createLunchMenuRepository(tx),
    lunchAccounts: createLunchAccountRepository(tx),
    lunchTransactions: createLunchTransactionRepository(tx),
    expenses: createExpenseRepository(),
    reminders: createReminderRepository(tx),
    conflictWindows: createConflictWindowRepository(tx),
    messageThreads: createMessageThreadRepository(),
    messages: createMessageRepository(),
    hashChainVerifications: createHashChainVerificationRepository(),
    smsRelayParticipants: createSmsRelayParticipantRepository(tx),
    smsSubscriptions: createSmsSubscriptionRepository(tx),
    moments: createMomentRepository(),
    momentReactions: createMomentReactionRepository(),
    scheduledNotifications: createScheduledNotificationRepository(tx),
    exportJobs: createExportJobsRepository(tx),
    exportMetadata: createExportMetadataRepository(tx),
    exportMessageHashes: createExportMessageHashRepository(tx),
    exportVerificationAttempts: createExportVerificationAttemptRepository(tx),
    exportShareTokens: createExportShareTokenRepository(tx),
    stripeCustomers: createStripeCustomerRepository(tx),
    paymentMethods: createPaymentMethodRepository(tx),
    subscriptions: createSubscriptionRepository(tx),
    invoices: createInvoiceRepository(tx),
    webhookEvents: createWebhookEventRepository(tx),
    twilioWebhookEvents: createTwilioWebhookEventRepository(tx),
    planTiers: createPlanTierRepository(tx),
    mediationTopics: createMediationTopicRepository(tx),
    mediationWarnings: createMediationWarningRepository(tx),

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
