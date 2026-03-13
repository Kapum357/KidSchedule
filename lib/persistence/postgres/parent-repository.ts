/**
 * KidSchedule – PostgreSQL Parent Repository
 */

import type { ParentRepository, ParentUpdateInput } from "../repositories";
import type { DbParent } from "../types";
import { sql, type SqlClient } from "./client";

type ParentRow = {
  id: string;
  userId: string;
  familyId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: "primary" | "secondary";
  createdAt: Date;
};

function rowToDb(row: ParentRow): DbParent {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createParentRepository(tx?: SqlClient): ParentRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const query = (tx ?? sql) as typeof sql;

  return {
    async findById(id: string): Promise<DbParent | null> {
      const rows = await query<ParentRow[]>`SELECT * FROM parents WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByUserId(userId: string): Promise<DbParent | null> {
      const rows = await query<ParentRow[]>`SELECT * FROM parents WHERE user_id = ${userId} LIMIT 1`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbParent[]> {
      const rows = await query<ParentRow[]>`SELECT * FROM parents WHERE family_id = ${familyId}`;
      return rows.map(rowToDb);
    },

    async create(parent: Omit<DbParent, "id" | "createdAt">): Promise<DbParent> {
      const rows = await query<ParentRow[]>`
        INSERT INTO parents (user_id, family_id, name, email, phone, avatar_url, role)
        VALUES (${parent.userId}, ${parent.familyId}, ${parent.name}, ${parent.email}, ${parent.phone ?? null}, ${parent.avatarUrl ?? null}, ${parent.role})
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(id: string, data: ParentUpdateInput): Promise<DbParent | null> {
      const updates: string[] = [];
      const values: (string | null)[] = [];

      if (data.name !== undefined) {
        updates.push(`name = $${values.length + 1}`);
        values.push(data.name);
      }

      if (data.email !== undefined) {
        updates.push(`email = $${values.length + 1}`);
        values.push(data.email.toLowerCase().trim());
      }

      if (data.phone !== undefined) {
        updates.push(`phone = $${values.length + 1}`);
        values.push(data.phone && data.phone.trim().length > 0 ? data.phone : null);
      }

      if (data.avatarUrl !== undefined) {
        updates.push(`avatar_url = $${values.length + 1}`);
        values.push(data.avatarUrl && data.avatarUrl.trim().length > 0 ? data.avatarUrl : null);
      }

      if (updates.length === 0) return this.findById(id);

      const idParamIndex = values.length + 1;
      const statement = `
        UPDATE parents
        SET ${updates.join(", ")}
        WHERE id = $${idParamIndex}
        RETURNING *
      `;

      const rows = await query.unsafe<ParentRow[]>(statement, [...values, id]);
      return rows[0] ? rowToDb(rows[0]) : null;
    },
  };
}
