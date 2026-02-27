/**
 * KidSchedule – PostgreSQL User Repository
 *
 * Implements UserRepository interface with PostgreSQL.
 */

import type { UserRepository } from "../repositories";
import type { DbUser } from "../types";
import { sql, type SqlClient } from "./client";

// ─── Type Helpers ─────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  phoneVerified: boolean;
  phoneVerifiedAt: Date | null;
  isDisabled: boolean;
  disabledAt: Date | null;
  disabledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
};

function rowToDbUser(row: UserRow): DbUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    emailVerifiedAt: row.emailVerifiedAt?.toISOString(),
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    phone: row.phone ?? undefined,
    phoneVerified: row.phoneVerified,
    phoneVerifiedAt: row.phoneVerifiedAt?.toISOString(),
    isDisabled: row.isDisabled,
    disabledAt: row.disabledAt?.toISOString(),
    disabledReason: row.disabledReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString(),
    lastLoginIp: row.lastLoginIp ?? undefined,
  };
}

// ─── Repository Implementation ────────────────────────────────────────────────

export function createUserRepository(tx?: SqlClient): UserRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbUser | null> {
      const rows = await query<UserRow[]>`
        SELECT * FROM users WHERE id = ${id}
      `;
      return rows[0] ? rowToDbUser(rows[0]) : null;
    },

    async findByEmail(email: string): Promise<DbUser | null> {
      const rows = await query<UserRow[]>`
        SELECT * FROM users WHERE email = ${email.toLowerCase().trim()}
      `;
      return rows[0] ? rowToDbUser(rows[0]) : null;
    },

    async create(
      user: Omit<DbUser, "id" | "createdAt" | "updatedAt">
    ): Promise<DbUser> {
      const rows = await query<UserRow[]>`
        INSERT INTO users (
          email, email_verified, password_hash, full_name, phone, phone_verified, is_disabled
        ) VALUES (
          ${user.email.toLowerCase().trim()},
          ${user.emailVerified},
          ${user.passwordHash},
          ${user.fullName},
          ${user.phone ?? null},
          ${user.phoneVerified},
          ${user.isDisabled}
        )
        RETURNING *
      `;
      return rowToDbUser(rows[0]);
    },

    async update(id: string, data: Partial<DbUser>): Promise<DbUser | null> {
      // Build dynamic update - only include provided fields
      const updates: string[] = [];
      const values: (string | boolean | Date | null)[] = [];

      if (data.email !== undefined) {
        updates.push("email = $" + (values.length + 1));
        values.push(data.email.toLowerCase().trim());
      }
      if (data.emailVerified !== undefined) {
        updates.push("email_verified = $" + (values.length + 1));
        values.push(data.emailVerified);
      }
      if (data.fullName !== undefined) {
        updates.push("full_name = $" + (values.length + 1));
        values.push(data.fullName);
      }
      if (data.phone !== undefined) {
        updates.push("phone = $" + (values.length + 1));
        values.push(data.phone ?? null);
      }
      if (data.lastLoginAt !== undefined) {
        updates.push("last_login_at = $" + (values.length + 1));
        values.push(data.lastLoginAt ? new Date(data.lastLoginAt) : null);
      }
      if (data.lastLoginIp !== undefined) {
        updates.push("last_login_ip = $" + (values.length + 1));
        values.push(data.lastLoginIp ?? null);
      }

      if (updates.length === 0) {
        return this.findById(id);
      }

      const idParamIndex = values.length + 1;
      const statement = `
        UPDATE users
        SET ${updates.join(", ")}, updated_at = NOW()
        WHERE id = $${idParamIndex}
        RETURNING *
      `;

      const parameters = [...values, id] as (string | boolean | Date | null)[];
      const rows = await query.unsafe<UserRow[]>(statement, parameters);
      return rows[0] ? rowToDbUser(rows[0]) : null;
    },

    async updatePassword(id: string, passwordHash: string): Promise<boolean> {
      const result = await query`
        UPDATE users 
        SET password_hash = ${passwordHash}, updated_at = NOW()
        WHERE id = ${id}
      `;
      return result.count > 0;
    },

    async markEmailVerified(id: string): Promise<boolean> {
      const result = await query`
        UPDATE users 
        SET email_verified = TRUE, email_verified_at = NOW(), updated_at = NOW()
        WHERE id = ${id}
      `;
      return result.count > 0;
    },

    async markPhoneVerified(id: string, phone: string): Promise<boolean> {
      const result = await query`
        UPDATE users 
        SET phone = ${phone}, phone_verified = TRUE, phone_verified_at = NOW(), updated_at = NOW()
        WHERE id = ${id}
      `;
      return result.count > 0;
    },

    async disable(id: string, reason?: string): Promise<boolean> {
      const result = await query`
        UPDATE users 
        SET is_disabled = TRUE, disabled_at = NOW(), disabled_reason = ${reason ?? null}, updated_at = NOW()
        WHERE id = ${id}
      `;
      return result.count > 0;
    },
  };
}
