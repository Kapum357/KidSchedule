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
  requestedMakeUpStart: Date | null;
  requestedMakeUpEnd: Date | null;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
  responseNote: string | null;
  respondedBy: string | null;     // NEW
  changeType: string;             // NEW
  expiresAt: Date | null;         // NEW
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
    requestedMakeUpStart: row.requestedMakeUpStart?.toISOString() ?? "",
    requestedMakeUpEnd: row.requestedMakeUpEnd?.toISOString() ?? "",
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString(),
    responseNote: row.responseNote ?? undefined,
    respondedBy: row.respondedBy ?? undefined,
    changeType: row.changeType,
    expiresAt: row.expiresAt?.toISOString(),
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

    async findByFamilyIdAndStatus(familyId: string, status: string): Promise<DbScheduleChangeRequest[]> {
      const rows = await query<RequestRow[]>`
        SELECT * FROM schedule_change_requests
        WHERE family_id = ${familyId} AND status = ${status}
        ORDER BY created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async findByRequestedBy(familyId: string, parentId: string): Promise<DbScheduleChangeRequest[]> {
      const rows = await query<RequestRow[]>`
        SELECT * FROM schedule_change_requests
        WHERE family_id = ${familyId} AND requested_by = ${parentId}
        ORDER BY created_at DESC
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
          requested_make_up_start, requested_make_up_end,
          status, change_type, expires_at
        ) VALUES (
          ${request.familyId}, ${request.requestedBy},
          ${request.title}, ${request.description ?? null},
          ${new Date(request.givingUpPeriodStart)},
          ${new Date(request.givingUpPeriodEnd)},
          ${new Date(request.requestedMakeUpStart)},
          ${new Date(request.requestedMakeUpEnd)},
          ${request.status},
          ${request.changeType ?? "swap"},
          ${request.expiresAt ? new Date(request.expiresAt) : null}
        )
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async approve(id: string, respondedBy: string, responseNote?: string): Promise<DbScheduleChangeRequest | null> {
      const rows = await query<RequestRow[]>`
        UPDATE schedule_change_requests
        SET status = 'accepted',
            responded_by = ${respondedBy},
            response_note = ${responseNote ?? null},
            responded_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async decline(id: string, respondedBy: string, responseNote?: string): Promise<DbScheduleChangeRequest | null> {
      const rows = await query<RequestRow[]>`
        UPDATE schedule_change_requests
        SET status = 'declined',
            responded_by = ${respondedBy},
            response_note = ${responseNote ?? null},
            responded_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async counter(id: string, respondedBy: string, responseNote: string): Promise<DbScheduleChangeRequest | null> {
      const rows = await query<RequestRow[]>`
        UPDATE schedule_change_requests
        SET status = 'countered',
            responded_by = ${respondedBy},
            response_note = ${responseNote},
            responded_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async withdraw(id: string, withdrawnBy: string): Promise<boolean> {
      const rows = await query<{ id: string }[]>`
        UPDATE schedule_change_requests
        SET status = 'withdrawn',
            responded_by = ${withdrawnBy},
            responded_at = NOW()
        WHERE id = ${id} AND status = 'pending'
        RETURNING id
      `;
      return rows.length > 0;
    },
  };
}
