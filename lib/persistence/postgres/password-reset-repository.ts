/**
 * KidSchedule – PostgreSQL Password Reset Repository
 */

import type { PasswordResetRepository } from "../repositories";
import type { DbPasswordResetRequest } from "../types";
import { sql, type SqlClient } from "./client";

type ResetRow = {
  id: string;
  email: string;
  tokenHash: string;
  requestedAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
};

function rowToDb(row: ResetRow): DbPasswordResetRequest {
  return {
    id: row.id,
    email: row.email,
    tokenHash: row.tokenHash,
    requestedAt: row.requestedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt?.toISOString(),
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
  };
}

export function createPasswordResetRepository(tx?: SqlClient): PasswordResetRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbPasswordResetRequest | null> {
      const rows = await query<ResetRow[]>`SELECT * FROM password_reset_tokens WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByTokenHash(hash: string): Promise<DbPasswordResetRequest | null> {
      const rows = await query<ResetRow[]>`
        SELECT * FROM password_reset_tokens 
        WHERE token_hash = ${hash} AND used_at IS NULL AND expires_at > NOW()
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByEmail(email: string): Promise<DbPasswordResetRequest[]> {
      const rows = await query<ResetRow[]>`
        SELECT * FROM password_reset_tokens WHERE email = ${email.toLowerCase()}
        ORDER BY requested_at DESC
      `;
      return rows.map(rowToDb);
    },

    async create(request: Omit<DbPasswordResetRequest, "id">): Promise<DbPasswordResetRequest> {
      const rows = await query<ResetRow[]>`
        INSERT INTO password_reset_tokens (email, token_hash, expires_at, ip, user_agent)
        VALUES (${request.email.toLowerCase()}, ${request.tokenHash}, ${new Date(request.expiresAt)}, ${request.ip ?? null}, ${request.userAgent ?? null})
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async markUsed(id: string): Promise<boolean> {
      const result = await query`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${id}`;
      return result.count > 0;
    },

    async deleteExpired(): Promise<number> {
      const result = await query`DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '7 days'`;
      return result.count;
    },

    async countRecentByEmail(email: string, windowMs: number): Promise<number> {
      const rows = await query<[{ count: string }]>`
        SELECT COUNT(*) as count FROM password_reset_tokens 
        WHERE email = ${email.toLowerCase()} 
          AND requested_at > NOW() - INTERVAL '1 millisecond' * ${windowMs}
      `;
      return Number.parseInt(rows[0].count, 10);
    },
  };
}
