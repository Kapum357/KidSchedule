/**
 * Export Repository
 *
 * Manages async export job records, export metadata, message hashes,
 * and verification attempts for court-admissible documents.
 */

import type {
  ExportJobsRepository,
  ExportMetadataRepository,
  ExportMessageHashRepository,
  ExportVerificationAttemptRepository,
} from "../repositories";
import type { ExportJobRecord } from "@/lib";
import type {
  DbExportMetadata,
  DbExportMessageHash,
  DbExportVerificationAttempt,
} from "../types";
import { sql, type SqlClient } from "./client";

// ─── Export Jobs impl ─────────────────────────────────────────────────────────

type ExportJobRow = {
  id: string;
  family_id: string;
  user_id: string;
  type: string;
  params: Record<string, unknown>;
  status: string;
  result_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  error: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
};

function rowToDb(row: ExportJobRow): ExportJobRecord {
  return {
    id: row.id,
    familyId: row.family_id,
    userId: row.user_id,
    type: row.type as ExportJobRecord['type'],
    params: row.params,
    status: row.status as ExportJobRecord['status'],
    resultUrl: row.result_url ?? undefined,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    error: row.error ?? undefined,
    retryCount: row.retry_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at?.toISOString(),
  };
}

export function createExportJobsRepository(tx?: SqlClient): ExportJobsRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findById(id: string): Promise<ExportJobRecord | null> {
      const rows = await q<ExportJobRow[]>`
        SELECT * FROM export_jobs WHERE id = ${id} LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<ExportJobRecord[]> {
      const rows = await q<ExportJobRow[]>`
        SELECT * FROM export_jobs
        WHERE family_id = ${familyId}
        ORDER BY created_at DESC
        LIMIT 100
      `;
      return rows.map(rowToDb);
    },

    async findByUserId(userId: string): Promise<ExportJobRecord[]> {
      const rows = await q<ExportJobRow[]>`
        SELECT * FROM export_jobs
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 100
      `;
      return rows.map(rowToDb);
    },

    async findByStatus(status: string): Promise<ExportJobRecord[]> {
      const rows = await q<ExportJobRow[]>`
        SELECT * FROM export_jobs
        WHERE status = ${status}
        ORDER BY created_at ASC
        LIMIT 1000
      `;
      return rows.map(rowToDb);
    },

    async findByMessageId(messageId: string): Promise<ExportJobRecord[]> {
      const rows = await q<ExportJobRow[]>`
        SELECT j.* FROM export_jobs j
        INNER JOIN export_metadata m ON m.export_id = j.id
        WHERE m.included_message_ids @> $1::jsonb
        ORDER BY j.created_at DESC
      `;
      // Bind message ID as JSONB array element
      // Using raw SQL since complex JSONB queries need custom binding
      try {
        const result = await q.unsafe(
          `SELECT j.* FROM export_jobs j
           INNER JOIN export_metadata m ON m.export_id = j.id
           WHERE m.included_message_ids @> $1::jsonb
           ORDER BY j.created_at DESC`,
          [JSON.stringify([messageId])]
        ) as ExportJobRow[];
        return result.map(rowToDb);
      } catch {
        // Fallback: if JSONB query fails, return empty array
        return [];
      }
    },

    async create(data: {
      familyId: string;
      userId: string;
      type: string;
      params: Record<string, unknown>;
    }): Promise<ExportJobRecord> {
      const rows = await q<ExportJobRow[]>`
        INSERT INTO export_jobs (family_id, user_id, type, params, status, retry_count)
        VALUES (${data.familyId}, ${data.userId}, ${data.type}, ${JSON.stringify(data.params)}, 'queued', 0)
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(id: string, data: Partial<ExportJobRecord>): Promise<ExportJobRecord | null> {
      const updates: Record<string, unknown> = {};
      if (data.status !== undefined) updates.status = data.status;
      if (data.resultUrl !== undefined) updates.result_url = data.resultUrl;
      if (data.mimeType !== undefined) updates.mime_type = data.mimeType;
      if (data.error !== undefined) updates.error = data.error;
      if (data.completedAt !== undefined) updates.completed_at = data.completedAt;
      if (data.sizeBytes !== undefined) updates.size_bytes = data.sizeBytes;
      if (data.retryCount !== undefined) updates.retry_count = data.retryCount;

      if (Object.keys(updates).length === 0) return this.findById(id);

      const rows = await q<ExportJobRow[]>`
        UPDATE export_jobs
        SET ${q(updates)}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },
  };
}

// ─── Export Metadata impl ─────────────────────────────────────────────────────

type ExportMetadataRow = {
  id: string;
  export_id: string;
  family_id: string;
  report_type: string;
  hash_chain_verification_id?: string;
  included_message_ids: string[];
  custody_period_start?: string;
  custody_period_end?: string;
  pdf_hash: string;
  pdf_size_bytes: number;
  created_at: Date;
  updated_at: Date;
};

function metadataRowToDb(row: ExportMetadataRow): DbExportMetadata {
  return {
    id: row.id,
    exportId: row.export_id,
    familyId: row.family_id,
    reportType: row.report_type,
    hashChainVerificationId: row.hash_chain_verification_id,
    includedMessageIds: row.included_message_ids,
    custodyPeriodStart: row.custody_period_start,
    custodyPeriodEnd: row.custody_period_end,
    pdfHash: row.pdf_hash,
    pdfSizeBytes: row.pdf_size_bytes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createExportMetadataRepository(tx?: SqlClient): ExportMetadataRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    /**
     * Find export metadata by ID
     */
    async findById(id: string): Promise<DbExportMetadata | null> {
      const rows = await q<ExportMetadataRow[]>`
        SELECT * FROM export_metadata WHERE id = ${id} LIMIT 1
      `;
      return rows[0] ? metadataRowToDb(rows[0]) : null;
    },

    /**
     * Find export metadata by export job ID
     */
    async findByExportId(exportId: string): Promise<DbExportMetadata | null> {
      const rows = await q<ExportMetadataRow[]>`
        SELECT * FROM export_metadata WHERE export_id = ${exportId} LIMIT 1
      `;
      return rows[0] ? metadataRowToDb(rows[0]) : null;
    },

    /**
     * Find all exports for a family (for audit/discovery purposes)
     */
    async findByFamilyId(familyId: string): Promise<DbExportMetadata[]> {
      const rows = await q<ExportMetadataRow[]>`
        SELECT * FROM export_metadata
        WHERE family_id = ${familyId}
        ORDER BY created_at DESC
      `;
      return rows.map(metadataRowToDb);
    },

    /**
     * Create new export metadata record
     */
    async create(data: Omit<DbExportMetadata, "id" | "createdAt" | "updatedAt">): Promise<DbExportMetadata> {
      const rows = await q<ExportMetadataRow[]>`
        INSERT INTO export_metadata (
          export_id,
          family_id,
          report_type,
          hash_chain_verification_id,
          included_message_ids,
          custody_period_start,
          custody_period_end,
          pdf_hash,
          pdf_size_bytes,
          created_at,
          updated_at
        )
        VALUES (
          ${data.exportId},
          ${data.familyId},
          ${data.reportType},
          ${data.hashChainVerificationId || null},
          ${JSON.stringify(data.includedMessageIds)},
          ${data.custodyPeriodStart || null},
          ${data.custodyPeriodEnd || null},
          ${data.pdfHash},
          ${data.pdfSizeBytes},
          NOW(),
          NOW()
        )
        RETURNING *
      `;
      return metadataRowToDb(rows[0]);
    },

    /**
     * Update export metadata
     */
    async update(id: string, data: Partial<DbExportMetadata>): Promise<DbExportMetadata | null> {
      if (data.hashChainVerificationId !== undefined) {
        const rows = await q<ExportMetadataRow[]>`
          UPDATE export_metadata
          SET hash_chain_verification_id = ${data.hashChainVerificationId}, updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;
        return rows[0] ? metadataRowToDb(rows[0]) : null;
      }

      // No updates specified - return current record
      return this.findById(id);
    },

    /**
     * Link a verification result to export metadata
     */
    async linkVerification(exportMetadataId: string, verificationId: string): Promise<boolean> {
      await q`
        UPDATE export_metadata
        SET hash_chain_verification_id = ${verificationId}, updated_at = NOW()
        WHERE id = ${exportMetadataId}
      `;
      return true;
    },
  };
}

// ─── Export Message Hash impl ─────────────────────────────────────────────────

type ExportMessageHashRow = {
  id: string;
  export_metadata_id: string;
  message_id: string;
  chain_index: number;
  message_hash: string;
  previous_hash: string;
  sent_at: string;
  sender_id: string;
  message_preview?: string;
  created_at: Date;
};

function messageHashRowToDb(row: ExportMessageHashRow): DbExportMessageHash {
  return {
    id: row.id,
    exportMetadataId: row.export_metadata_id,
    messageId: row.message_id,
    chainIndex: row.chain_index,
    messageHash: row.message_hash,
    previousHash: row.previous_hash,
    sentAt: row.sent_at,
    senderId: row.sender_id,
    messagePreview: row.message_preview,
    createdAt: row.created_at.toISOString(),
  };
}

export function createExportMessageHashRepository(tx?: SqlClient): ExportMessageHashRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    /**
     * Find all message hashes for an export
     */
    async findByExportMetadataId(exportMetadataId: string): Promise<DbExportMessageHash[]> {
      const rows = await q<ExportMessageHashRow[]>`
        SELECT * FROM export_message_hashes
        WHERE export_metadata_id = ${exportMetadataId}
        ORDER BY chain_index ASC
      `;
      return rows.map(messageHashRowToDb);
    },

    /**
     * Batch insert message hashes (for PDF generation result)
     */
    async createBatch(
      hashes: Omit<DbExportMessageHash, "id" | "createdAt">[]
    ): Promise<DbExportMessageHash[]> {
      if (!hashes.length) return [];

      const results: DbExportMessageHash[] = [];

      for (const hash of hashes) {
        const rows = await q<ExportMessageHashRow[]>`
          INSERT INTO export_message_hashes (
            export_metadata_id,
            message_id,
            chain_index,
            message_hash,
            previous_hash,
            sent_at,
            sender_id,
            message_preview,
            created_at
          )
          VALUES (
            ${hash.exportMetadataId},
            ${hash.messageId},
            ${hash.chainIndex},
            ${hash.messageHash},
            ${hash.previousHash},
            ${hash.sentAt},
            ${hash.senderId},
            ${hash.messagePreview || null},
            NOW()
          )
          RETURNING *
        `;
        if (rows[0]) results.push(messageHashRowToDb(rows[0]));
      }

      return results;
    },
  };
}

// ─── Export Verification Attempt impl ────────────────────────────────────────

type ExportVerificationAttemptRow = {
  id: string;
  export_metadata_id: string;
  verified_by: string;
  verified_at: string;
  verification_status: string;
  is_valid: boolean;
  integrity_status?: string;
  pdf_hash_match?: boolean;
  errors_detected?: string[];
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
};

function verificationAttemptRowToDb(row: ExportVerificationAttemptRow): DbExportVerificationAttempt {
  return {
    id: row.id,
    exportMetadataId: row.export_metadata_id,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    verificationStatus: row.verification_status,
    isValid: row.is_valid,
    integrityStatus: row.integrity_status,
    pdfHashMatch: row.pdf_hash_match,
    errorsDetected: row.errors_detected,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at.toISOString(),
  };
}

export function createExportVerificationAttemptRepository(tx?: SqlClient): ExportVerificationAttemptRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    /**
     * Find all verification attempts for an export (audit trail)
     */
    async findByExportMetadataId(exportMetadataId: string): Promise<DbExportVerificationAttempt[]> {
      const rows = await q<ExportVerificationAttemptRow[]>`
        SELECT * FROM export_verification_attempts
        WHERE export_metadata_id = ${exportMetadataId}
        ORDER BY verified_at DESC
      `;
      return rows.map(verificationAttemptRowToDb);
    },

    /**
     * Record a verification attempt (for audit compliance)
     */
    async create(data: Omit<DbExportVerificationAttempt, "id" | "createdAt">): Promise<DbExportVerificationAttempt> {
      const rows = await q<ExportVerificationAttemptRow[]>`
        INSERT INTO export_verification_attempts (
          export_metadata_id,
          verified_by,
          verified_at,
          verification_status,
          is_valid,
          integrity_status,
          pdf_hash_match,
          errors_detected,
          ip_address,
          user_agent,
          created_at
        )
        VALUES (
          ${data.exportMetadataId},
          ${data.verifiedBy},
          ${data.verifiedAt},
          ${data.verificationStatus},
          ${data.isValid},
          ${data.integrityStatus || null},
          ${data.pdfHashMatch ?? null},
          ${data.errorsDetected ? JSON.stringify(data.errorsDetected) : null},
          ${data.ipAddress || null},
          ${data.userAgent || null},
          NOW()
        )
        RETURNING *
      `;
      return verificationAttemptRowToDb(rows[0]);
    },
  };
}
