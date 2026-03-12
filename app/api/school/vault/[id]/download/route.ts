/**
 * GET /api/school/vault/{id}/download
 *
 * File download endpoint for school vault documents.
 *
 * Verifies document belongs to user's family (RLS), serves file from disk,
 * logs download access for audit trail, and returns proper Content headers.
 *
 * For local storage: Streams file from disk with proper Content-Type and Content-Disposition
 * For production: Would generate signed URL (e.g., AWS S3) with 1-hour expiry
 *
 * Request: GET /api/school/vault/{id}/download
 *   - id: UUID of document to download
 *
 * Response (200): File binary stream
 *   - Content-Type: application/pdf, application/msword, etc. (based on file type)
 *   - Content-Disposition: attachment; filename="{title}.{ext}"
 *   - Content-Length: file size in bytes
 *
 * Response (302): Redirect to signed URL
 *   - Location: Signed URL from storage backend (AWS/Azure)
 *
 * Error responses:
 *   - 401: Unauthenticated (no valid session)
 *   - 403: Forbidden (user doesn't belong to document's family)
 *   - 404: Not found (document doesn't exist or is deleted)
 *   - 500: Server error (file read failure, database error)
 */

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";
import {
  getAuthenticatedUser,
  unauthorized,
  forbidden,
  notFound,
  internalError,
} from "@/app/api/calendar/utils";

export const runtime = "nodejs";

// ─── Configuration ────────────────────────────────────────────────────────

const UPLOADS_BASE_DIR = "/uploads/vault";

// MIME type mapping for file type to content type
const MIME_TYPE_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  png: "image/png",
};

// ─── Helper Functions ────────────────────────────────────────────────────

/**
 * Get MIME type from file extension.
 * Returns MIME type string or a sensible default.
 */
function getMimeType(fileType: string): string {
  const normalized = fileType.toLowerCase().trim();
  return MIME_TYPE_MAP[normalized] ?? "application/octet-stream";
}

/**
 * Read file from disk for local storage.
 * Throws error if file doesn't exist.
 */
async function readFileFromDisk(
  familyId: string,
  documentId: string,
  fileType: string
): Promise<Buffer> {
  try {
    const filename = `${documentId}.${fileType}`;
    const filepath = path.join(UPLOADS_BASE_DIR, familyId, filename);
    const buffer = await fs.readFile(filepath);
    return buffer;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("File not found on disk");
    }
    throw error;
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  let documentId: string = "";

  try {
    // 1. Extract document ID from URL params
    documentId = (await params).id;
    if (!documentId || typeof documentId !== "string") {
      logEvent("warn", "Vault download: missing document ID", {
        requestId,
        hasId: !!documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]/download",
        method: "GET",
        status: 400,
        durationMs: Date.now() - startedAt,
      });

      return notFound(
        "invalid_document_id",
        "Document ID is required"
      );
    }

    // 2. Authenticate user
    const user = await getAuthenticatedUser();
    if (!user) {
      logEvent("warn", "Vault download: unauthenticated request", {
        requestId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]/download",
        method: "GET",
        status: 401,
        durationMs: Date.now() - startedAt,
      });

      return unauthorized(
        "unauthenticated",
        "Authentication required"
      );
    }

    // 3. Get user's family context
    const parent = await db.parents.findByUserId(user.userId);
    if (!parent) {
      logEvent("warn", "Vault download: parent not found", {
        requestId,
        userId: user.userId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]/download",
        method: "GET",
        status: 403,
        durationMs: Date.now() - startedAt,
      });

      return forbidden(
        "parent_not_found",
        "User is not a parent in any family"
      );
    }

    const familyId = parent.familyId;

    // 4. Query repository: findById (RLS filters by family)
    const document = await db.schoolVaultDocuments.findById(documentId);

    // 5. Check if document exists and is not deleted
    if (!document) {
      logEvent("warn", "Vault download: document not found", {
        requestId,
        userId: user.userId,
        familyId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]/download",
        method: "GET",
        status: 404,
        durationMs: Date.now() - startedAt,
      });

      return notFound(
        "document_not_found",
        "Document not found or has been deleted"
      );
    }

    // 6. Verify family ownership (RLS already filtered, but double-check for safety)
    if (document.familyId !== familyId) {
      logEvent("error", "Vault download: family mismatch (RLS bypass attempted)", {
        requestId,
        userId: user.userId,
        expectedFamilyId: familyId,
        documentFamilyId: document.familyId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]/download",
        method: "GET",
        status: 403,
        durationMs: Date.now() - startedAt,
      });

      return forbidden(
        "unauthorized",
        "You do not have access to this document"
      );
    }

    // 7. Check if document is soft-deleted
    if (document.isDeleted) {
      logEvent("warn", "Vault download: document is deleted", {
        requestId,
        userId: user.userId,
        familyId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]/download",
        method: "GET",
        status: 404,
        durationMs: Date.now() - startedAt,
      });

      return notFound(
        "document_deleted",
        "Document has been deleted"
      );
    }

    // 8. Read file from disk (local storage)
    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFileFromDisk(
        familyId,
        documentId,
        document.fileType
      );
    } catch (fileError) {
      const errorMessage =
        fileError instanceof Error ? fileError.message : "unknown error";

      logEvent("error", "Vault download: file read failed", {
        requestId,
        userId: user.userId,
        familyId,
        documentId,
        fileType: document.fileType,
        error: errorMessage,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]/download",
        method: "GET",
        status: 500,
        durationMs: Date.now() - startedAt,
      });

      return internalError(
        "file_read_error",
        "Failed to read file from storage"
      );
    }

    // 9. Log download access (audit trail)
    try {
      await db.auditLogs.create({
        userId: user.userId,
        action: "vault.document.download",
        metadata: {
          documentId,
          familyId,
          documentTitle: document.title,
          fileType: document.fileType,
          sizeBytes: document.sizeBytes,
        },
      });
    } catch (auditError) {
      // Log audit error but don't fail the download
      logEvent("error", "Vault download: audit log failed", {
        requestId,
        userId: user.userId,
        documentId,
        error: auditError instanceof Error ? auditError.message : "unknown",
      });
    }

    // 10. Return file with proper headers
    const mimeType = getMimeType(document.fileType);
    const filename = `${document.title}.${document.fileType}`;

    // Log successful download
    logEvent("info", "Vault document downloaded successfully", {
      requestId,
      userId: user.userId,
      familyId,
      documentId,
      documentTitle: document.title,
      fileType: document.fileType,
      sizeBytes: fileBuffer.length,
    });

    observeApiRequest({
      route: "/api/school/vault/[id]/download",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    // Convert buffer to Blob for NextResponse
    const blob = new Blob([fileBuffer as unknown as BlobPart], { type: mimeType });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    // Unexpected error
    const errorMessage =
      error instanceof Error ? error.message : "unknown error";

    logEvent("error", "Vault download: unexpected error", {
      requestId,
      documentId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    observeApiRequest({
      route: "/api/school/vault/[id]/download",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError(
      "internal_error",
      "An unexpected error occurred during download"
    );
  }
}
