/**
 * KidSchedule – PostgreSQL Volunteer Task Repository
 */

import type { VolunteerTaskRepository } from "../repositories";
import type { DbVolunteerTask } from "../types";
import { sql, type SqlClient } from "./client";

type TaskRow = {
  id: string;
  familyId: string;
  eventId: string;
  title: string;
  description: string | null;
  assignedParentId: string | null;
  status: string;
  estimatedHours: number;
  scheduledFor: Date;
  completedAt: Date | null;
  icon: string | null;
  iconColor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function rowToDb(row: TaskRow): DbVolunteerTask {
  return {
    id: row.id,
    familyId: row.familyId,
    eventId: row.eventId,
    title: row.title,
    description: row.description ?? undefined,
    assignedParentId: row.assignedParentId ?? undefined,
    status: row.status,
    estimatedHours: row.estimatedHours,
    scheduledFor: row.scheduledFor.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    icon: row.icon ?? undefined,
    iconColor: row.iconColor ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createVolunteerTaskRepository(tx?: SqlClient): VolunteerTaskRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbVolunteerTask | null> {
      const rows = await query<TaskRow[]>`SELECT * FROM volunteer_tasks WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbVolunteerTask[]> {
      const rows = await query<TaskRow[]>`
        SELECT * FROM volunteer_tasks WHERE family_id = ${familyId} ORDER BY scheduled_for
      `;
      return rows.map(rowToDb);
    },

    async findByEventId(eventId: string): Promise<DbVolunteerTask[]> {
      const rows = await query<TaskRow[]>`
        SELECT * FROM volunteer_tasks WHERE event_id = ${eventId} ORDER BY scheduled_for
      `;
      return rows.map(rowToDb);
    },

    async findUnassigned(familyId: string): Promise<DbVolunteerTask[]> {
      const rows = await query<TaskRow[]>`
        SELECT * FROM volunteer_tasks 
        WHERE family_id = ${familyId} AND assigned_parent_id IS NULL AND status = 'open'
        ORDER BY scheduled_for
      `;
      return rows.map(rowToDb);
    },

    async create(task: Omit<DbVolunteerTask, "id" | "createdAt" | "updatedAt">): Promise<DbVolunteerTask> {
      const rows = await query<TaskRow[]>`
        INSERT INTO volunteer_tasks (
          family_id, event_id, title, description, assigned_parent_id, status,
          estimated_hours, scheduled_for, icon, icon_color
        ) VALUES (
          ${task.familyId}, ${task.eventId}, ${task.title}, ${task.description ?? null},
          ${task.assignedParentId ?? null}, ${task.status}, ${task.estimatedHours},
          ${new Date(task.scheduledFor)}, ${task.icon ?? null}, ${task.iconColor ?? null}
        )
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async assign(id: string, parentId: string): Promise<DbVolunteerTask | null> {
      const rows = await query<TaskRow[]>`
        UPDATE volunteer_tasks 
        SET assigned_parent_id = ${parentId}, status = 'assigned', updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async complete(id: string): Promise<DbVolunteerTask | null> {
      const rows = await query<TaskRow[]>`
        UPDATE volunteer_tasks 
        SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },
  };
}
