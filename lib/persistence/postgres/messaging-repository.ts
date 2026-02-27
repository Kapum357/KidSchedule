/**
 * Message Repositories – PostgreSQL Implementation (Stub)
 *
 * Placeholder for migration 0007_messaging.sql integration.
 * To be implemented when migration is applied to production database.
 */

import type {
  MessageThreadRepository,
  MessageRepository,
  HashChainVerificationRepository,
} from "../repositories";
import type {
  DbMessageThread,
  DbMessage,
  DbHashChainVerification,
} from "../types";

export function createMessageThreadRepository(): MessageThreadRepository {
  return {
    async findById() {
      return null;
    },
    async findByFamilyId() {
      return [];
    },
    async create(data) {
      return data as DbMessageThread;
    },
    async update(_id, data) {
      return data as DbMessageThread;
    },
  };
}

export function createMessageRepository(): MessageRepository {
  return {
    async findById() {
      return null;
    },
    async findByThreadId() {
      return [];
    },
    async findByFamilyId() {
      return [];
    },
    async findUnreadByFamilyId() {
      return [];
    },
    async create(data) {
      return data as DbMessage;
    },
    async markAsRead() {
      return null;
    },
    async update(_id, data) {
      return data as DbMessage;
    },
  };
}

export function createHashChainVerificationRepository(): HashChainVerificationRepository {
  return {
    async findById() {
      return null;
    },
    async findByThreadId() {
      return [];
    },
    async create(data) {
      return data as DbHashChainVerification;
    },
    async findLatestByThreadId() {
      return null;
    },
  };
}
