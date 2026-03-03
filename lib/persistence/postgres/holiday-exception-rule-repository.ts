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
  created_at: Date;
  updated_at: Date;
};

function rowToDb(row: RuleRow): DbHolidayExceptionRule {
  return {
    familyId: row.family_id,
    holidayId: row.holiday_id,
    custodianParentId: row.custodian_parent_id,
    isEnabled: row.is_enabled,
    notes: row.notes ?? undefined,
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

    async upsert(rule: Omit<DbHolidayExceptionRule, "createdAt" | "updatedAt">): Promise<DbHolidayExceptionRule> {
      const rows = await query<RuleRow[]>`
        INSERT INTO holiday_exception_rules (
          family_id, holiday_id, custodian_parent_id, is_enabled, notes
        ) VALUES (
          ${rule.familyId}, ${rule.holidayId}, ${rule.custodianParentId}, ${rule.isEnabled}, ${rule.notes ?? null}
        )
        ON CONFLICT (family_id, holiday_id) DO UPDATE SET
          custodian_parent_id = EXCLUDED.custodian_parent_id,
          is_enabled = EXCLUDED.is_enabled,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async delete(familyId: string, holidayId: string): Promise<boolean> {
      const result = await query`DELETE FROM holiday_exception_rules WHERE family_id = ${familyId} AND holiday_id = ${holidayId}`;
      return result.count > 0;
    },
  };
}