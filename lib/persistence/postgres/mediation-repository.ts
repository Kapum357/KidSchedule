/**
 * KidSchedule – PostgreSQL Mediation Repository
 */

import type { MediationTopicRepository, MediationWarningRepository } from "../repositories";
import type { DbMediationTopic, DbMediationWarning } from "../types";
import { sql, type SqlClient } from "./client";

// ─── Mediation Topic Repository ───────────────────────────────────────────

type MediationTopicRow = {
  id: string;
  family_id: string;
  parent_id: string;
  title: string;
  description: string | null;
  status: "draft" | "in_progress" | "resolved";
  draft_suggestion: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mediationTopicRowToDb(row: MediationTopicRow): DbMediationTopic {
  return {
    id: row.id,
    familyId: row.family_id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    draftSuggestion: row.draft_suggestion ?? undefined,
    resolvedAt: row.resolved_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createMediationTopicRepository(tx?: SqlClient): MediationTopicRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbMediationTopic | null> {
      const rows = await query<MediationTopicRow[]>`
        SELECT * FROM mediation_topics WHERE id = ${id}
      `;
      return rows[0] ? mediationTopicRowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbMediationTopic[]> {
      const rows = await query<MediationTopicRow[]>`
        SELECT * FROM mediation_topics WHERE family_id = ${familyId} ORDER BY created_at DESC
      `;
      return rows.map(mediationTopicRowToDb);
    },

    async findByFamilyIdAndStatus(
      familyId: string,
      status: "draft" | "in_progress" | "resolved"
    ): Promise<DbMediationTopic[]> {
      const rows = await query<MediationTopicRow[]>`
        SELECT * FROM mediation_topics
        WHERE family_id = ${familyId} AND status = ${status}
        ORDER BY created_at DESC
      `;
      return rows.map(mediationTopicRowToDb);
    },

    async create(
      topic: Omit<DbMediationTopic, "id" | "createdAt" | "updatedAt">
    ): Promise<DbMediationTopic> {
      const id = crypto.randomUUID();
      const now = new Date();

      const rows = await query<MediationTopicRow[]>`
        INSERT INTO mediation_topics (
          id, family_id, parent_id, title, description, status, draft_suggestion, created_at, updated_at
        ) VALUES (
          ${id}, ${topic.familyId}, ${topic.parentId}, ${topic.title},
          ${topic.description ?? null}, ${topic.status}, ${topic.draftSuggestion ?? null},
          ${now}, ${now}
        )
        RETURNING *
      `;

      return mediationTopicRowToDb(rows[0]);
    },

    async update(
      id: string,
      data: Partial<Omit<DbMediationTopic, "id" | "familyId" | "createdAt">>
    ): Promise<DbMediationTopic | null> {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (data.title !== undefined) {
        updates.push(`title = $${updates.length + 1}`);
        values.push(data.title);
      }
      if (data.description !== undefined) {
        updates.push(`description = $${updates.length + 1}`);
        values.push(data.description || null);
      }
      if (data.status !== undefined) {
        updates.push(`status = $${updates.length + 1}`);
        values.push(data.status);
      }
      if (data.draftSuggestion !== undefined) {
        updates.push(`draft_suggestion = $${updates.length + 1}`);
        values.push(data.draftSuggestion || null);
      }
      if (data.resolvedAt !== undefined) {
        updates.push(`resolved_at = $${updates.length + 1}`);
        values.push(data.resolvedAt ? new Date(data.resolvedAt) : null);
      }

      if (updates.length === 0) {
        return this.findById(id);
      }

      updates.push(`updated_at = now()`);

      const rows = await query<MediationTopicRow[]>`
        UPDATE mediation_topics
        SET ${sql.unsafe(updates.join(", "))}
        WHERE id = ${id}
        RETURNING *
      `;

      return rows[0] ? mediationTopicRowToDb(rows[0]) : null;
    },

    async saveDraft(id: string, draftSuggestion: string): Promise<DbMediationTopic | null> {
      const rows = await query<MediationTopicRow[]>`
        UPDATE mediation_topics
        SET draft_suggestion = ${draftSuggestion}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? mediationTopicRowToDb(rows[0]) : null;
    },

    async resolve(id: string): Promise<DbMediationTopic | null> {
      const now = new Date();
      const rows = await query<MediationTopicRow[]>`
        UPDATE mediation_topics
        SET status = 'resolved', resolved_at = ${now}, updated_at = ${now}
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? mediationTopicRowToDb(rows[0]) : null;
    },

    async delete(id: string): Promise<boolean> {
      const result = await query`DELETE FROM mediation_topics WHERE id = ${id}`;
      return (result as unknown as { count: number }).count > 0;
    },
  };
}

// ─── Mediation Warning Repository ────────────────────────────────────────

type MediationWarningRow = {
  id: string;
  family_id: string;
  message_id: string;
  sender_parent_id: string;
  category: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  excerpt: string;
  flagged_at: Date;
  dismissed: boolean;
  dismissed_at: Date | null;
  dismissed_by: string | null;
  created_at: Date;
  updated_at: Date;
};

function mediationWarningRowToDb(row: MediationWarningRow): DbMediationWarning {
  return {
    id: row.id,
    familyId: row.family_id,
    messageId: row.message_id,
    senderParentId: row.sender_parent_id,
    category: row.category,
    severity: row.severity,
    title: row.title,
    description: row.description,
    excerpt: row.excerpt,
    flaggedAt: row.flagged_at.toISOString(),
    dismissed: row.dismissed,
    dismissedAt: row.dismissed_at?.toISOString(),
    dismissedBy: row.dismissed_by ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createMediationWarningRepository(tx?: SqlClient): MediationWarningRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbMediationWarning | null> {
      const rows = await query<MediationWarningRow[]>`
        SELECT * FROM mediation_warnings WHERE id = ${id}
      `;
      return rows[0] ? mediationWarningRowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbMediationWarning[]> {
      const rows = await query<MediationWarningRow[]>`
        SELECT * FROM mediation_warnings WHERE family_id = ${familyId} ORDER BY flagged_at DESC
      `;
      return rows.map(mediationWarningRowToDb);
    },

    async findByFamilyIdAndDateRange(
      familyId: string,
      startDate: string,
      endDate: string
    ): Promise<DbMediationWarning[]> {
      const rows = await query<MediationWarningRow[]>`
        SELECT * FROM mediation_warnings
        WHERE family_id = ${familyId}
        AND flagged_at >= ${new Date(startDate)}
        AND flagged_at <= ${new Date(endDate)}
        ORDER BY flagged_at DESC
      `;
      return rows.map(mediationWarningRowToDb);
    },

    async findUndismissedByFamilyId(familyId: string): Promise<DbMediationWarning[]> {
      const rows = await query<MediationWarningRow[]>`
        SELECT * FROM mediation_warnings
        WHERE family_id = ${familyId} AND dismissed = false
        ORDER BY flagged_at DESC
      `;
      return rows.map(mediationWarningRowToDb);
    },

    async create(
      warning: Omit<DbMediationWarning, "id" | "createdAt" | "updatedAt">
    ): Promise<DbMediationWarning> {
      const id = crypto.randomUUID();
      const now = new Date();

      const rows = await query<MediationWarningRow[]>`
        INSERT INTO mediation_warnings (
          id, family_id, message_id, sender_parent_id, category, severity,
          title, description, excerpt, flagged_at, dismissed, created_at, updated_at
        ) VALUES (
          ${id}, ${warning.familyId}, ${warning.messageId}, ${warning.senderParentId},
          ${warning.category}, ${warning.severity}, ${warning.title}, ${warning.description},
          ${warning.excerpt}, ${new Date(warning.flaggedAt)}, false, ${now}, ${now}
        )
        RETURNING *
      `;

      return mediationWarningRowToDb(rows[0]);
    },

    async dismiss(id: string, dismissedBy: string): Promise<DbMediationWarning | null> {
      const now = new Date();
      const rows = await query<MediationWarningRow[]>`
        UPDATE mediation_warnings
        SET dismissed = true, dismissed_at = ${now}, dismissed_by = ${dismissedBy}, updated_at = ${now}
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? mediationWarningRowToDb(rows[0]) : null;
    },

    async getStats(familyId: string): Promise<{
      total: number;
      undismissed: number;
      highSeverityCount: number;
    }> {
      const stats = await query<
        [{ total: string; undismissed: string; high_severity_count: string }]
      >`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE dismissed = false) as undismissed,
          COUNT(*) FILTER (WHERE severity = 'high') as high_severity_count
        FROM mediation_warnings
        WHERE family_id = ${familyId}
      `;

      return {
        total: Number.parseInt(stats[0].total, 10),
        undismissed: Number.parseInt(stats[0].undismissed, 10),
        highSeverityCount: Number.parseInt(stats[0].high_severity_count, 10),
      };
    },
  };
}
