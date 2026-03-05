/**
 * Message Repositories – PostgreSQL Implementation
 *
 * Implements message hash chain for tamper-evident co-parenting communications.
 * Each message includes cryptographic hash linking to previous message in thread.
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
import { sql } from "./client";
import { computeMessageHash } from "../../hash-chain-engine";

export function createMessageThreadRepository(): MessageThreadRepository {
  return {
    async findById(id: string): Promise<DbMessageThread | null> {
      const result = (await sql`
        SELECT id, family_id, subject, created_at, last_message_at
        FROM message_threads
        WHERE id = ${id}
      `) as DbMessageThread[];
      return result[0] || null;
    },

    async findByFamilyId(familyId: string): Promise<DbMessageThread[]> {
      return (await sql`
        SELECT id, family_id, subject, created_at, last_message_at
        FROM message_threads
        WHERE family_id = ${familyId}
        ORDER BY last_message_at DESC
      `) as DbMessageThread[];
    },

    async create(data: Omit<DbMessageThread, "id" | "createdAt" | "lastMessageAt">): Promise<DbMessageThread> {
      const result = (await sql`
        INSERT INTO message_threads (family_id, subject)
        VALUES (${data.familyId}, ${data.subject ?? null})
        RETURNING id, family_id, subject, created_at, last_message_at
      `) as DbMessageThread[];
      return result[0];
    },

    async update(id: string, data: Partial<DbMessageThread>): Promise<DbMessageThread | null> {
      if (Object.keys(data).length === 0) return null;

      // Build dynamic update query
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (data.subject !== undefined) {
        updates.push(`subject = $${paramIndex}`);
        values.push(data.subject);
        paramIndex += 1;
      }

      if (updates.length === 0) return null;

      values.push(id); // Last parameter is the ID

      const query = `
        UPDATE message_threads
        SET ${updates.join(", ")}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING id, family_id, subject, created_at, last_message_at
      `;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await sql.unsafe(query, values as any[])) as unknown as DbMessageThread[];
      return result[0] || null;
    },
  };
}

export function createMessageRepository(): MessageRepository {
  return {
    async findById(id: string): Promise<DbMessage | null> {
      const result = (await sql`
        SELECT id, thread_id, family_id, sender_id, body, sent_at, read_at,
               attachment_ids, tone_analysis, message_hash, previous_hash,
               chain_index, created_at, updated_at
        FROM messages
        WHERE id = ${id}
      `) as DbMessage[];
      return result[0] || null;
    },

    async findByThreadId(threadId: string): Promise<DbMessage[]> {
      return (await sql`
        SELECT id, thread_id, family_id, sender_id, body, sent_at, read_at,
               attachment_ids, tone_analysis, message_hash, previous_hash,
               chain_index, created_at, updated_at
        FROM messages
        WHERE thread_id = ${threadId}
        ORDER BY chain_index ASC
      `) as unknown as DbMessage[];
    },

    async findByFamilyId(familyId: string): Promise<DbMessage[]> {
      return (await sql`
        SELECT id, thread_id, family_id, sender_id, body, sent_at, read_at,
               attachment_ids, tone_analysis, message_hash, previous_hash,
               chain_index, created_at, updated_at
        FROM messages
        WHERE family_id = ${familyId}
        ORDER BY sent_at DESC
      `) as unknown as DbMessage[];
    },

    async findUnreadByFamilyId(familyId: string): Promise<DbMessage[]> {
      return (await sql`
        SELECT id, thread_id, family_id, sender_id, body, sent_at, read_at,
               attachment_ids, tone_analysis, message_hash, previous_hash,
               chain_index, created_at, updated_at
        FROM messages
        WHERE family_id = ${familyId} AND read_at IS NULL
        ORDER BY sent_at DESC
      `) as unknown as DbMessage[];
    },

    async create(data: Omit<DbMessage, "id" | "createdAt" | "updatedAt">): Promise<DbMessage> {
      // Get the last message in the thread to determine chain index and previous hash
      const lastMessages = await sql<{ message_hash: string; chain_index: number }[]>`
        SELECT message_hash, chain_index
        FROM messages
        WHERE thread_id = ${data.threadId}
        ORDER BY chain_index DESC
        LIMIT 1
      `;

      const lastMessage = lastMessages[0];
      let chainIndex = 0;
      let previousHash: string | null = null;

      if (lastMessage) {
        chainIndex = lastMessage.chain_index + 1;
        previousHash = lastMessage.message_hash;
      }

      // Compute the hash for this message
      const messageForHash = {
        threadId: data.threadId,
        senderId: data.senderId,
        body: data.body,
        sentAt: data.sentAt,
        chainIndex,
      };

      const messageHash = await computeMessageHash(messageForHash, previousHash);

      // Insert the message with hash chain data
      let toneAnalysisJson: string | null = null;
      if (data.toneAnalysis) {
        toneAnalysisJson = JSON.stringify(data.toneAnalysis);
      }

      const result = (await sql`
        INSERT INTO messages (
          thread_id, family_id, sender_id, body, sent_at, read_at,
          attachment_ids, tone_analysis, message_hash, previous_hash, chain_index
        ) VALUES (
          ${data.threadId}, ${data.familyId}, ${data.senderId}, ${data.body},
          ${data.sentAt}, ${/* eslint-disable-line @typescript-eslint/no-explicit-any */ data.readAt as any}, ${data.attachmentIds},
          ${toneAnalysisJson}, ${messageHash}, ${previousHash}, ${chainIndex}
        )
        RETURNING id, thread_id, family_id, sender_id, body, sent_at, read_at,
                  attachment_ids, tone_analysis, message_hash, previous_hash,
                  chain_index, created_at, updated_at
      `) as unknown as DbMessage[];

      // Update thread's last_message_at
      await sql`
        UPDATE message_threads
        SET last_message_at = ${data.sentAt}
        WHERE id = ${data.threadId}
      `;

      return result[0];
    },

    async markAsRead(id: string, readAt: string): Promise<DbMessage | null> {
      const result = (await sql`
        UPDATE messages
        SET read_at = ${readAt}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, thread_id, family_id, sender_id, body, sent_at, read_at,
                  attachment_ids, tone_analysis, message_hash, previous_hash,
                  chain_index, created_at, updated_at
      `) as DbMessage[];
      return result[0] || null;
    },

    async update(): Promise<DbMessage | null> {
      // Note: Updating messages after creation is not allowed for hash chain integrity
      // Messages should be immutable once sent
      throw new Error("Messages cannot be updated after creation for hash chain integrity");
    },
  };
}

export function createHashChainVerificationRepository(): HashChainVerificationRepository {
  return {
    async findById(id: string): Promise<DbHashChainVerification | null> {
      const result = (await sql`
        SELECT id, thread_id, verified_at, verified_by, is_valid,
               tamper_detected_at_index, verification_report
        FROM hash_chain_verifications
        WHERE id = ${id}
      `) as DbHashChainVerification[];
      return result[0] || null;
    },

    async findByThreadId(threadId: string): Promise<DbHashChainVerification[]> {
      const results = (await sql`
        SELECT id, thread_id, verified_at, verified_by, is_valid,
               tamper_detected_at_index, verification_report
        FROM hash_chain_verifications
        WHERE thread_id = ${threadId}
        ORDER BY verified_at DESC
      `) as unknown as DbHashChainVerification[];
      return results;
    },

    async create(data: Omit<DbHashChainVerification, "id">): Promise<DbHashChainVerification> {
      let verificationReportJson: string | null = null;
      if (data.verificationReport) {
        verificationReportJson = JSON.stringify(data.verificationReport);
      }

      const result = (await sql`
        INSERT INTO hash_chain_verifications (
          thread_id, verified_at, verified_by, is_valid,
          tamper_detected_at_index, verification_report
        ) VALUES (
          ${data.threadId}, ${data.verifiedAt}, ${data.verifiedBy ?? null},
          ${data.isValid}, ${data.tamperDetectedAtIndex ?? null},
          ${verificationReportJson}
        )
        RETURNING id, thread_id, verified_at, verified_by, is_valid,
                  tamper_detected_at_index, verification_report
      `) as unknown as DbHashChainVerification[];
      return result[0];
    },

    async findLatestByThreadId(threadId: string): Promise<DbHashChainVerification | null> {
      const result = (await sql`
        SELECT id, thread_id, verified_at, verified_by, is_valid,
               tamper_detected_at_index, verification_report
        FROM hash_chain_verifications
        WHERE thread_id = ${threadId}
        ORDER BY verified_at DESC
        LIMIT 1
      `) as DbHashChainVerification[];
      return result[0] || null;
    },
  };
}
