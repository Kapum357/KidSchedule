/**
 * Export Jobs Repository
 *
 * Manages async export job records in the database.
 * Tracks job status, results, and errors for auditing and monitoring.
 */

import type { ExportJobRecord } from "@/lib";
import { sql, type SqlClient } from "./client";

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

export function createExportJobsRepository(tx?: SqlClient) {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<ExportJobRecord | null> {
      const rows = await query<ExportJobRow[]>`
        SELECT * FROM export_jobs WHERE id = ${id} LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<ExportJobRecord[]> {
      const rows = await query<ExportJobRow[]>`
        SELECT * FROM export_jobs
        WHERE family_id = ${familyId}
        ORDER BY created_at DESC
        LIMIT 100
      `;
      return rows.map(rowToDb);
    },

    async findByUserId(userId: string): Promise<ExportJobRecord[]> {
      const rows = await query<ExportJobRow[]>`
        SELECT * FROM export_jobs
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 100
      `;
      return rows.map(rowToDb);
    },

    async findByStatus(status: string): Promise<ExportJobRecord[]> {
      const rows = await query<ExportJobRow[]>`
        SELECT * FROM export_jobs
        WHERE status = ${status}
        ORDER BY created_at ASC
        LIMIT 1000
      `;
      return rows.map(rowToDb);
    },

    async create(data: {
      familyId: string;
      userId: string;
      type: string;
      params: Record<string, unknown>;
    }): Promise<ExportJobRecord> {
      const rows = await query<ExportJobRow[]>`
        INSERT INTO export_jobs (family_id, user_id, type, params, status, retry_count)
        VALUES (${data.familyId}, ${data.userId}, ${data.type}, ${JSON.stringify(data.params)}, 'queued', 0)
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(id: string, data: Partial<ExportJobRecord>): Promise<ExportJobRecord | null> {
      // Build update clause with proper SQL escaping
      const setClauses: string[] = [];

      // String fields - escape single quotes by doubling them
      if (data.status !== undefined) {
        const escaped = String(data.status).replace(/'/g, "''");
        setClauses.push(`status = '${escaped}'`);
      }
      if (data.resultUrl !== undefined) {
        const escaped = String(data.resultUrl).replace(/'/g, "''");
        setClauses.push(`result_url = '${escaped}'`);
      }
      if (data.mimeType !== undefined) {
        const escaped = String(data.mimeType).replace(/'/g, "''");
        setClauses.push(`mime_type = '${escaped}'`);
      }
      if (data.error !== undefined) {
        const escaped = String(data.error).replace(/'/g, "''");
        setClauses.push(`error = '${escaped}'`);
      }
      if (data.completedAt !== undefined) {
        const escaped = String(data.completedAt).replace(/'/g, "''");
        setClauses.push(`completed_at = '${escaped}'`);
      }

      // Numeric fields - no quoting
      if (data.sizeBytes !== undefined) {
        setClauses.push(`size_bytes = ${data.sizeBytes}`);
      }
      if (data.retryCount !== undefined) {
        setClauses.push(`retry_count = ${data.retryCount}`);
      }

      // Return early if nothing to update
      if (setClauses.length === 0) {
        return this.findById(id);
      }

      setClauses.push("updated_at = NOW()");

      // Build and execute update query
      const setSql = setClauses.join(", ");
      const rows = (await query`
        UPDATE export_jobs
        SET ${query.unsafe(setSql)}
        WHERE id = ${id}
        RETURNING *
      `) as unknown as ExportJobRow[];

      return rows[0] ? rowToDb(rows[0]) : null;
    },
  };
}

export type ExportJobsRepository = ReturnType<typeof createExportJobsRepository>;
