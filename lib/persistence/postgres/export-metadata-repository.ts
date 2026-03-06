/**
 * Export Metadata Repository
 *
 * Manages storage and retrieval of export metadata linked to PDF generation
 * and hash chain verification results for court-admissible documents.
 */

import type {
  ExportMetadataRepository,
  ExportMessageHashRepository,
  ExportVerificationAttemptRepository,
} from "../repositories";
import type {
  DbExportMetadata,
  DbExportMessageHash,
  DbExportVerificationAttempt,
} from "../types";
import { sql, type SqlClient } from "./client";

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

export function createExportMetadataRepository(tx?: SqlClient): ExportMetadataRepository {
  const query: SqlClient = tx ?? sql;

  return {
    /**
     * Find export metadata by ID
     */
    async findById(id: string): Promise<DbExportMetadata | null> {
      const rows = await query<ExportMetadataRow[]>`
        SELECT * FROM export_metadata WHERE id = ${id} LIMIT 1
      `;
      return rows[0] ? metadataRowToDb(rows[0]) : null;
    },

    /**
     * Find export metadata by export job ID
     */
    async findByExportId(exportId: string): Promise<DbExportMetadata | null> {
      const rows = await query<ExportMetadataRow[]>`
        SELECT * FROM export_metadata WHERE export_id = ${exportId} LIMIT 1
      `;
      return rows[0] ? metadataRowToDb(rows[0]) : null;
    },

    /**
     * Find all exports for a family (for audit/discovery purposes)
     */
    async findByFamilyId(familyId: string): Promise<DbExportMetadata[]> {
      const rows = await query<ExportMetadataRow[]>`
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
      const rows = await query<ExportMetadataRow[]>`
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
        const rows = await query<ExportMetadataRow[]>`
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
      await query`
        UPDATE export_metadata
        SET hash_chain_verification_id = ${verificationId}, updated_at = NOW()
        WHERE id = ${exportMetadataId}
      `;
      return true;
    },
  };
}

export function createExportMessageHashRepository(tx?: SqlClient): ExportMessageHashRepository {
  const query: SqlClient = tx ?? sql;

  return {
    /**
     * Find all message hashes for an export
     */
    async findByExportMetadataId(exportMetadataId: string): Promise<DbExportMessageHash[]> {
      const rows = await query<ExportMessageHashRow[]>`
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
        const rows = await query<ExportMessageHashRow[]>`
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

export function createExportVerificationAttemptRepository(tx?: SqlClient): ExportVerificationAttemptRepository {
  const query: SqlClient = tx ?? sql;

  return {
    /**
     * Find all verification attempts for an export (audit trail)
     */
    async findByExportMetadataId(exportMetadataId: string): Promise<DbExportVerificationAttempt[]> {
      const rows = await query<ExportVerificationAttemptRow[]>`
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
      const rows = await query<ExportVerificationAttemptRow[]>`
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
