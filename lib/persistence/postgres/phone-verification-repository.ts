/**
 * KidSchedule – PostgreSQL Phone Verification Repository
 */

import type { PhoneVerificationRepository } from "../repositories";
import type { DbPhoneVerification } from "../types";
import { sql, type SqlClient } from "./client";

type VerifyRow = {
  id: string;
  userId: string;
  phone: string;
  otpHash: string;
  requestedAt: Date;
  expiresAt: Date;
  attemptCount: number;
  verifiedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
};

function rowToDb(row: VerifyRow): DbPhoneVerification {
  return {
    id: row.id,
    userId: row.userId,
    phone: row.phone,
    otpHash: row.otpHash,
    requestedAt: row.requestedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    attemptCount: row.attemptCount,
    verifiedAt: row.verifiedAt?.toISOString(),
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
  };
}

export function createPhoneVerificationRepository(tx?: SqlClient): PhoneVerificationRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbPhoneVerification | null> {
      const rows = await query<VerifyRow[]>`SELECT * FROM phone_verifications WHERE id = ${id}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByUserId(userId: string): Promise<DbPhoneVerification | null> {
      const rows = await query<VerifyRow[]>`
        SELECT * FROM phone_verifications 
        WHERE user_id = ${userId} AND verified_at IS NULL AND expires_at > NOW()
        ORDER BY requested_at DESC LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByPhone(phone: string): Promise<DbPhoneVerification | null> {
      const rows = await query<VerifyRow[]>`
        SELECT * FROM phone_verifications 
        WHERE phone = ${phone} AND verified_at IS NULL AND expires_at > NOW()
        ORDER BY requested_at DESC LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async create(verification: Omit<DbPhoneVerification, "id">): Promise<DbPhoneVerification> {
      const rows = await query<VerifyRow[]>`
        INSERT INTO phone_verifications (user_id, phone, otp_hash, expires_at, ip, user_agent)
        VALUES (${verification.userId}, ${verification.phone}, ${verification.otpHash}, ${new Date(verification.expiresAt)}, ${verification.ip ?? null}, ${verification.userAgent ?? null})
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async incrementAttempts(id: string): Promise<DbPhoneVerification | null> {
      const rows = await query<VerifyRow[]>`
        UPDATE phone_verifications SET attempt_count = attempt_count + 1 WHERE id = ${id} RETURNING *
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async markVerified(id: string): Promise<boolean> {
      const result = await query`UPDATE phone_verifications SET verified_at = NOW() WHERE id = ${id}`;
      return result.count > 0;
    },

    async deleteExpired(): Promise<number> {
      const result = await query`DELETE FROM phone_verifications WHERE expires_at < NOW() - INTERVAL '1 day'`;
      return result.count;
    },
  };
}
