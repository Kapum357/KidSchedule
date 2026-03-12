/**
 * KidSchedule – PostgreSQL Holiday Repository
 */

import type { HolidayRepository, HolidayExceptionRuleRepository } from "../repositories";
import type { DbHolidayDefinition, DbHolidayExceptionRule } from "../types";
import { sql, type SqlClient } from "./client";

type HolidayRow = {
  id: string;
  name: string;
  date: Date;
  type: string;
  jurisdiction: string;
  description: string | null;
  family_id: string | null;
  created_at: Date;
};

function rowToDb(row: HolidayRow): DbHolidayDefinition {
  return {
    id: row.id,
    name: row.name,
    date: row.date.toISOString().split('T')[0], // YYYY-MM-DD format
    type: row.type as DbHolidayDefinition["type"],
    jurisdiction: row.jurisdiction,
    description: row.description ?? undefined,
    familyId: row.family_id ?? undefined,
    createdAt: row.created_at.toISOString(),
  };
}

export function createHolidayRepository(tx?: SqlClient): HolidayRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findById(id: string): Promise<DbHolidayDefinition | null> {
      const rows = await q<HolidayRow[]>`SELECT * FROM holiday_definitions WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByJurisdiction(jurisdiction: string): Promise<DbHolidayDefinition[]> {
      const rows = await q<HolidayRow[]>`SELECT * FROM holiday_definitions WHERE jurisdiction = ${jurisdiction} ORDER BY date`;
      return rows.map(rowToDb);
    },

    async findByDateRange(jurisdiction: string, startDate: string, endDate: string): Promise<DbHolidayDefinition[]> {
      const rows = await q<HolidayRow[]>`
        SELECT * FROM holiday_definitions
        WHERE jurisdiction = ${jurisdiction}
          AND date >= ${startDate}
          AND date < ${endDate}
        ORDER BY date
      `;
      return rows.map(rowToDb);
    },

    async findByFamily(familyId: string): Promise<DbHolidayDefinition[]> {
      const rows = await q<HolidayRow[]>`
        SELECT * FROM holiday_definitions
        WHERE family_id = ${familyId}
        ORDER BY date
      `;
      return rows.map(rowToDb);
    },

    async create(holiday: Omit<DbHolidayDefinition, "id" | "createdAt">): Promise<DbHolidayDefinition> {
      const rows = await q<HolidayRow[]>`
        INSERT INTO holiday_definitions (name, date, type, jurisdiction, description, family_id)
        VALUES (${holiday.name}, ${holiday.date}, ${holiday.type}, ${holiday.jurisdiction}, ${holiday.description ?? null}, ${holiday.familyId ?? null})
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },
  };
}

// ─── Holiday Exception Rule impl ──────────────────────────────────────────────

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

function ruleRowToDb(row: RuleRow): DbHolidayExceptionRule {
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
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findByFamilyId(familyId: string): Promise<DbHolidayExceptionRule[]> {
      const rows = await q<RuleRow[]>`SELECT * FROM holiday_exception_rules WHERE family_id = ${familyId}`;
      return rows.map(ruleRowToDb);
    },

    async findByFamilyAndHoliday(familyId: string, holidayId: string): Promise<DbHolidayExceptionRule | null> {
      const rows = await q<RuleRow[]>`
        SELECT * FROM holiday_exception_rules
        WHERE family_id = ${familyId} AND holiday_id = ${holidayId}
      `;
      return rows[0] ? ruleRowToDb(rows[0]) : null;
    },

    async findPendingByFamilyId(familyId: string): Promise<DbHolidayExceptionRule[]> {
      const rows = await q<RuleRow[]>`
        SELECT * FROM holiday_exception_rules
        WHERE family_id = ${familyId} AND approval_status = 'pending'
        ORDER BY proposed_at ASC
      `;
      return rows.map(ruleRowToDb);
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

      const rows = await q<RuleRow[]>`
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
      return ruleRowToDb(rows[0]);
    },

    async confirm(
      familyId: string,
      holidayId: string,
      confirmedBy: string,
      approved: boolean,
    ): Promise<DbHolidayExceptionRule | null> {
      const newStatus = approved ? "approved" : "rejected";
      const rows = await q<RuleRow[]>`
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
      return rows[0] ? ruleRowToDb(rows[0]) : null;
    },

    async delete(familyId: string, holidayId: string): Promise<boolean> {
      const result = await q`DELETE FROM holiday_exception_rules WHERE family_id = ${familyId} AND holiday_id = ${holidayId}`;
      return result.count > 0;
    },
  };
}