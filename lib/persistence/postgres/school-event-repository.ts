/**
 * KidSchedule – PostgreSQL School Event Repository
 */

import type { SchoolEventRepository } from "../repositories";
import type { DbSchoolEvent } from "../types";
import { sql, type SqlClient } from "./client";

type EventRow = {
  id: string;
  familyId: string;
  title: string;
  description: string | null;
  eventType: string;
  startAt: Date;
  endAt: Date;
  location: string | null;
  isAllDay: boolean;
  attendingParentIds: string[];
  actionRequired: boolean;
  actionDeadline: Date | null;
  actionDescription: string | null;
  volunteerTaskIds: string[];
  accentColor: string | null;
  icon: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function rowToDb(row: EventRow): DbSchoolEvent {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    description: row.description ?? undefined,
    eventType: row.eventType,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    location: row.location ?? undefined,
    isAllDay: row.isAllDay,
    attendingParentIds: JSON.stringify(row.attendingParentIds),
    actionRequired: row.actionRequired,
    actionDeadline: row.actionDeadline?.toISOString(),
    actionDescription: row.actionDescription ?? undefined,
    volunteerTaskIds: JSON.stringify(row.volunteerTaskIds),
    accentColor: row.accentColor ?? undefined,
    icon: row.icon ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createSchoolEventRepository(tx?: SqlClient): SchoolEventRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbSchoolEvent | null> {
      const rows = await query<EventRow[]>`SELECT * FROM school_events WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbSchoolEvent[]> {
      const rows = await query<EventRow[]>`
        SELECT * FROM school_events WHERE family_id = ${familyId} ORDER BY start_at
      `;
      return rows.map(rowToDb);
    },

    async findUpcoming(familyId: string, fromDate: string): Promise<DbSchoolEvent[]> {
      const rows = await query<EventRow[]>`
        SELECT * FROM school_events 
        WHERE family_id = ${familyId} AND start_at >= ${new Date(fromDate)}
        ORDER BY start_at LIMIT 50
      `;
      return rows.map(rowToDb);
    },

    async create(event: Omit<DbSchoolEvent, "id" | "createdAt" | "updatedAt">): Promise<DbSchoolEvent> {
      const rows = await query<EventRow[]>`
        INSERT INTO school_events (
          family_id, title, description, event_type, start_at, end_at, location,
          is_all_day, attending_parent_ids, action_required, action_deadline,
          action_description, volunteer_task_ids, accent_color, icon
        ) VALUES (
          ${event.familyId}, ${event.title}, ${event.description ?? null}, ${event.eventType},
          ${new Date(event.startAt)}, ${new Date(event.endAt)}, ${event.location ?? null},
          ${event.isAllDay}, ${JSON.parse(event.attendingParentIds)}, ${event.actionRequired},
          ${event.actionDeadline ? new Date(event.actionDeadline) : null}, ${event.actionDescription ?? null},
          ${JSON.parse(event.volunteerTaskIds)}, ${event.accentColor ?? null}, ${event.icon ?? null}
        )
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(id: string, data: Partial<DbSchoolEvent>): Promise<DbSchoolEvent | null> {
      const updates: string[] = [];
      if (data.title !== undefined) updates.push(`title = '${data.title}'`);
      if (data.description !== undefined) updates.push(`description = ${data.description ? `'${data.description}'` : "NULL"}`);
      if (data.startAt !== undefined) updates.push(`start_at = '${data.startAt}'`);
      if (data.endAt !== undefined) updates.push(`end_at = '${data.endAt}'`);
      
      if (updates.length === 0) return this.findById(id);

      const rows = await query<EventRow[]>`
        UPDATE school_events SET ${sql.unsafe(updates.join(", "))}, updated_at = NOW() WHERE id = ${id} RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async delete(id: string): Promise<boolean> {
      const result = await query`DELETE FROM school_events WHERE id = ${id}`;
      return result.count > 0;
    },
  };
}
