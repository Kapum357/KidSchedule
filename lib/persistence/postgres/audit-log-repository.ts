/**
 * KidSchedule – PostgreSQL Audit Log Repository
 */

import type { AuditLogRepository } from "../repositories";
import type { DbAuditLog, AuditAction } from "../types";
import { sql, type SqlClient } from "./client";

type AuditRow = {
  id: string;
  userId: string | null;
  action: AuditAction;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  timestamp: Date;
};

function rowToDb(row: AuditRow): DbAuditLog {
  return {
    id: row.id,
    userId: row.userId ?? undefined,
    action: row.action,
    metadata: row.metadata,
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
    timestamp: row.timestamp.toISOString(),
  };
}

export function createAuditLogRepository(tx?: SqlClient): AuditLogRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async create(log: Omit<DbAuditLog, "id" | "timestamp">): Promise<DbAuditLog> {
      const rows = await query<AuditRow[]>`
        INSERT INTO audit_logs (user_id, action, metadata, ip, user_agent)
        VALUES (${log.userId ?? null}, ${log.action}, ${JSON.stringify(log.metadata)}, ${log.ip ?? null}, ${log.userAgent ?? null})
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async findByUserId(userId: string, limit = 100): Promise<DbAuditLog[]> {
      const rows = await query<AuditRow[]>`
        SELECT * FROM audit_logs WHERE user_id = ${userId}
        ORDER BY timestamp DESC LIMIT ${limit}
      `;
      return rows.map(rowToDb);
    },

    async findByAction(action: AuditAction, limit = 100): Promise<DbAuditLog[]> {
      const rows = await query<AuditRow[]>`
        SELECT * FROM audit_logs WHERE action = ${action}
        ORDER BY timestamp DESC LIMIT ${limit}
      `;
      return rows.map(rowToDb);
    },

    async findRecent(limit: number): Promise<DbAuditLog[]> {
      const rows = await query<AuditRow[]>`
        SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ${limit}
      `;
      return rows.map(rowToDb);
    },
  };
}
