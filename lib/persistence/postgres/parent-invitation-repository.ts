/**
 * KidSchedule – PostgreSQL Parent Invitation Repository
 */

import type { ParentInvitationRepository } from "../repositories";
import type { DbParentInvitation } from "../types";
import { sql, type SqlClient } from "./client";

type ParentInvitationRow = {
  id: string;
  familyId: string;
  invitedByUserId: string;
  invitedName: string | null;
  email: string;
  phone: string | null;
  role: "secondary";
  status: DbParentInvitation["status"];
  token: string;
  expiresAt: Date | null;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function rowToDb(row: ParentInvitationRow): DbParentInvitation {
  return {
    id: row.id,
    familyId: row.familyId,
    invitedByUserId: row.invitedByUserId,
    invitedName: row.invitedName ?? undefined,
    email: row.email,
    phone: row.phone ?? undefined,
    role: row.role,
    status: row.status,
    token: row.token,
    expiresAt: row.expiresAt?.toISOString(),
    acceptedByUserId: row.acceptedByUserId ?? undefined,
    acceptedAt: row.acceptedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createParentInvitationRepository(tx?: SqlClient): ParentInvitationRepository {
  const query = (tx ?? sql) as typeof sql;

  return {
    async findById(id: string): Promise<DbParentInvitation | null> {
      const rows = await query<ParentInvitationRow[]>`
        SELECT * FROM parent_invitations WHERE id = ${id}
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbParentInvitation[]> {
      const rows = await query<ParentInvitationRow[]>`
        SELECT *
        FROM parent_invitations
        WHERE family_id = ${familyId}
        ORDER BY created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async findPendingByFamilyId(familyId: string): Promise<DbParentInvitation[]> {
      const rows = await query<ParentInvitationRow[]>`
        SELECT *
        FROM parent_invitations
        WHERE family_id = ${familyId}
          AND status = 'pending'
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async create(
      invitation: Omit<
        DbParentInvitation,
        "id" | "createdAt" | "updatedAt" | "acceptedAt" | "acceptedByUserId"
      >
    ): Promise<DbParentInvitation> {
      const rows = await query<ParentInvitationRow[]>`
        INSERT INTO parent_invitations (
          family_id,
          invited_by_user_id,
          invited_name,
          email,
          phone,
          role,
          status,
          token,
          expires_at
        )
        VALUES (
          ${invitation.familyId},
          ${invitation.invitedByUserId},
          ${invitation.invitedName ?? null},
          ${invitation.email.toLowerCase().trim()},
          ${invitation.phone ?? null},
          ${invitation.role},
          ${invitation.status},
          ${invitation.token},
          ${invitation.expiresAt ? new Date(invitation.expiresAt) : null}
        )
        RETURNING *
      `;

      return rowToDb(rows[0]);
    },

    async updateStatus(id: string, status: DbParentInvitation["status"]): Promise<DbParentInvitation | null> {
      const rows = await query<ParentInvitationRow[]>`
        UPDATE parent_invitations
        SET status = ${status}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return rows[0] ? rowToDb(rows[0]) : null;
    },
  };
}
