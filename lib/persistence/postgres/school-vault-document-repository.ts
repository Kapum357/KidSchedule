/**
 * KidSchedule – PostgreSQL School Vault Document Repository
 */

import type { SchoolVaultDocumentRepository } from "../repositories";
import type { DbSchoolVaultDocument } from "../types";
import { sql, type SqlClient } from "./client";

type VaultDocumentRow = {
  id: string;
  familyId: string;
  title: string;
  fileType: string;
  status: string;
  statusLabel: string;
  addedAt: Date;
  addedBy: string;
  sizeBytes: number | null;
  url: string | null;
  actionDeadline: Date | null;
};

function rowToDb(row: VaultDocumentRow): DbSchoolVaultDocument {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    fileType: row.fileType,
    status: row.status,
    statusLabel: row.statusLabel,
    addedAt: row.addedAt.toISOString(),
    addedBy: row.addedBy,
    sizeBytes: row.sizeBytes ?? undefined,
    url: row.url ?? undefined,
    actionDeadline: row.actionDeadline?.toISOString(),
  };
}

export function createSchoolVaultDocumentRepository(tx?: SqlClient): SchoolVaultDocumentRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbSchoolVaultDocument | null> {
      const rows = await query<VaultDocumentRow[]>`SELECT * FROM school_vault_documents WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbSchoolVaultDocument[]> {
      const rows = await query<VaultDocumentRow[]>`
        SELECT * FROM school_vault_documents
        WHERE family_id = ${familyId}
        ORDER BY
          CASE WHEN status = 'pending_signature' THEN 0 ELSE 1 END,
          added_at DESC
      `;
      return rows.map(rowToDb);
    },
  };
}
