/**
 * KidSchedule – PostgreSQL Schedule Change Request Repository
 */

import type { ScheduleChangeRequestRepository } from "../repositories";
import type { DbScheduleChangeRequest } from "../types";
import { sql, type SqlClient } from "./client";

type RequestRow = {
  id: string;
  familyId: string;
  requestedBy: string;
  title: string;
  description: string | null;
  givingUpPeriodStart: Date;
  givingUpPeriodEnd: Date;
  requestedMakeUpStart: Date;
  requestedMakeUpEnd: Date;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
  responseNote: string | null;
};

function rowToDb(row: RequestRow): DbScheduleChangeRequest {
  return {
    id: row.id,
    familyId: row.familyId,
    requestedBy: row.requestedBy,
    title: row.title,
    description: row.description ?? undefined,
    givingUpPeriodStart: row.givingUpPeriodStart.toISOString(),
    givingUpPeriodEnd: row.givingUpPeriodEnd.toISOString(),
    requestedMakeUpStart: row.requestedMakeUpStart.toISOString(),
    requestedMakeUpEnd: row.requestedMakeUpEnd.toISOString(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString(),
    responseNote: row.responseNote ?? undefined,
  };
}

export function createScheduleChangeRequestRepository(tx?: SqlClient): ScheduleChangeRequestRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbScheduleChangeRequest | null> {
      const rows = await query<RequestRow[]>`SELECT * FROM schedule_change_requests WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbScheduleChangeRequest[]> {
      const rows = await query<RequestRow[]>`
        SELECT * FROM schedule_change_requests WHERE family_id = ${familyId} ORDER BY created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async findPendingByFamilyId(familyId: string): Promise<DbScheduleChangeRequest[]> {
      const rows = await query<RequestRow[]>`
        SELECT * FROM schedule_change_requests 
        WHERE family_id = ${familyId} AND status = 'pending'
        ORDER BY created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async create(request: Omit<DbScheduleChangeRequest, "id" | "createdAt">): Promise<DbScheduleChangeRequest> {
      const rows = await query<RequestRow[]>`
        INSERT INTO schedule_change_requests (
          family_id, requested_by, title, description,
          giving_up_period_start, giving_up_period_end,
          requested_make_up_start, requested_make_up_end, status
        ) VALUES (
          ${request.familyId}, ${request.requestedBy}, ${request.title}, ${request.description ?? null},
          ${new Date(request.givingUpPeriodStart)}, ${new Date(request.givingUpPeriodEnd)},
          ${new Date(request.requestedMakeUpStart)}, ${new Date(request.requestedMakeUpEnd)}, ${request.status}
        )
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(id: string, data: Partial<DbScheduleChangeRequest>): Promise<DbScheduleChangeRequest | null> {
      const updates: string[] = [];
      if (data.status !== undefined) updates.push(`status = '${data.status}'`);
      if (data.responseNote !== undefined) updates.push(`response_note = ${data.responseNote ? `'${data.responseNote}'` : "NULL"}`);
      if (data.status && data.status !== "pending") updates.push(`responded_at = NOW()`);
      
      if (updates.length === 0) return this.findById(id);

      const rows = await query<RequestRow[]>`
        UPDATE schedule_change_requests SET ${sql.unsafe(updates.join(", "))} WHERE id = ${id} RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },
  };
}
