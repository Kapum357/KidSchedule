/**
 * KidSchedule – PostgreSQL Conflict Window Repository
 *
 * Per-family scheduling conflict buffer (one row per family, family_id is PK).
 * Schema source: migrations/0003_calendar.sql
 */

import type { ConflictWindowRepository } from "../repositories";
import type { DbConflictWindow } from "../types";
import { sql, type SqlClient } from "./client";

type ConflictWindowRow = {
  family_id: string;
  window_mins: number;
  updated_at: Date;
};

function rowToDb(r: ConflictWindowRow): DbConflictWindow {
  return {
    familyId: r.family_id,
    windowMins: r.window_mins,
    updatedAt: r.updated_at.toISOString(),
  };
}

export function createConflictWindowRepository(tx?: SqlClient): ConflictWindowRepository {
  const q: SqlClient = tx ?? sql;

  return {
    async findByFamilyId(familyId) {
      const rows = await q<ConflictWindowRow[]>`
        SELECT * FROM conflict_windows WHERE family_id = ${familyId} LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async upsert(familyId, windowMins) {
      const rows = await q<ConflictWindowRow[]>`
        INSERT INTO conflict_windows (family_id, window_mins)
        VALUES (${familyId}, ${windowMins})
        ON CONFLICT (family_id) DO UPDATE
          SET window_mins = EXCLUDED.window_mins, updated_at = NOW()
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },
  };
}
