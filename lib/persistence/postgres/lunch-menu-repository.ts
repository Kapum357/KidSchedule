/**
 * KidSchedule – PostgreSQL Lunch Menu Repository
 */

import type { LunchMenuRepository } from "../repositories";
import type { DbLunchMenu } from "../types";
import { sql, type SqlClient } from "./client";

type LunchMenuRow = {
  familyId: string;
  date: Date;
  mainOption: {
    name: string;
    description?: string;
    isVegetarian?: boolean;
    isGlutenFree?: boolean;
  };
  alternativeOption: {
    name: string;
    description?: string;
    isVegetarian?: boolean;
    isGlutenFree?: boolean;
  } | null;
  side: string | null;
  accountBalance: number;
};

function rowToDb(row: LunchMenuRow): DbLunchMenu {
  return {
    familyId: row.familyId,
    date: row.date.toISOString().split("T")[0],
    mainOption: row.mainOption,
    alternativeOption: row.alternativeOption ?? undefined,
    side: row.side ?? undefined,
    accountBalance: row.accountBalance,
  };
}

export function createLunchMenuRepository(tx?: SqlClient): LunchMenuRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findByFamilyIdSince(familyId: string, fromDate: string): Promise<DbLunchMenu[]> {
      const rows = await query<LunchMenuRow[]>`
        SELECT
          family_id,
          date,
          main_option,
          alternative_option,
          side,
          account_balance
        FROM lunch_menus
        WHERE family_id = ${familyId} AND date >= ${fromDate}
        ORDER BY date ASC
      `;
      return rows.map(rowToDb);
    },
  };
}
