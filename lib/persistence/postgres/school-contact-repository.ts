/**
 * KidSchedule – PostgreSQL School Contact Repository
 */

import type { SchoolContactRepository } from "../repositories";
import type { DbSchoolContact } from "../types";
import { sql, type SqlClient } from "./client";

type ContactRow = {
  id: string;
  familyId: string;
  name: string;
  initials: string;
  role: string;
  roleLabel: string;
  email: string | null;
  phone: string | null;
  avatarColor: string;
  createdAt: Date;
};

function rowToDb(row: ContactRow): DbSchoolContact {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    initials: row.initials,
    role: row.role,
    roleLabel: row.roleLabel,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    avatarColor: row.avatarColor,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createSchoolContactRepository(tx?: SqlClient): SchoolContactRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbSchoolContact | null> {
      const rows = await query<ContactRow[]>`SELECT * FROM school_contacts WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbSchoolContact[]> {
      const rows = await query<ContactRow[]>`
        SELECT * FROM school_contacts WHERE family_id = ${familyId} ORDER BY name ASC
      `;
      return rows.map(rowToDb);
    },
  };
}
