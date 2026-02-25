/**
 * KidSchedule – PostgreSQL Session Repository
 *
 * Implements SessionRepository interface with PostgreSQL.
 */

import type { SessionRepository } from "../repositories";
import type { DbSession } from "../types";
import { sql, type SqlClient } from "./client";

// ─── Type Helpers ─────────────────────────────────────────────────────────────

type SessionRow = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  rotatedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
  isRevoked: boolean;
  revokedAt: Date | null;
  revokeReason: string | null;
};

function rowToDbSession(row: SessionRow): DbSession {
  return {
    id: row.id,
    userId: row.userId,
    refreshTokenHash: row.refreshTokenHash,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    rotatedAt: row.rotatedAt?.toISOString(),
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
    isRevoked: row.isRevoked,
    revokedAt: row.revokedAt?.toISOString(),
    revokeReason: row.revokeReason ?? undefined,
  };
}

// ─── Repository Implementation ────────────────────────────────────────────────

export function createSessionRepository(tx?: SqlClient): SessionRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbSession | null> {
      const rows = await query<SessionRow[]>`
        SELECT * FROM sessions WHERE id = ${id}
      `;
      return rows[0] ? rowToDbSession(rows[0]) : null;
    },

    async findByRefreshTokenHash(hash: string): Promise<DbSession | null> {
      const rows = await query<SessionRow[]>`
        SELECT * FROM sessions 
        WHERE refresh_token_hash = ${hash}
          AND NOT is_revoked
          AND expires_at > NOW()
      `;
      return rows[0] ? rowToDbSession(rows[0]) : null;
    },

    async findActiveByUserId(userId: string): Promise<DbSession[]> {
      const rows = await query<SessionRow[]>`
        SELECT * FROM sessions 
        WHERE user_id = ${userId}
          AND NOT is_revoked
          AND expires_at > NOW()
        ORDER BY created_at DESC
      `;
      return rows.map(rowToDbSession);
    },

    async create(
      session: Omit<DbSession, "id" | "createdAt">
    ): Promise<DbSession> {
      const rows = await query<SessionRow[]>`
        INSERT INTO sessions (
          user_id, refresh_token_hash, expires_at, ip, user_agent
        ) VALUES (
          ${session.userId},
          ${session.refreshTokenHash},
          ${new Date(session.expiresAt)},
          ${session.ip ?? null},
          ${session.userAgent ?? null}
        )
        RETURNING *
      `;
      return rowToDbSession(rows[0]);
    },

    async rotate(
      id: string,
      newRefreshTokenHash: string,
      newExpiresAt: string
    ): Promise<DbSession | null> {
      const rows = await query<SessionRow[]>`
        UPDATE sessions 
        SET refresh_token_hash = ${newRefreshTokenHash},
            expires_at = ${new Date(newExpiresAt)},
            rotated_at = NOW()
        WHERE id = ${id} AND NOT is_revoked
        RETURNING *
      `;
      return rows[0] ? rowToDbSession(rows[0]) : null;
    },

    async revoke(id: string, reason?: string): Promise<boolean> {
      const result = await query`
        UPDATE sessions 
        SET is_revoked = TRUE, revoked_at = NOW(), revoke_reason = ${reason ?? null}
        WHERE id = ${id}
      `;
      return result.count > 0;
    },

    async revokeAllForUser(userId: string, reason?: string): Promise<number> {
      const result = await query`
        UPDATE sessions 
        SET is_revoked = TRUE, revoked_at = NOW(), revoke_reason = ${reason ?? null}
        WHERE user_id = ${userId} AND NOT is_revoked
      `;
      return result.count;
    },

    async deleteExpired(): Promise<number> {
      const result = await query`
        DELETE FROM sessions 
        WHERE expires_at < NOW() - INTERVAL '30 days'
          OR (is_revoked AND revoked_at < NOW() - INTERVAL '7 days')
      `;
      return result.count;
    },
  };
}
