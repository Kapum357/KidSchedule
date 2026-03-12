/**
 * SMS Relay Participants Repository
 *
 * Manages parent enrollment in SMS relay for families.
 * Supports enrollment, deactivation, and lookup by various criteria.
 */

import type { SmsRelayParticipantRepository } from "../repositories";
import type { DbSmsRelayParticipant } from "../types";
import { sql, type SqlClient } from "./client";

type SmsRelayParticipantRow = {
  id: string;
  family_id: string;
  parent_id: string;
  phone: string;
  proxy_number: string;
  is_active: boolean;
  enrolled_at: Date;
};

function rowToDb(row: SmsRelayParticipantRow): DbSmsRelayParticipant {
  return {
    id: row.id,
    familyId: row.family_id,
    parentId: row.parent_id,
    phone: row.phone,
    proxyNumber: row.proxy_number,
    isActive: row.is_active,
    enrolledAt: row.enrolled_at.toISOString(),
  };
}

export function createSmsRelayParticipantRepository(tx?: SqlClient): SmsRelayParticipantRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const query = (tx ?? sql) as typeof sql;

  return {
    /**
     * Find a participant by parent ID
     */
    async findByParentId(parentId: string): Promise<DbSmsRelayParticipant | null> {
      const rows = await query<SmsRelayParticipantRow[]>`
        SELECT * FROM sms_relay_participants WHERE parent_id = ${parentId} LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    /**
     * Find all active participants in a family
     */
    async findByFamilyId(familyId: string): Promise<DbSmsRelayParticipant[]> {
      const rows = await query<SmsRelayParticipantRow[]>`
        SELECT * FROM sms_relay_participants
        WHERE family_id = ${familyId} AND is_active = true
        ORDER BY enrolled_at ASC
      `;
      return rows.map(rowToDb);
    },

    /**
     * Find a participant by proxy number (used in incoming SMS webhook)
     */
    async findByProxyNumber(proxyNumber: string): Promise<DbSmsRelayParticipant | null> {
      const rows = await query<SmsRelayParticipantRow[]>`
        SELECT * FROM sms_relay_participants
        WHERE proxy_number = ${proxyNumber} AND is_active = true
        LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    /**
     * Find a participant by phone number and family (used in incoming SMS webhook to identify sender)
     */
    async findByPhoneAndFamily(phone: string, familyId: string): Promise<DbSmsRelayParticipant | null> {
      const rows = await query<SmsRelayParticipantRow[]>`
        SELECT * FROM sms_relay_participants
        WHERE phone = ${phone} AND family_id = ${familyId} AND is_active = true
        LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    /**
     * Create a new SMS relay participant enrollment
     */
    async create(data: {
      familyId: string;
      parentId: string;
      phone: string;
      proxyNumber: string;
    }): Promise<DbSmsRelayParticipant> {
      const rows = await query<SmsRelayParticipantRow[]>`
        INSERT INTO sms_relay_participants (family_id, parent_id, phone, proxy_number, is_active, enrolled_at)
        VALUES (${data.familyId}, ${data.parentId}, ${data.phone}, ${data.proxyNumber}, true, NOW())
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    /**
     * Deactivate SMS relay for a parent
     */
    async deactivate(parentId: string): Promise<void> {
      await query`UPDATE sms_relay_participants SET is_active = false WHERE parent_id = ${parentId}`;
    },
  };
}
