/**
 * KidSchedule – Purge Deleted Documents Job
 *
 * Scheduled job that hard-deletes documents soft-deleted 30+ days ago.
 * Implements FERPA compliance requirement for permanent deletion after retention window.
 *
 * Can be triggered:
 * - Manually via API endpoint (Phase 5)
 * - On a schedule via cron (Phase 5)
 * - On-demand from CLI or admin panel
 *
 * Process:
 * 1. Query documents where is_deleted=true AND added_at < NOW() - INTERVAL '30 days'
 * 2. For each document, delete file from /uploads/vault/{familyId}/{documentId}.{ext}
 * 3. Log each file deletion for audit trail
 * 4. Delete database records in a transaction
 * 5. Return count of hard-deleted documents and handle errors gracefully
 */

import { getDb } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import { promises as fs } from "fs";
import { extname } from "path";

export interface PurgeResult {
  success: boolean;
  deletedCount: number;
  errors: Array<{
    documentId: string;
    error: string;
  }>;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

/**
 * Purge documents soft-deleted 30+ days ago
 *
 * Returns count of hard-deleted documents and any errors encountered.
 * Errors for individual file deletions are logged but do not stop the job.
 */
export async function purgeDeletedDocuments(vaultBasePath?: string): Promise<PurgeResult> {
  const startedAt = new Date();
  const errors: Array<{ documentId: string; error: string }> = [];
  const basePath = vaultBasePath || "/uploads/vault";

  try {
    logEvent("info", "Starting purge-deleted-documents job", {
      vaultBasePath: basePath,
    });

    const db = getDb();

    // 1. Query soft-deleted documents from 30+ days ago
    // Using the hardDelete() method that was already implemented in the repository
    // But we need to handle file cleanup first, so we'll query directly

    // Get the list of documents to delete before hard-deleting them from DB
    const documentsToDelete = await queryDeletedDocuments();

    logEvent("info", "Found documents to hard-delete", {
      count: documentsToDelete.length,
    });

    // 2. Delete files from storage for each document
    for (const doc of documentsToDelete) {
      try {
        await deleteDocumentFile(basePath, doc.familyId, doc.id, doc.fileType);
        logEvent("info", "File deleted for document", {
          documentId: doc.id,
          familyId: doc.familyId,
          fileType: doc.fileType,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({
          documentId: doc.id,
          error: errorMessage,
        });
        logEvent("warn", "Failed to delete document file", {
          documentId: doc.id,
          familyId: doc.familyId,
          error: errorMessage,
        });
        // Continue with other documents even if one fails
      }
    }

    // 3. Hard-delete database records
    const deletedCount = await db.schoolVaultDocuments.hardDelete();

    logEvent("info", "Purge job completed successfully", {
      deletedCount,
      fileErrorCount: errors.length,
    });

    const completedAt = new Date();
    return {
      success: true,
      deletedCount,
      errors,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logEvent("error", "Purge job failed with error", {
      error: errorMessage,
    });

    const completedAt = new Date();
    return {
      success: false,
      deletedCount: 0,
      errors,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  }
}

/**
 * Query documents soft-deleted 30+ days ago
 *
 * These are candidates for hard deletion once the retention window has passed.
 */
async function queryDeletedDocuments(): Promise<
  Array<{
    id: string;
    familyId: string;
    fileType: string;
  }>
> {
  // Execute raw query to get documents ready for hard-delete
  // This uses the sql client directly for this specific query
  const { sql } = await import("@/lib/persistence/postgres/client");

  interface DeletedDocRow {
    id: string;
    familyId: string;
    fileType: string;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (sql as any)<DeletedDocRow[]>`
    SELECT id, family_id as "familyId", file_type as "fileType"
    FROM school_vault_documents
    WHERE is_deleted = true AND added_at < NOW() - INTERVAL '30 days'
  `;

  return rows;
}

/**
 * Delete document file from storage
 *
 * Files are stored at: /uploads/vault/{familyId}/{documentId}.{ext}
 * Silently ignores missing files (idempotent)
 */
async function deleteDocumentFile(
  basePath: string,
  familyId: string,
  documentId: string,
  fileType: string
): Promise<void> {
  const filePath = `${basePath}/${familyId}/${documentId}.${fileType}`;

  try {
    await fs.unlink(filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // Ignore ENOENT (file already deleted) - idempotent operation
    // Re-throw all other errors
    if (err.code !== "ENOENT") {
      throw new Error(
        `Failed to delete file ${filePath}: ${err.message} (code: ${err.code})`
      );
    }
  }
}

/**
 * Get job configuration
 *
 * Returns environment-based configuration for scheduling and execution.
 */
export function getJobConfig() {
  return {
    name: "purge-deleted-documents",
    description: "Hard-delete documents soft-deleted 30+ days ago (FERPA compliance)",
    enabled: process.env.PURGE_DELETED_DOCUMENTS_ENABLED !== "false",
    // Default: run daily at 2 AM UTC (can be overridden by cron service)
    cronSchedule: process.env.PURGE_DELETED_DOCUMENTS_CRON || "0 2 * * *",
    // Path to vault storage (default: /uploads/vault)
    vaultBasePath: process.env.VAULT_BASE_PATH || "/uploads/vault",
  };
}
