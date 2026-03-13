/**
 * SMS Subscriptions Repository
 *
 * Manages SMS subscription status for phone numbers in families.
 * Handles opt-out status tracking for STOP message compliance.
 */

import type { SmsSubscriptionRepository } from "../repositories";
import type { DbSmsSubscription } from "../types";
import { sql, type SqlClient } from "./client";

type SmsSubscriptionRow = {
  id: string;
  family_id: string;
  phone_number: string;
  opted_out: boolean;
  opted_out_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function rowToDb(row: SmsSubscriptionRow): DbSmsSubscription {
  return {
    id: row.id,
    familyId: row.family_id,
    phoneNumber: row.phone_number,
    optedOut: row.opted_out,
    optedOutAt: row.opted_out_at?.toISOString() || null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createSmsSubscriptionRepository(tx?: SqlClient): SmsSubscriptionRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  const query = (tx ?? sql) as typeof sql;

  return {
    /**
     * Find SMS subscription by phone number
     */
    async findByPhoneNumber(phoneNumber: string): Promise<DbSmsSubscription | null> {
      const rows = await query<SmsSubscriptionRow[]>`
        SELECT * FROM sms_subscriptions WHERE phone_number = ${phoneNumber} LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    /**
     * Find SMS subscription by family ID and phone number
     */
    async findByFamilyAndPhone(familyId: string, phoneNumber: string): Promise<DbSmsSubscription | null> {
      const rows = await query<SmsSubscriptionRow[]>`
        SELECT * FROM sms_subscriptions
        WHERE family_id = ${familyId} AND phone_number = ${phoneNumber}
        LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    /**
     * Find SMS subscription by ID
     */
    async findById(id: string): Promise<DbSmsSubscription | null> {
      const rows = await query<SmsSubscriptionRow[]>`
        SELECT * FROM sms_subscriptions WHERE id = ${id} LIMIT 1
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    /**
     * Create a new SMS subscription
     */
    async create(data: {
      familyId: string;
      phoneNumber: string;
    }): Promise<DbSmsSubscription> {
      const rows = await query<SmsSubscriptionRow[]>`
        INSERT INTO sms_subscriptions (family_id, phone_number, opted_out)
        VALUES (${data.familyId}, ${data.phoneNumber}, false)
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    /**
     * Update SMS subscription opted-out status
     */
    async update(
      id: string,
      data: {
        optedOut?: boolean;
        optedOutAt?: string | null;
      }
    ): Promise<DbSmsSubscription | null> {
      // Build update clause dynamically
      const updateClauses: string[] = [];
      const values: unknown[] = [];

      if (data.optedOut !== undefined) {
        updateClauses.push(`opted_out = $${values.length + 1}`);
        values.push(data.optedOut);
      }

      if (data.optedOutAt !== undefined) {
        updateClauses.push(`opted_out_at = $${values.length + 1}`);
        values.push(data.optedOutAt ? new Date(data.optedOutAt) : null);
      }

      if (updateClauses.length === 0) {
        // No updates - return current record
        return this.findById(id);
      }

      updateClauses.push("updated_at = NOW()");

      const updateSql = `
        UPDATE sms_subscriptions
        SET ${updateClauses.join(", ")}
        WHERE id = $${values.length + 1}
        RETURNING *
      `;

      values.push(id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (query as any)<SmsSubscriptionRow[]>`${updateSql}`;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    /**
     * Find all opted-out subscriptions (for compliance/logging)
     */
    async findOptedOut(limit = 100): Promise<DbSmsSubscription[]> {
      const rows = await query<SmsSubscriptionRow[]>`
        SELECT * FROM sms_subscriptions
        WHERE opted_out = true
        ORDER BY opted_out_at DESC
        LIMIT ${limit}
      `;
      return rows.map(rowToDb);
    },
  };
}
