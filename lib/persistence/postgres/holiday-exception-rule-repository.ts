/**
 * KidSchedule – PostgreSQL Holiday Exception Rule Repository
 */

import type { HolidayExceptionRuleRepository } from "../repositories";
import type { DbHolidayExceptionRule } from "../types";
import { sql, type SqlClient } from "./client";

type RuleRow = {
  family_id: string;
  holiday_id: string;
  custodian_parent_id: string;
  is_enabled: boolean;
  notes: string | null;
  approval_status: "pending" | "approved" | "rejected";
  proposed_by: string;
  proposed_at: Date;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  change_log: Array<{
    action: "propose" | "confirm" | "reject";
    actor: string;
    timestamp: string;
    details?: Record<string, unknown>;
  }>;
  created_at: Date;
  updated_at: Date;
};

function rowToDb(row: RuleRow): DbHolidayExceptionRule {
  return {
    id: row.holiday_id, // Use holiday_id as id since we don't have a separate id column
    familyId: row.family_id,
    holidayId: row.holiday_id,
    custodianParentId: row.custodian_parent_id,
    isEnabled: row.is_enabled,
    notes: row.notes ?? undefined,
    approvalStatus: row.approval_status,
    proposedBy: row.proposed_by,
    proposedAt: row.proposed_at.toISOString(),
    confirmedBy: row.confirmed_by ?? undefined,
    confirmedAt: row.confirmed_at?.toISOString(),
    changeLog: row.change_log,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createHolidayExceptionRuleRepository(tx?: SqlClient): HolidayExceptionRuleRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findByFamilyId(familyId: string): Promise<DbHolidayExceptionRule[]> {
      const rows = await query<RuleRow[]>`SELECT * FROM holiday_exception_rules WHERE family_id = ${familyId}`;
      return rows.map(rowToDb);
    },

    async findByFamilyAndHoliday(familyId: string, holidayId: string): Promise<DbHolidayExceptionRule | null> {
      const rows = await query<RuleRow[]>`
        SELECT * FROM holiday_exception_rules
        WHERE family_id = ${familyId} AND holiday_id = ${holidayId}
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findPendingByFamilyId(familyId: string): Promise<DbHolidayExceptionRule[]> {
      const rows = await query<RuleRow[]>`
        SELECT * FROM holiday_exception_rules
        WHERE family_id = ${familyId} AND approval_status = 'pending'
        ORDER BY proposed_at ASC
      `;
      return rows.map(rowToDb);
    },

    async propose(
      rule: Omit<DbHolidayExceptionRule, "id" | "approvalStatus" | "confirmedBy" | "confirmedAt" | "changeLog" | "createdAt" | "updatedAt" | "proposedBy" | "proposedAt">,
      proposedBy: string,
    ): Promise<DbHolidayExceptionRule> {
      const initialChangeLog = [
        {
          action: "propose" as const,
          actor: proposedBy,
          timestamp: new Date().toISOString(),
          details: {},
        },
      ];

      const rows = await query<RuleRow[]>`
        INSERT INTO holiday_exception_rules (
          family_id, holiday_id, custodian_parent_id, is_enabled, notes,
          approval_status, proposed_by, proposed_at, change_log
        ) VALUES (
          ${rule.familyId}, ${rule.holidayId}, ${rule.custodianParentId}, ${rule.isEnabled}, ${rule.notes ?? null},
          'pending', ${proposedBy}, NOW(), ${JSON.stringify(initialChangeLog)}
        )
        ON CONFLICT (family_id, holiday_id) DO UPDATE SET
          approval_status = 'pending',
          proposed_by = ${proposedBy},
          proposed_at = NOW(),
          change_log = ${JSON.stringify(initialChangeLog)},
          updated_at = NOW()
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async confirm(
      familyId: string,
      holidayId: string,
      confirmedBy: string,
      approved: boolean,
    ): Promise<DbHolidayExceptionRule | null> {
      const newStatus = approved ? "approved" : "rejected";
      const rows = await query<RuleRow[]>`
        UPDATE holiday_exception_rules
        SET
          approval_status = ${newStatus},
          confirmed_by = ${confirmedBy},
          confirmed_at = NOW(),
          change_log = change_log || ${JSON.stringify([
            {
              action: approved ? "confirm" : "reject",
              actor: confirmedBy,
              timestamp: new Date().toISOString(),
              details: {},
            },
          ])},
          updated_at = NOW()
        WHERE family_id = ${familyId} AND holiday_id = ${holidayId} AND approval_status = 'pending'
        RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async delete(familyId: string, holidayId: string): Promise<boolean> {
      const result = await query`DELETE FROM holiday_exception_rules WHERE family_id = ${familyId} AND holiday_id = ${holidayId}`;
      return result.count > 0;
    },
  };
}