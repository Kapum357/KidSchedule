/**
 * KidSchedule – PostgreSQL Calendar Event Repository
 */

import type { CalendarEventRepository } from "../repositories";
import type { DbCalendarEvent } from "../types";
import { sql, type SqlClient } from "./client";

type EventRow = {
  id: string;
  familyId: string;
  title: string;
  description: string | null;
  category: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  parentId: string | null;
  confirmationStatus: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function rowToDb(row: EventRow): DbCalendarEvent {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    allDay: row.allDay,
    location: row.location ?? undefined,
    parentId: row.parentId ?? undefined,
    confirmationStatus: row.confirmationStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createCalendarEventRepository(tx?: SqlClient): CalendarEventRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbCalendarEvent | null> {
      const rows = await query<EventRow[]>`SELECT * FROM calendar_events WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbCalendarEvent[]> {
      const rows = await query<EventRow[]>`
        SELECT * FROM calendar_events WHERE family_id = ${familyId} ORDER BY start_at
      `;
      return rows.map(rowToDb);
    },

    async findByFamilyIdAndDateRange(familyId: string, startAt: string, endAt: string): Promise<DbCalendarEvent[]> {
      const rows = await query<EventRow[]>`
        SELECT * FROM calendar_events 
        WHERE family_id = ${familyId} 
          AND start_at >= ${new Date(startAt)} 
          AND start_at <= ${new Date(endAt)}
        ORDER BY start_at
      `;
      return rows.map(rowToDb);
    },

    async create(event: Omit<DbCalendarEvent, "id" | "createdAt" | "updatedAt">): Promise<DbCalendarEvent> {
      const rows = await query<EventRow[]>`
        INSERT INTO calendar_events (
          family_id, title, description, category, start_at, end_at, all_day, 
          location, parent_id, confirmation_status, created_by
        ) VALUES (
          ${event.familyId}, ${event.title}, ${event.description ?? null}, ${event.category},
          ${new Date(event.startAt)}, ${new Date(event.endAt)}, ${event.allDay},
          ${event.location ?? null}, ${event.parentId ?? null}, ${event.confirmationStatus}, ${event.createdBy}
        )
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(id: string, data: Partial<DbCalendarEvent>): Promise<DbCalendarEvent | null> {
      const updates: string[] = [];
      if (data.title !== undefined) updates.push(`title = '${data.title}'`);
      if (data.description !== undefined) updates.push(`description = ${data.description ? `'${data.description}'` : "NULL"}`);
      if (data.category !== undefined) updates.push(`category = '${data.category}'`);
      if (data.startAt !== undefined) updates.push(`start_at = '${data.startAt}'`);
      if (data.endAt !== undefined) updates.push(`end_at = '${data.endAt}'`);
      if (data.confirmationStatus !== undefined) updates.push(`confirmation_status = '${data.confirmationStatus}'`);
      
      if (updates.length === 0) return this.findById(id);

      const rows = await query<EventRow[]>`
        UPDATE calendar_events SET ${sql.unsafe(updates.join(", "))}, updated_at = NOW() WHERE id = ${id} RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async delete(id: string): Promise<boolean> {
      const result = await query`DELETE FROM calendar_events WHERE id = ${id}`;
      return result.count > 0;
    },
  };
}
