/**
 * KidSchedule – PostgreSQL Moments Repository
 *
 * Implements moment CRUD operations with family-scoped queries.
 * Uses postgres.js with prepared statements.
 */

import type { MomentRepository, MomentReactionRepository } from "../repositories";
import type { DbMoment, DbMomentReaction } from "../types";
import { sql, type SqlClient } from "./client";
import { v4 as uuidv4 } from "uuid";

type MomentRow = {
  id: string;
  family_id: string;
  uploaded_by: string;
  media_url: string;
  thumbnail_url: string | null;
  media_type: "photo" | "video";
  title: string;
  caption: string | null;
  child_tag: "none" | "leo" | "mia" | "both";
  visibility: "shared" | "private";
  taken_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToDb(row: MomentRow): DbMoment {
  return {
    id: row.id,
    familyId: row.family_id,
    uploadedBy: row.uploaded_by,
    mediaUrl: row.media_url,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    mediaType: row.media_type,
    title: row.title,
    caption: row.caption ?? undefined,
    childTag: row.child_tag,
    visibility: row.visibility,
    takenAt: row.taken_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createMomentRepository(tx?: SqlClient): MomentRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbMoment | null> {
      const rows = await query<MomentRow[]>`
        SELECT * FROM moments WHERE id = ${id}
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbMoment[]> {
      const rows = await query<MomentRow[]>`
        SELECT * FROM moments
        WHERE family_id = ${familyId}
        ORDER BY created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async findByFamilyIdOrderedByRecent(
      familyId: string,
      limit?: number,
      offset?: number
    ): Promise<DbMoment[]> {
      const rows = await query<MomentRow[]>`
        SELECT * FROM moments
        WHERE family_id = ${familyId}
        ORDER BY created_at DESC
        LIMIT ${limit ?? 50}
        OFFSET ${offset ?? 0}
      `;
      return rows.map(rowToDb);
    },

    async create(
      moment: Omit<DbMoment, "id" | "createdAt" | "updatedAt">
    ): Promise<DbMoment> {
      const id = uuidv4();
      const now = new Date().toISOString();

      const rows = await query<MomentRow[]>`
        INSERT INTO moments (
          id,
          family_id,
          uploaded_by,
          media_url,
          thumbnail_url,
          media_type,
          title,
          caption,
          child_tag,
          visibility,
          taken_at,
          created_at,
          updated_at
        )
        VALUES (
          ${id},
          ${moment.familyId},
          ${moment.uploadedBy},
          ${moment.mediaUrl},
          ${moment.thumbnailUrl ?? null},
          ${moment.mediaType},
          ${moment.title},
          ${moment.caption ?? null},
          ${moment.childTag},
          ${moment.visibility},
          ${moment.takenAt ?? null},
          ${now},
          ${now}
        )
        RETURNING *
      `;

      return rowToDb(rows[0]);
    },

    async update(
      id: string,
      data: Partial<DbMoment>
    ): Promise<DbMoment | null> {
      const now = new Date().toISOString();

      // Build dynamic update clause
      const updates: string[] = [];
      const values: unknown[] = [];

      if (data.caption !== undefined) {
        updates.push("caption");
        values.push(data.caption ?? null);
      }
      if (data.thumbnailUrl !== undefined) {
        updates.push("thumbnail_url");
        values.push(data.thumbnailUrl ?? null);
      }
      if (data.takenAt !== undefined) {
        updates.push("taken_at");
        values.push(data.takenAt ?? null);
      }

      updates.push("updated_at");
      values.push(now);

      if (updates.length === 1) {
        // Only updated_at changed, or nothing to update
        return this.findById(id);
      }

      // Build SET clause dynamically
      const setClause = updates
        .map((col, i) => `${col} = $${i + 1}`)
        .join(", ");

      const rows = await query<MomentRow[]>`
        UPDATE moments
        SET ${setClause}
        WHERE id = ${id}
        RETURNING *
      `;

      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async delete(id: string): Promise<boolean> {
      // Check if moment exists
      const existing = await this.findById(id);
      if (!existing) {
        return false;
      }
      await query`DELETE FROM moments WHERE id = ${id}`;
      return true;
    },
  };
}

// ─── Moment Reactions Repository ──────────────────────────────────────────────

type MomentReactionRow = {
  id: string;
  moment_id: string;
  parent_id: string;
  emoji: string;
  reacted_at: string;
};

type MomentReactionWithIsNewRow = MomentReactionRow & {
  is_new: boolean;
};

function reactionRowToDb(row: MomentReactionRow): DbMomentReaction {
  return {
    id: row.id,
    momentId: row.moment_id,
    parentId: row.parent_id,
    emoji: row.emoji,
    reactedAt: row.reacted_at,
  };
}

export function createMomentReactionRepository(tx?: SqlClient): MomentReactionRepository {
  const query: SqlClient = tx ?? sql;

  return {
    async findById(id: string): Promise<DbMomentReaction | null> {
      const rows = await query<MomentReactionRow[]>`
        SELECT * FROM moment_reactions WHERE id = ${id}
      `;
      return rows[0] ? reactionRowToDb(rows[0]) : null;
    },

    async findByMomentId(momentId: string): Promise<DbMomentReaction[]> {
      const rows = await query<MomentReactionRow[]>`
        SELECT * FROM moment_reactions
        WHERE moment_id = ${momentId}
        ORDER BY reacted_at DESC
      `;
      return rows.map(reactionRowToDb);
    },

    async findByMomentIdAndParentId(
      momentId: string,
      parentId: string
    ): Promise<DbMomentReaction | null> {
      const rows = await query<MomentReactionRow[]>`
        SELECT * FROM moment_reactions
        WHERE moment_id = ${momentId} AND parent_id = ${parentId}
      `;
      return rows[0] ? reactionRowToDb(rows[0]) : null;
    },

    async findByMomentIdsWithReactions(momentIds: string[]): Promise<Map<string, DbMomentReaction[]>> {
      if (momentIds.length === 0) return new Map();

      // Single query with LEFT JOIN to get all reactions for moments efficiently
      const rows = await query<Array<{
        moment_id: string;
        reactions: MomentReactionRow[];
      }>>`
        SELECT
          m.id as moment_id,
          COALESCE(
            json_agg(
              json_build_object(
                'id', mr.id,
                'moment_id', mr.moment_id,
                'parent_id', mr.parent_id,
                'emoji', mr.emoji,
                'reacted_at', mr.reacted_at
              ) ORDER BY mr.reacted_at DESC
            ) FILTER (WHERE mr.id IS NOT NULL),
            '[]'::json
          ) as reactions
        FROM moments m
        LEFT JOIN moment_reactions mr ON m.id = mr.moment_id
        WHERE m.id = ANY(${momentIds})
        GROUP BY m.id
      `;

      const map = new Map<string, DbMomentReaction[]>();
      rows.forEach(row => {
        const reactions = row.reactions as unknown as MomentReactionRow[];
        map.set(row.moment_id, reactions.map(reactionRowToDb));
      });

      return map;
    },

    async create(
      reaction: Omit<DbMomentReaction, "id">
    ): Promise<DbMomentReaction> {
      const id = uuidv4();

      const rows = await query<MomentReactionRow[]>`
        INSERT INTO moment_reactions (id, moment_id, parent_id, emoji, reacted_at)
        VALUES (
          ${id},
          ${reaction.momentId},
          ${reaction.parentId},
          ${reaction.emoji},
          ${reaction.reactedAt}
        )
        RETURNING *
      `;

      return reactionRowToDb(rows[0]);
    },

    async addReaction(momentId: string, parentId: string, emoji: string): Promise<{ id: string; isNew: boolean }> {
      const now = new Date().toISOString();

      // Use INSERT ON CONFLICT for atomic upsert (prevents race conditions)
      // Note: constraint is on (moment_id, parent_id) - one emoji per parent per moment
      const rows = await query<MomentReactionWithIsNewRow[]>`
        INSERT INTO moment_reactions (id, moment_id, parent_id, emoji, reacted_at)
        VALUES (
          ${uuidv4()},
          ${momentId},
          ${parentId},
          ${emoji},
          ${now}
        )
        ON CONFLICT (moment_id, parent_id) DO UPDATE
        SET emoji = EXCLUDED.emoji, reacted_at = EXCLUDED.reacted_at
        RETURNING id, (xmax = 0) as is_new
      `;

      if (rows.length === 0) throw new Error('Failed to add reaction');

      return {
        id: rows[0].id,
        isNew: rows[0].is_new,
      };
    },

    async delete(id: string): Promise<boolean> {
      const existing = await this.findById(id);
      if (!existing) {
        return false;
      }
      await query`DELETE FROM moment_reactions WHERE id = ${id}`;
      return true;
    },

    async deleteByMomentIdAndParentId(
      momentId: string,
      parentId: string
    ): Promise<boolean> {
      const result = await query<{ id: string }[]>`
        DELETE FROM moment_reactions
        WHERE moment_id = ${momentId} AND parent_id = ${parentId}
        RETURNING id
      `;
      return result.length > 0;
    },
  };
}
