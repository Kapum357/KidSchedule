/**
 * KidSchedule – PostgreSQL School Domain Repository
 */

import type {
  SchoolContactRepository,
  SchoolEventRepository,
  SchoolVaultDocumentRepository,
  CreateVaultDocumentInput,
} from "../repositories";
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

// ─── Allowed file types for vault documents
const ALLOWED_FILE_TYPES = new Set<string>([
  "pdf",
  "docx",
  "xlsx",
  "jpg",
  "png",
]);

function validateFileType(fileType: string): boolean {
  return ALLOWED_FILE_TYPES.has(fileType.toLowerCase());
}

// Custom error class for HTTP status codes
class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "available":
      return "Available";
    case "pending_signature":
      return "Awaiting Signature";
    case "signed":
      return "Signed";
    case "expired":
      return "Expired";
    default:
      return "Unknown";
  }
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
      // 1. Validate file type
      if (!validateFileType(input.fileType)) {
        throw new HttpError(
          `Invalid file type: ${input.fileType}. Allowed types: ${Array.from(ALLOWED_FILE_TYPES).join(", ")}`,
          400
        );
      }

      // 2. Check quota limit - get plan tier for family's subscription
      type QuotaRow = { maxDocuments: number | null; documentCount: number };
      const quotaRows = await q<QuotaRow[]>`
        SELECT
          COALESCE(pt.max_documents, 0) as "maxDocuments",
          COUNT(DISTINCT svd.id)::int as "documentCount"
        FROM families f
        LEFT JOIN stripe_customers sc ON f.id = (
          SELECT family_id FROM family_members fm
          WHERE fm.user_id = sc.user_id LIMIT 1
        )
        LEFT JOIN subscriptions s ON sc.id = s.stripe_customer_id
          AND s.status IN ('active', 'trialing')
        LEFT JOIN plan_tiers pt ON s.plan_tier = pt.id
        LEFT JOIN school_vault_documents svd ON f.id = svd.family_id
          AND svd.is_deleted = false
        WHERE f.id = ${input.familyId}
        GROUP BY f.id, pt.max_documents
      `;

      const quotaRow = quotaRows[0];
      if (!quotaRow) {
        // Family not found or no subscription - use conservative limit
        throw new HttpError(
          "Family not found or quota information unavailable",
          404
        );
      }

      const { maxDocuments, documentCount } = quotaRow;

      // Check if quota is enforced (maxDocuments is not null and > 0) and limit reached
      if (maxDocuments != null && maxDocuments > 0 && documentCount >= maxDocuments) {
        throw new HttpError(
          `Document quota exceeded: ${documentCount}/${maxDocuments} documents`,
          429
        );
      }

      // 3. Insert document with default status 'available'
      const status = "available";
      const statusLabel = getStatusLabel(status);

      const rows = await q<VaultDocumentRow[]>`
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

      return vaultDocRowToDb(rows[0]);
    },
  };
}
