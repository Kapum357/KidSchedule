/**
 * KidSchedule – PostgreSQL Lunch Menu Repository
 */

import type { LunchMenuRepository } from "../repositories";
import type { DbLunchMenu } from "../types";
import { sql, type SqlClient } from "./client";

type LunchMenuRow = {
  familyId: string;
  weekStart: Date;
  dayOfWeek: string;
  menuItem: string;
  menuType: string;
  priceCents: number;
};

function rowToDb(row: LunchMenuRow): DbLunchMenu {
  return {
    familyId: row.familyId,
    date: row.weekStart.toISOString().split("T")[0],
    mainOption: {
      name: row.menuItem,
      description: `Type: ${row.menuType}`,
    },
    alternativeOption: undefined,
    side: undefined,
    accountBalance: 0,
  };
}

export function createLunchMenuRepository(tx?: SqlClient): LunchMenuRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findByFamilyIdSince(familyId: string, fromDate: string): Promise<DbLunchMenu[]> {
      const rows = await query<LunchMenuRow[]>`
        SELECT
          family_id as "familyId",
          week_start as "weekStart",
          day_of_week as "dayOfWeek",
          menu_item as "menuItem",
          menu_type as "menuType",
          price_cents as "priceCents"
        FROM lunch_menus
        WHERE family_id = ${familyId} AND week_start >= ${fromDate}
        ORDER BY week_start ASC, day_of_week ASC
      `;
      return rows.map(rowToDb);
    },
  };
}
