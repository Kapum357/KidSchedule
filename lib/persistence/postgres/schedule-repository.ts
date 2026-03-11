/**
 * KidSchedule – PostgreSQL Schedule Domain Repository
 */

import type {
  ScheduleChangeRequestRepository,
  ChangeRequestMessageRepository,
  ScheduleOverrideRepository,
} from "../repositories";
import type {
  DbScheduleChangeRequest,
  DbChangeRequestMessage,
  DbScheduleOverride,
} from "../types";
import { sql, type SqlClient } from "./client";

// ─── Schedule Change Request impl ─────────────────────────────────────────────

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
  respondedBy: string | null;
  changeType: string;
  expiresAt: Date | null;
};

function requestRowToDb(row: RequestRow): DbScheduleChangeRequest {
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
  const q: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbScheduleChangeRequest | null> {
      const rows = await q<RequestRow[]>`SELECT * FROM schedule_change_requests WHERE id = ${id}`;
      return rows[0] ? requestRowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbScheduleChangeRequest[]> {
      const rows = await q<RequestRow[]>`
        SELECT * FROM schedule_change_requests WHERE family_id = ${familyId} ORDER BY created_at DESC
      `;
      return rows.map(requestRowToDb);
    },

    async findByFamilyIdAndStatus(familyId: string, status: string): Promise<DbScheduleChangeRequest[]> {
      const rows = await q<RequestRow[]>`
        SELECT * FROM schedule_change_requests
        WHERE family_id = ${familyId} AND status = ${status}
        ORDER BY created_at DESC
      `;
      return rows.map(requestRowToDb);
    },

    async findByRequestedBy(familyId: string, parentId: string): Promise<DbScheduleChangeRequest[]> {
      const rows = await q<RequestRow[]>`
        SELECT * FROM schedule_change_requests
        WHERE family_id = ${familyId} AND requested_by = ${parentId}
        ORDER BY created_at DESC
      `;
      return rows.map(requestRowToDb);
    },

    async findPendingByFamilyId(familyId: string): Promise<DbScheduleChangeRequest[]> {
      const rows = await q<RequestRow[]>`
        SELECT * FROM schedule_change_requests
        WHERE family_id = ${familyId} AND status = 'pending'
        ORDER BY created_at DESC
      `;
      return rows.map(requestRowToDb);
    },

    async create(request: Omit<DbScheduleChangeRequest, "id" | "createdAt">): Promise<DbScheduleChangeRequest> {
      const rows = await q<RequestRow[]>`
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
      return requestRowToDb(rows[0]);
    },

    async approve(id: string, respondedBy: string, responseNote?: string): Promise<DbScheduleChangeRequest | null> {
      const rows = await q<RequestRow[]>`
        UPDATE schedule_change_requests
        SET status = 'accepted',
            responded_by = ${respondedBy},
            response_note = ${responseNote ?? null},
            responded_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? requestRowToDb(rows[0]) : null;
    },

    async decline(id: string, respondedBy: string, responseNote?: string): Promise<DbScheduleChangeRequest | null> {
      const rows = await q<RequestRow[]>`
        UPDATE schedule_change_requests
        SET status = 'declined',
            responded_by = ${respondedBy},
            response_note = ${responseNote ?? null},
            responded_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? requestRowToDb(rows[0]) : null;
    },

    async counter(id: string, respondedBy: string, responseNote: string): Promise<DbScheduleChangeRequest | null> {
      const rows = await q<RequestRow[]>`
        UPDATE schedule_change_requests
        SET status = 'countered',
            responded_by = ${respondedBy},
            response_note = ${responseNote},
            responded_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? requestRowToDb(rows[0]) : null;
    },

    async withdraw(id: string, withdrawnBy: string): Promise<boolean> {
      const rows = await q<{ id: string }[]>`
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

// ─── Change Request Message impl ──────────────────────────────────────────────

type MessageRow = {
  id: string;
  requestId: string;
  familyId: string;
  senderParentId: string;
  body: string;
  createdAt: Date;
};

function messageRowToDb(row: MessageRow): DbChangeRequestMessage {
  return {
    id: row.id,
    requestId: row.requestId,
    familyId: row.familyId,
    senderParentId: row.senderParentId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createChangeRequestMessageRepository(
  tx?: SqlClient
): ChangeRequestMessageRepository {
  const q: SqlClient = tx ?? sql;

  return {
    async findByRequestId(requestId: string): Promise<DbChangeRequestMessage[]> {
      const rows = await q<MessageRow[]>`
        SELECT * FROM schedule_change_request_messages
        WHERE request_id = ${requestId}
        ORDER BY created_at ASC
      `;
      return rows.map(messageRowToDb);
    },

    async create(
      msg: Omit<DbChangeRequestMessage, "id" | "createdAt">
    ): Promise<DbChangeRequestMessage> {
      const rows = await q<MessageRow[]>`
        INSERT INTO schedule_change_request_messages
          (request_id, family_id, sender_parent_id, body)
        VALUES
          (${msg.requestId}, ${msg.familyId}, ${msg.senderParentId}, ${msg.body})
        RETURNING *
      `;
      return messageRowToDb(rows[0]);
    },
  };
}

// ─── Schedule Override impl ───────────────────────────────────────────────────

type OverrideRow = {
  id: string;
  family_id: string;
  type: string;
  title: string;
  description: string | null;
  effective_start: Date;
  effective_end: Date;
  custodian_parent_id: string;
  source_event_id: string | null;
  source_request_id: string | null;
  source_mediation_id: string | null;
  priority: number;
  status: string;
  created_at: Date;
  created_by: string;
  notes: string | null;
};

function overrideRowToDb(row: OverrideRow): DbScheduleOverride {
  return {
    id: row.id,
    familyId: row.family_id,
    overrideType: row.type as DbScheduleOverride["overrideType"],
    type: row.type as DbScheduleOverride["overrideType"], // For backward compatibility
    title: row.title,
    description: row.description ?? undefined,
    effectiveStart: row.effective_start.toISOString(),
    effectiveEnd: row.effective_end.toISOString(),
    custodianParentId: row.custodian_parent_id,
    sourceEventId: row.source_event_id ?? undefined,
    sourceRequestId: row.source_request_id ?? undefined,
    sourceMediationId: row.source_mediation_id ?? undefined,
    priority: row.priority,
    status: row.status as DbScheduleOverride["status"],
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    notes: row.notes ?? undefined,
  };
}

export function createScheduleOverrideRepository(tx?: SqlClient): ScheduleOverrideRepository {
  const q: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbScheduleOverride | null> {
      const rows = await q<OverrideRow[]>`SELECT * FROM schedule_overrides WHERE id = ${id}`;
      return rows[0] ? overrideRowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbScheduleOverride[]> {
      const rows = await q<OverrideRow[]>`SELECT * FROM schedule_overrides WHERE family_id = ${familyId} ORDER BY created_at DESC`;
      return rows.map(overrideRowToDb);
    },

    async findActiveByFamilyId(familyId: string): Promise<DbScheduleOverride[]> {
      const rows = await q<OverrideRow[]>`SELECT * FROM schedule_overrides WHERE family_id = ${familyId} AND status = 'active' ORDER BY priority DESC, created_at DESC`;
      return rows.map(overrideRowToDb);
    },

    async findByTimeRange(familyId: string, startDate: string, endDate: string): Promise<DbScheduleOverride[]> {
      const rows = await q<OverrideRow[]>`
        SELECT * FROM schedule_overrides
        WHERE family_id = ${familyId}
          AND effective_start < ${endDate}
          AND effective_end > ${startDate}
        ORDER BY priority DESC, created_at DESC
      `;
      return rows.map(overrideRowToDb);
    },

    async create(override: Omit<DbScheduleOverride, "id" | "createdAt">): Promise<DbScheduleOverride> {
      const rows = await q<OverrideRow[]>`
        INSERT INTO schedule_overrides (
          family_id, type, title, description, effective_start, effective_end,
          custodian_parent_id, source_event_id, source_request_id, source_mediation_id,
          priority, status, created_by, notes
        ) VALUES (
          ${override.familyId}, ${override.overrideType}, ${override.title}, ${override.description ?? null},
          ${override.effectiveStart}, ${override.effectiveEnd}, ${override.custodianParentId},
          ${override.sourceEventId ?? null}, ${override.sourceRequestId ?? null}, ${override.sourceMediationId ?? null},
          ${override.priority}, ${override.status}, ${override.createdBy}, ${override.notes ?? null}
        )
        RETURNING *
      `;
      return overrideRowToDb(rows[0]);
    },

    async update(id: string, data: Partial<DbScheduleOverride>): Promise<DbScheduleOverride | null> {
      // Simple implementation - update all provided fields
      const rows = await q<OverrideRow[]>`
        UPDATE schedule_overrides
        SET
          type = ${data.overrideType ?? 'type'},
          title = ${data.title ?? 'title'},
          description = ${data.description ?? null},
          effective_start = ${data.effectiveStart ?? 'effective_start'},
          effective_end = ${data.effectiveEnd ?? 'effective_end'},
          custodian_parent_id = ${data.custodianParentId ?? 'custodian_parent_id'},
          priority = ${data.priority ?? 'priority'},
          status = ${data.status ?? 'status'},
          notes = ${data.notes ?? null}
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? overrideRowToDb(rows[0]) : null;
    },

    async cancel(id: string): Promise<boolean> {
      const rows = await q<OverrideRow[]>`
        UPDATE schedule_overrides
        SET status = 'cancelled'
        WHERE id = ${id}
        RETURNING *
      `;
      return rows.length > 0;
    },
  };
}
