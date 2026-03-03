/**
 * KidSchedule – PostgreSQL Schedule Override Repository
 */

import type { ScheduleOverrideRepository } from "../repositories";
import type { DbScheduleOverride } from "../types";
import { sql, type SqlClient } from "./client";

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

function rowToDb(row: OverrideRow): DbScheduleOverride {
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
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbScheduleOverride | null> {
      const rows = await query<OverrideRow[]>`SELECT * FROM schedule_overrides WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbScheduleOverride[]> {
      const rows = await query<OverrideRow[]>`SELECT * FROM schedule_overrides WHERE family_id = ${familyId} ORDER BY created_at DESC`;
      return rows.map(rowToDb);
    },

    async findActiveByFamilyId(familyId: string): Promise<DbScheduleOverride[]> {
      const rows = await query<OverrideRow[]>`SELECT * FROM schedule_overrides WHERE family_id = ${familyId} AND status = 'active' ORDER BY priority DESC, created_at DESC`;
      return rows.map(rowToDb);
    },

    async findByTimeRange(familyId: string, startDate: string, endDate: string): Promise<DbScheduleOverride[]> {
      const rows = await query<OverrideRow[]>`
        SELECT * FROM schedule_overrides
        WHERE family_id = ${familyId}
          AND effective_start < ${endDate}
          AND effective_end > ${startDate}
        ORDER BY priority DESC, created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async create(override: Omit<DbScheduleOverride, "id" | "createdAt">): Promise<DbScheduleOverride> {
      const rows = await query<OverrideRow[]>`
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
      return rowToDb(rows[0]);
    },

    async update(id: string, data: Partial<DbScheduleOverride>): Promise<DbScheduleOverride | null> {
      // Simple implementation - update all provided fields
      const rows = await query<OverrideRow[]>`
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
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async cancel(id: string): Promise<boolean> {
      const rows = await query<OverrideRow[]>`
        UPDATE schedule_overrides
        SET status = 'cancelled'
        WHERE id = ${id}
        RETURNING *
      `;
      return rows.length > 0;
    },
  };
}