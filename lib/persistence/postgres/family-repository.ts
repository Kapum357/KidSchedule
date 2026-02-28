/**
 * KidSchedule – PostgreSQL Family Repository
 */

import type { FamilyRepository } from "../repositories";
import type { DbFamily } from "../types";
import { sql, type SqlClient } from "./client";
import { getProxyNumberForFamily } from "@/lib/providers/sms/proxy-number";

type FamilyRow = {
  id: string;
  name: string;
  custodyAnchorDate: Date;
  scheduleId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function rowToDb(row: FamilyRow): DbFamily {
  return {
    id: row.id,
    name: row.name,
    custodyAnchorDate: row.custodyAnchorDate.toISOString().slice(0, 10),
    scheduleId: row.scheduleId ?? "",
    proxyPhoneNumber: getProxyNumberForFamily(row.id) ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createFamilyRepository(tx?: SqlClient): FamilyRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbFamily | null> {
      const rows = await query<FamilyRow[]>`SELECT * FROM families WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByParentUserId(userId: string): Promise<DbFamily | null> {
      const rows = await query<FamilyRow[]>`
        SELECT f.* FROM families f
        JOIN family_members fm ON f.id = fm.family_id
        WHERE fm.user_id = ${userId}
        LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async create(family: Omit<DbFamily, "id" | "createdAt" | "updatedAt">): Promise<DbFamily> {
      const rows = await query<FamilyRow[]>`
        INSERT INTO families (name, custody_anchor_date, schedule_id)
        VALUES (${family.name}, ${new Date(family.custodyAnchorDate)}, ${family.scheduleId || null})
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(id: string, data: Partial<DbFamily>): Promise<DbFamily | null> {
      const updates: string[] = [];
      if (data.name !== undefined) updates.push(`name = '${data.name}'`);
      if (data.custodyAnchorDate !== undefined) updates.push(`custody_anchor_date = '${data.custodyAnchorDate}'`);
      if (data.scheduleId !== undefined) updates.push(`schedule_id = '${data.scheduleId}'`);
      
      if (updates.length === 0) return this.findById(id);

      const rows = await query<FamilyRow[]>`
        UPDATE families SET ${sql.unsafe(updates.join(", "))} WHERE id = ${id} RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },
  };
}
