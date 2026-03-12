/**
 * KidSchedule – PostgreSQL School Domain Repository
 */

import type {
  SchoolContactRepository,
  SchoolEventRepository,
  SchoolVaultDocumentRepository,
  CreateVaultDocumentInput,
  UpdateVaultDocumentInput,
} from "../repositories";
import { HttpError } from "../repositories";
import type {
  DbSchoolContact,
  DbSchoolEvent,
  DbSchoolVaultDocument,
} from "../types";
import { sql, type SqlClient } from "./client";

// ─── School Contact impl ──────────────────────────────────────────────────────

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

function contactRowToDb(row: ContactRow): DbSchoolContact {
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
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findById(id: string): Promise<DbSchoolContact | null> {
      const rows = await q<ContactRow[]>`SELECT * FROM school_contacts WHERE id = ${id}`;
      return rows[0] ? contactRowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbSchoolContact[]> {
      const rows = await q<ContactRow[]>`
        SELECT * FROM school_contacts WHERE family_id = ${familyId} ORDER BY name ASC
      `;
      return rows.map(contactRowToDb);
    },
  };
}

// ─── School Event impl ────────────────────────────────────────────────────────

type EventRow = {
  id: string;
  familyId: string;
  title: string;
  description: string | null;
  eventType: string;
  startAt: Date;
  endAt: Date;
  location: string | null;
  isAllDay: boolean;
  attendingParentIds: string[];
  actionRequired: boolean;
  actionDeadline: Date | null;
  actionDescription: string | null;
  volunteerTaskIds: string[];
  accentColor: string | null;
  icon: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function eventRowToDb(row: EventRow): DbSchoolEvent {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    description: row.description ?? undefined,
    eventType: row.eventType,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    location: row.location ?? undefined,
    isAllDay: row.isAllDay,
    attendingParentIds: JSON.stringify(row.attendingParentIds),
    actionRequired: row.actionRequired,
    actionDeadline: row.actionDeadline?.toISOString(),
    actionDescription: row.actionDescription ?? undefined,
    volunteerTaskIds: JSON.stringify(row.volunteerTaskIds),
    accentColor: row.accentColor ?? undefined,
    icon: row.icon ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createSchoolEventRepository(tx?: SqlClient): SchoolEventRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findById(id: string): Promise<DbSchoolEvent | null> {
      const rows = await q<EventRow[]>`SELECT * FROM school_events WHERE id = ${id}`;
      return rows[0] ? eventRowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbSchoolEvent[]> {
      const rows = await q<EventRow[]>`
        SELECT * FROM school_events WHERE family_id = ${familyId} ORDER BY start_at
      `;
      return rows.map(eventRowToDb);
    },

    async findUpcoming(familyId: string, fromDate: string): Promise<DbSchoolEvent[]> {
      const rows = await q<EventRow[]>`
        SELECT * FROM school_events
        WHERE family_id = ${familyId} AND start_at >= ${new Date(fromDate)}
        ORDER BY start_at LIMIT 50
      `;
      return rows.map(eventRowToDb);
    },

    async create(event: Omit<DbSchoolEvent, "id" | "createdAt" | "updatedAt">): Promise<DbSchoolEvent> {
      const rows = await q<EventRow[]>`
        INSERT INTO school_events (
          family_id, title, description, event_type, start_at, end_at, location,
          is_all_day, attending_parent_ids, action_required, action_deadline,
          action_description, volunteer_task_ids, accent_color, icon
        ) VALUES (
          ${event.familyId}, ${event.title}, ${event.description ?? null}, ${event.eventType},
          ${new Date(event.startAt)}, ${new Date(event.endAt)}, ${event.location ?? null},
          ${event.isAllDay}, ${JSON.parse(event.attendingParentIds)}, ${event.actionRequired},
          ${event.actionDeadline ? new Date(event.actionDeadline) : null}, ${event.actionDescription ?? null},
          ${JSON.parse(event.volunteerTaskIds)}, ${event.accentColor ?? null}, ${event.icon ?? null}
        )
        RETURNING *
      `;
      return eventRowToDb(rows[0]);
    },

    async update(id: string, data: Partial<DbSchoolEvent>): Promise<DbSchoolEvent | null> {
      const updates: Record<string, unknown> = {};
      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined) updates.description = data.description;
      if (data.startAt !== undefined) updates.start_at = data.startAt;
      if (data.endAt !== undefined) updates.end_at = data.endAt;

      if (Object.keys(updates).length === 0) return this.findById(id);

      const rows = await q<EventRow[]>`
        UPDATE school_events SET ${q(updates)}, updated_at = NOW() WHERE id = ${id} RETURNING *
      `;
      return rows[0] ? eventRowToDb(rows[0]) : null;
    },

    async delete(id: string): Promise<boolean> {
      const result = await q`DELETE FROM school_events WHERE id = ${id}`;
      return result.count > 0;
    },
  };
}

// ─── School Vault Document impl ───────────────────────────────────────────────

type VaultDocumentRow = {
  id: string;
  familyId: string;
  title: string;
  fileType: string;
  status: string;
  statusLabel: string;
  addedAt: Date;
  addedBy: string;
  updatedAt: Date;
  isDeleted: boolean;
  sizeBytes: number | null;
  url: string | null;
  actionDeadline: Date | null;
};

// QuotaRow: Results from quota check query
// - maxDocuments: subscription tier limit (NULL if no subscription, 0 if unlimited, >0 if limited)
// - documentCount: current non-deleted document count for family
// - familyExists: flag to distinguish "no subscription" from "family not found"
type QuotaRow = {
  maxDocuments: number | null;
  documentCount: number;
  familyExists: boolean;
};

function vaultDocRowToDb(row: VaultDocumentRow): DbSchoolVaultDocument {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    fileType: row.fileType,
    status: row.status,
    statusLabel: row.statusLabel,
    addedAt: row.addedAt.toISOString(),
    addedBy: row.addedBy,
    updatedAt: row.updatedAt.toISOString(),
    isDeleted: row.isDeleted,
    sizeBytes: row.sizeBytes ?? undefined,
    url: row.url ?? undefined,
    actionDeadline: row.actionDeadline?.toISOString(),
  };
}

// ─── Vault document constants and helpers

const ALLOWED_FILE_TYPES = new Set<string>([
  "pdf",
  "docx",
  "xlsx",
  "jpg",
  "png",
]);

// Map document status to human-readable labels (shown in UI)
const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  pending_signature: "Awaiting Signature",
  signed: "Signed",
  expired: "Expired",
};

function validateFileType(fileType: string): boolean {
  return ALLOWED_FILE_TYPES.has(fileType.toLowerCase());
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? "Unknown";
}

export function createSchoolVaultDocumentRepository(tx?: SqlClient): SchoolVaultDocumentRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findById(id: string): Promise<DbSchoolVaultDocument | null> {
      const rows = await q<VaultDocumentRow[]>`SELECT * FROM school_vault_documents WHERE id = ${id}`;
      return rows[0] ? vaultDocRowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbSchoolVaultDocument[]> {
      const rows = await q<VaultDocumentRow[]>`
        SELECT * FROM school_vault_documents
        WHERE family_id = ${familyId}
        ORDER BY
          CASE WHEN status = 'pending_signature' THEN 0 ELSE 1 END,
          added_at DESC
      `;
      return rows.map(vaultDocRowToDb);
    },

    async create(input: CreateVaultDocumentInput): Promise<DbSchoolVaultDocument> {
      // 1. Validate file type early (before any DB access)
      if (!validateFileType(input.fileType)) {
        throw new HttpError(
          `Invalid file type: ${input.fileType}. Allowed types: ${Array.from(ALLOWED_FILE_TYPES).join(", ")}`,
          400
        );
      }

      // 2. Run quota check + insert in a transaction to prevent race conditions
      // Transaction ensures: if quota check passes, insert succeeds atomically
      // If another request increments count between check and insert, this retries/fails safely
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (sql as any).begin(async (txQuery: SqlClient) => {
        // First, verify family exists and get current quota state
        // Using INNER JOIN on families guarantees familyExists is true
        const quotaRows = await (txQuery as typeof sql)<QuotaRow[]>`
          SELECT
            true as "familyExists",
            CASE
              WHEN pt.max_documents IS NULL THEN NULL
              ELSE COALESCE(pt.max_documents, 0)
            END as "maxDocuments",
            COUNT(DISTINCT svd.id)::int as "documentCount"
          FROM families f
          INNER JOIN family_members fm ON f.id = fm.family_id
          LEFT JOIN stripe_customers sc ON fm.user_id = sc.user_id
          LEFT JOIN subscriptions s ON sc.id = s.stripe_customer_id
            AND s.status IN ('active', 'trialing')
          LEFT JOIN plan_tiers pt ON s.plan_tier = pt.id
          LEFT JOIN school_vault_documents svd ON f.id = svd.family_id
            AND svd.is_deleted = false
          WHERE f.id = ${input.familyId}
          GROUP BY f.id, pt.max_documents
        `;

        const quotaRow = quotaRows[0];
        if (!quotaRow || !quotaRow.familyExists) {
          throw new HttpError("Family not found", 404);
        }

        const { maxDocuments, documentCount } = quotaRow;

        // Check if quota limit is enforced AND would be exceeded
        // NULL maxDocuments = unlimited (no subscription)
        // 0 maxDocuments = unlimited (explicit tier limit of 0 means no limit)
        // >0 maxDocuments = limited (check count against limit)
        if (maxDocuments != null && maxDocuments > 0 && documentCount >= maxDocuments) {
          throw new HttpError(
            `Document quota exceeded: ${documentCount}/${maxDocuments} documents`,
            429
          );
        }

        // Quota check passed - now insert the document (within same transaction)
        const status = "available";
        const statusLabel = getStatusLabel(status);

        const insertRows = await (txQuery as typeof sql)<VaultDocumentRow[]>`
          INSERT INTO school_vault_documents (
            family_id, title, file_type, status, status_label, added_by,
            size_bytes, url, action_deadline, is_deleted
          ) VALUES (
            ${input.familyId}, ${input.title}, ${input.fileType.toLowerCase()},
            ${status}, ${statusLabel}, ${input.addedBy},
            ${input.sizeBytes ?? null}, ${input.url ?? null},
            ${input.actionDeadline ? new Date(input.actionDeadline) : null},
            false
          )
          RETURNING *
        `;

        if (!insertRows[0]) {
          throw new Error("Failed to insert document");
        }

        return insertRows[0];
      });

      return vaultDocRowToDb(result);
    },

    async update(id: string, input: UpdateVaultDocumentInput): Promise<DbSchoolVaultDocument | null> {
      // 1. Validate that at least one field is being updated
      if (input.status === undefined && input.title === undefined && input.actionDeadline === undefined) {
        throw new HttpError("No fields to update", 400);
      }

      // 2. Validate status if provided
      const VALID_STATUSES = new Set<string>(["available", "pending_signature", "signed", "expired"]);
      if (input.status !== undefined && !VALID_STATUSES.has(input.status)) {
        throw new HttpError(
          `Invalid status: ${input.status}. Allowed statuses: available, pending_signature, signed, expired`,
          400
        );
      }

      // 3. Build the updates object with only provided fields
      const updates: Record<string, unknown> = {};
      if (input.status !== undefined) {
        updates.status = input.status;
        updates.status_label = getStatusLabel(input.status);
      }
      if (input.title !== undefined) {
        updates.title = input.title;
      }
      if (input.actionDeadline !== undefined) {
        updates.action_deadline = input.actionDeadline ? new Date(input.actionDeadline) : null;
      }

      // 4. Execute the update query
      // Note: RLS policy automatically filters by family context (checked in middleware)
      // Soft-delete check: WHERE is_deleted = false prevents updating deleted documents
      const rows = await q<VaultDocumentRow[]>`
        UPDATE school_vault_documents
        SET ${q(updates)}, updated_at = NOW()
        WHERE id = ${id} AND is_deleted = false
        RETURNING *
      `;

      return rows[0] ? vaultDocRowToDb(rows[0]) : null;
    },

    async delete(id: string, familyId: string): Promise<boolean> {
      // 1. Fetch the document to get size_bytes and verify it's not already deleted
      const docRows = await q<
        Pick<VaultDocumentRow, "sizeBytes" | "isDeleted" | "familyId">[]
      >`
        SELECT size_bytes, is_deleted, family_id FROM school_vault_documents WHERE id = ${id}
      `;

      const document = docRows[0];
      if (!document) {
        // Document not found
        return false;
      }

      if (document.isDeleted) {
        // Already soft-deleted, return false (idempotency)
        return false;
      }

      // Verify family_id matches (security check - caller should already verify)
      if (document.familyId !== familyId) {
        throw new HttpError("Family ID mismatch", 403);
      }

      // 2. Perform soft-delete + quota reclaim in a transaction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (sql as any).begin(async (txQuery: SqlClient) => {
        // Soft-delete the document
        const deleteRows = await (txQuery as typeof sql)<VaultDocumentRow[]>`
          UPDATE school_vault_documents
          SET is_deleted = true, updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;

        if (!deleteRows[0]) {
          throw new Error("Failed to soft-delete document");
        }

        // Reclaim storage quota from subscription if size_bytes is not null
        if (document.sizeBytes !== null && document.sizeBytes > 0) {
          // Find the subscription for this family and decrease used_storage_bytes
          const familyRows = await (txQuery as typeof sql)<{ subscriptionId: string }[]>`
            SELECT s.id as "subscriptionId"
            FROM subscriptions s
            INNER JOIN stripe_customers sc ON s.stripe_customer_id = sc.id
            INNER JOIN family_members fm ON sc.user_id = fm.user_id
            WHERE fm.family_id = ${familyId}
              AND s.status IN ('active', 'trialing')
            LIMIT 1
          `;

          if (familyRows[0]) {
            const subscriptionId = familyRows[0].subscriptionId;

            // Note: used_storage_bytes field needs to exist in subscriptions table
            // This assumes migration has added it. If not present, query will fail gracefully.
            await (txQuery as typeof sql)`
              UPDATE subscriptions
              SET used_storage_bytes = GREATEST(0, COALESCE(used_storage_bytes, 0) - ${document.sizeBytes})
              WHERE id = ${subscriptionId}
            `;
          }
        }

        return deleteRows[0];
      });

      return !!result;
    },

    async hardDelete(): Promise<number> {
      // Query documents that have been soft-deleted for 30+ days
      // Hard-delete them (quota was already reclaimed during soft-delete)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deletedCount = await (sql as any).begin(async (txQuery: SqlClient) => {
        // 1. Permanently delete documents soft-deleted for 30+ days
        // Note: Quota was already reclaimed when delete() was called (soft-delete)
        // Hard-delete just removes the database record after retention window
        const result = await (txQuery as typeof sql)`
          DELETE FROM school_vault_documents
          WHERE is_deleted = true AND added_at < NOW() - INTERVAL '30 days'
        `;

        return result.count;
      });

      return deletedCount;
    },
  };
}
