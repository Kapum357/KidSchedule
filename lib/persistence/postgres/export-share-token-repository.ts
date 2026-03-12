/**
 * Export Share Token Repository
 *
 * Manages shareable tokens for public export verification.
 * Tokens are the only gatekeeper for public access (no user auth needed).
 */

import { randomBytes } from "crypto";
import type { ExportShareTokenRepository } from "../repositories";
import type { DbExportShareToken } from "../types";
import { sql, type SqlClient } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportShareTokenRow = {
  id: string;
  export_id: string;
  token: string;
  scope: "internal" | "external";
  created_at: Date;
  expires_at: Date;
  last_accessed_at: Date | null;
  access_count: number;
  created_by_user_id: string;
};

function rowToDb(row: ExportShareTokenRow): DbExportShareToken {
  return {
    id: row.id,
    exportId: row.export_id,
    token: row.token,
    scope: row.scope,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    lastAccessedAt: row.last_accessed_at?.toISOString(),
    accessCount: row.access_count,
    createdByUserId: row.created_by_user_id,
  };
}

// ─── Repository Factory ───────────────────────────────────────────────────────

export function createExportShareTokenRepository(tx?: SqlClient): ExportShareTokenRepository {
  const q: SqlClient = tx ?? sql;

  return {
    async findByToken(token: string): Promise<DbExportShareToken | null> {
      const rows = await q<ExportShareTokenRow[]>`
        SELECT * FROM export_share_tokens
        WHERE token = ${token}
          AND expires_at > NOW()
        LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByExportId(exportId: string): Promise<DbExportShareToken[]> {
      const rows = await q<ExportShareTokenRow[]>`
        SELECT * FROM export_share_tokens
        WHERE export_id = ${exportId}
        ORDER BY created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async create(
      exportId: string,
      userId: string,
      expiresAt: Date,
      scope: "internal" | "external" = "external"
    ): Promise<{ token: string; id: string }> {
      // Generate cryptographically secure 64-character hex token
      const tokenBytes = randomBytes(32);
      const token = tokenBytes.toString("hex");

      const rows = await q<{ id: string }[]>`
        INSERT INTO export_share_tokens (
          export_id,
          token,
          scope,
          expires_at,
          created_by_user_id
        )
        VALUES (
          ${exportId},
          ${token},
          ${scope},
          ${expiresAt.toISOString()},
          ${userId}
        )
        RETURNING id
      `;

      const id = rows[0]?.id;
      if (!id) {
        throw new Error("Failed to create export share token");
      }

      return { token, id };
    },

    async updateAccessCount(tokenId: string): Promise<void> {
      await q`
        UPDATE export_share_tokens
        SET
          access_count = access_count + 1,
          last_accessed_at = NOW()
        WHERE id = ${tokenId}
      `;
    },

    async revoke(tokenId: string): Promise<void> {
      // Soft delete via expiration
      await q`
        UPDATE export_share_tokens
        SET expires_at = NOW()
        WHERE id = ${tokenId}
      `;
    },

    async deleteExpired(): Promise<number> {
      const result = await q`
        DELETE FROM export_share_tokens
        WHERE expires_at < NOW()
      `;
      return result.count ?? 0;
    },
  };
}
