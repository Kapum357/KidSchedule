/**
 * KidSchedule – PostgreSQL Child Repository
 */

import type { ChildRepository } from "../repositories";
import type { DbChild } from "../types";
import { sql, type SqlClient } from "./client";

type ChildRow = {
  id: string;
  familyId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  avatarUrl: string | null;
  createdAt: Date;
};

function rowToDb(row: ChildRow): DbChild {
  return {
    id: row.id,
    familyId: row.familyId,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth.toISOString().slice(0, 10),
    avatarUrl: row.avatarUrl ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createChildRepository(tx?: SqlClient): ChildRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbChild | null> {
      const rows = await query<ChildRow[]>`SELECT * FROM children WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbChild[]> {
      const rows = await query<ChildRow[]>`SELECT * FROM children WHERE family_id = ${familyId}`;
      return rows.map(rowToDb);
    },

    async create(child: Omit<DbChild, "id" | "createdAt">): Promise<DbChild> {
      const rows = await query<ChildRow[]>`
        INSERT INTO children (family_id, first_name, last_name, date_of_birth, avatar_url)
        VALUES (${child.familyId}, ${child.firstName}, ${child.lastName}, ${new Date(child.dateOfBirth)}, ${child.avatarUrl ?? null})
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(id: string, data: Partial<DbChild>): Promise<DbChild | null> {
      const updates: string[] = [];
      if (data.firstName !== undefined) updates.push(`first_name = '${data.firstName}'`);
      if (data.lastName !== undefined) updates.push(`last_name = '${data.lastName}'`);
      if (data.dateOfBirth !== undefined) updates.push(`date_of_birth = '${data.dateOfBirth}'`);
      if (data.avatarUrl !== undefined) updates.push(`avatar_url = ${data.avatarUrl ? `'${data.avatarUrl}'` : "NULL"}`);
      
      if (updates.length === 0) return this.findById(id);

      const rows = await query<ChildRow[]>`
        UPDATE children SET ${sql.unsafe(updates.join(", "))} WHERE id = ${id} RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async delete(id: string): Promise<boolean> {
      const result = await query`DELETE FROM children WHERE id = ${id}`;
      return result.count > 0;
    },
  };
}
