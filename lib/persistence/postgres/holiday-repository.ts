/**
 * KidSchedule – PostgreSQL Holiday Repository
 */

import type { HolidayRepository } from "../repositories";
import type { DbHolidayDefinition } from "../types";
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
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbHolidayDefinition | null> {
      const rows = await query<HolidayRow[]>`SELECT * FROM holiday_definitions WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByJurisdiction(jurisdiction: string): Promise<DbHolidayDefinition[]> {
      const rows = await query<HolidayRow[]>`SELECT * FROM holiday_definitions WHERE jurisdiction = ${jurisdiction} ORDER BY date`;
      return rows.map(rowToDb);
    },

    async findByDateRange(jurisdiction: string, startDate: string, endDate: string): Promise<DbHolidayDefinition[]> {
      const rows = await query<HolidayRow[]>`
        SELECT * FROM holiday_definitions
        WHERE jurisdiction = ${jurisdiction}
          AND date >= ${startDate}
          AND date < ${endDate}
        ORDER BY date
      `;
      return rows.map(rowToDb);
    },

    async findByFamily(familyId: string): Promise<DbHolidayDefinition[]> {
      const rows = await query<HolidayRow[]>`
        SELECT * FROM holiday_definitions
        WHERE family_id = ${familyId}
        ORDER BY date
      `;
      return rows.map(rowToDb);
    },

    async create(holiday: Omit<DbHolidayDefinition, "id" | "createdAt">): Promise<DbHolidayDefinition> {
      const rows = await query<HolidayRow[]>`
        INSERT INTO holiday_definitions (name, date, type, jurisdiction, description, family_id)
        VALUES (${holiday.name}, ${holiday.date}, ${holiday.type}, ${holiday.jurisdiction}, ${holiday.description ?? null}, ${holiday.familyId ?? null})
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },
  };
}