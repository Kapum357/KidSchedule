/**
 * KidSchedule – PostgreSQL Custody Schedule Repository
 *
 * Manages weekly custody schedule blocks for a family.
 * Schema source: migrations/0003_calendar.sql
 */

import type { CustodyScheduleRepository } from "../repositories";
import type { DbCustodySchedule } from "../types";
import { sql, type SqlClient } from "./client";

type ScheduleRow = {
  id: string;
  family_id: string;
  name: string;
  transition_hour: number;
  blocks: string; // JSONB stored as string
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

function rowToDb(r: ScheduleRow): DbCustodySchedule {
  return {
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    transitionHour: r.transition_hour,
    blocks: typeof r.blocks === "string" ? r.blocks : JSON.stringify(r.blocks),
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export function createCustodyScheduleRepository(tx?: SqlClient): CustodyScheduleRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findById(id) {
      const rows = await q<ScheduleRow[]>`
        SELECT * FROM custody_schedules WHERE id = ${id} LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId) {
      const rows = await q<ScheduleRow[]>`
        SELECT * FROM custody_schedules WHERE family_id = ${familyId} ORDER BY created_at ASC
      `;
      return rows.map(rowToDb);
    },

    async findActiveByFamilyId(familyId) {
      const rows = await q<ScheduleRow[]>`
        SELECT * FROM custody_schedules WHERE family_id = ${familyId} AND is_active = true LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async create(schedule) {
      const rows = await q<ScheduleRow[]>`
        INSERT INTO custody_schedules (family_id, name, transition_hour, blocks, is_active)
        VALUES (
          ${schedule.familyId}, ${schedule.name}, ${schedule.transitionHour},
          ${schedule.blocks}::jsonb, ${schedule.isActive}
        )
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(id, data) {
      const rows = await q<ScheduleRow[]>`
        UPDATE custody_schedules SET
          name            = COALESCE(${data.name ?? null}, name),
          transition_hour = COALESCE(${data.transitionHour ?? null}, transition_hour),
          blocks          = CASE WHEN ${data.blocks !== undefined} THEN ${data.blocks ?? null}::jsonb ELSE blocks END,
          is_active       = COALESCE(${data.isActive ?? null}, is_active),
          updated_at      = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async setActive(familyId, scheduleId) {
      // Deactivate all, then activate the selected one — all in-sequence
      await q`UPDATE custody_schedules SET is_active = false WHERE family_id = ${familyId}`;
      const result = await q`
        UPDATE custody_schedules SET is_active = true, updated_at = NOW()
        WHERE id = ${scheduleId} AND family_id = ${familyId}
      `;
      return result.count > 0;
    },
  };
}
