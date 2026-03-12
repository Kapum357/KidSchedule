/**
 * KidSchedule – PostgreSQL Reminder Repository
 *
 * Personal per-parent reminders scoped to a family.
 * Schema source: migrations/0009_reminders.sql
 */

import type { ReminderRepository } from "../repositories";
import type { DbReminder } from "../types";
import { sql, type SqlClient } from "./client";

type ReminderRow = {
  id: string;
  family_id: string;
  parent_id: string;
  text: string;
  due_at: Date | null;
  completed: boolean;
  completed_at: Date | null;
  created_at: Date;
};

function rowToDb(r: ReminderRow): DbReminder {
  return {
    id: r.id,
    familyId: r.family_id,
    parentId: r.parent_id,
    text: r.text,
    dueAt: r.due_at?.toISOString(),
    completed: r.completed,
    completedAt: r.completed_at?.toISOString(),
    createdAt: r.created_at.toISOString(),
  };
}

export function createReminderRepository(tx?: SqlClient): ReminderRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findById(id) {
      const rows = await q<ReminderRow[]>`SELECT * FROM reminders WHERE id = ${id} LIMIT 1`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByParentId(parentId) {
      const rows = await q<ReminderRow[]>`
        SELECT * FROM reminders WHERE parent_id = ${parentId} ORDER BY due_at ASC NULLS LAST, created_at ASC
      `;
      return rows.map(rowToDb);
    },

    async findPendingByParentId(parentId) {
      const rows = await q<ReminderRow[]>`
        SELECT * FROM reminders WHERE parent_id = ${parentId} AND completed = false
        ORDER BY due_at ASC NULLS LAST, created_at ASC
      `;
      return rows.map(rowToDb);
    },

    async findByFamilyId(familyId) {
      const rows = await q<ReminderRow[]>`
        SELECT * FROM reminders WHERE family_id = ${familyId} ORDER BY due_at ASC NULLS LAST, created_at ASC
      `;
      return rows.map(rowToDb);
    },

    async create(reminder) {
      const rows = await q<ReminderRow[]>`
        INSERT INTO reminders (family_id, parent_id, text, due_at, completed, completed_at)
        VALUES (
          ${reminder.familyId}, ${reminder.parentId}, ${reminder.text},
          ${reminder.dueAt ? new Date(reminder.dueAt) : null},
          ${reminder.completed ?? false},
          ${reminder.completedAt ? new Date(reminder.completedAt) : null}
        )
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async complete(id) {
      const rows = await q<ReminderRow[]>`
        UPDATE reminders SET completed = true, completed_at = NOW()
        WHERE id = ${id} AND completed = false
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async update(id, data) {
      const rows = await q<ReminderRow[]>`
        UPDATE reminders SET
          text = COALESCE(${data.text ?? null}, text),
          due_at = CASE WHEN ${data.dueAt !== undefined} THEN ${data.dueAt ? new Date(data.dueAt) : null} ELSE due_at END,
          completed = COALESCE(${data.completed ?? null}, completed),
          completed_at = CASE WHEN ${data.completedAt !== undefined} THEN ${data.completedAt ? new Date(data.completedAt) : null} ELSE completed_at END
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async delete(id) {
      const result = await q`DELETE FROM reminders WHERE id = ${id}`;
      return result.count > 0;
    },
  };
}
