/**
 * KidSchedule – PostgreSQL Rate Limit Repository
 */

import type { RateLimitRepository } from "../repositories";
import type { DbRateLimit } from "../types";
import { sql, type SqlClient } from "./client";

type RateLimitRow = {
  key: string;
  windowStartedAt: Date;
  count: number;
  lockedUntil: Date | null;
};

function rowToDb(row: RateLimitRow): DbRateLimit {
  return {
    key: row.key,
    windowStartedAt: row.windowStartedAt.toISOString(),
    count: row.count,
    lockedUntil: row.lockedUntil?.toISOString(),
  };
}

export function createRateLimitRepository(tx?: SqlClient): RateLimitRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async get(key: string): Promise<DbRateLimit | null> {
      const rows = await query<RateLimitRow[]>`SELECT * FROM rate_limits WHERE key = ${key}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async increment(key: string, windowMs: number): Promise<DbRateLimit> {
      // Upsert with window expiration check
      const rows = await query<RateLimitRow[]>`
        INSERT INTO rate_limits (key, window_started_at, count)
        VALUES (${key}, NOW(), 1)
        ON CONFLICT (key) DO UPDATE SET
          count = CASE 
            WHEN rate_limits.window_started_at < NOW() - INTERVAL '1 millisecond' * ${windowMs}
            THEN 1
            ELSE rate_limits.count + 1
          END,
          window_started_at = CASE 
            WHEN rate_limits.window_started_at < NOW() - INTERVAL '1 millisecond' * ${windowMs}
            THEN NOW()
            ELSE rate_limits.window_started_at
          END
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async setLockout(key: string, lockedUntil: string): Promise<void> {
      await query`
        INSERT INTO rate_limits (key, window_started_at, count, locked_until)
        VALUES (${key}, NOW(), 0, ${new Date(lockedUntil)})
        ON CONFLICT (key) DO UPDATE SET locked_until = ${new Date(lockedUntil)}
      `;
    },

    async clear(key: string): Promise<void> {
      await query`DELETE FROM rate_limits WHERE key = ${key}`;
    },

    async clearExpired(): Promise<number> {
      const result = await query`
        DELETE FROM rate_limits 
        WHERE window_started_at < NOW() - INTERVAL '1 hour'
          AND (locked_until IS NULL OR locked_until < NOW())
      `;
      return result.count;
    },
  };
}
