/**
 * KidSchedule – Change Request Message Repository (PostgreSQL)
 */

import type { ChangeRequestMessageRepository } from "../repositories";
import type { DbChangeRequestMessage } from "../types";
import { sql, type SqlClient } from "./client";

type MessageRow = {
  id: string;
  requestId: string;
  familyId: string;
  senderParentId: string;
  body: string;
  createdAt: Date;
};

function rowToDb(row: MessageRow): DbChangeRequestMessage {
  return {
    id: row.id,
    requestId: row.requestId,
    familyId: row.familyId,
    senderParentId: row.senderParentId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createChangeRequestMessageRepository(
  tx?: SqlClient
): ChangeRequestMessageRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findByRequestId(requestId: string): Promise<DbChangeRequestMessage[]> {
      const rows = await query<MessageRow[]>`
        SELECT * FROM schedule_change_request_messages
        WHERE request_id = ${requestId}
        ORDER BY created_at ASC
      `;
      return rows.map(rowToDb);
    },

    async create(
      msg: Omit<DbChangeRequestMessage, "id" | "createdAt">
    ): Promise<DbChangeRequestMessage> {
      const rows = await query<MessageRow[]>`
        INSERT INTO schedule_change_request_messages
          (request_id, family_id, sender_parent_id, body)
        VALUES
          (${msg.requestId}, ${msg.familyId}, ${msg.senderParentId}, ${msg.body})
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },
  };
}
