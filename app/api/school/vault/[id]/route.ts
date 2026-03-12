/**
 * DELETE /api/school/vault/{id}
 *
 * Soft-delete endpoint for school vault documents.
 *
 * Verifies document belongs to user's family (RLS), performs soft-delete
 * (is_deleted=true, updated_at auto-updates), reclaims storage quota atomically,
 * logs deletion for audit trail, and returns the deleted document.
 *
 * Request: DELETE /api/school/vault/{id}
 *   - id: UUID of document to delete
 *
 * Response (200): Deleted document
 *   {
 *     id: string;
 *     familyId: string;
 *     title: string;
 *     fileType: string;
 *     status: string;
 *     statusLabel: string;
 *     sizeBytes: number;
 *     url: string;
 *     addedAt: string (ISO 8601);
 *     addedBy: string (userId);
 *     updatedAt: string (ISO 8601);
 *     isDeleted: true;
 *   }
 *
 * Error responses:
 *   - 401: Unauthenticated (no valid session)
 *   - 403: Forbidden (user doesn't belong to document's family)
 *   - 404: Not found (document doesn't exist or is already deleted)
 *   - 500: Server error (database error, audit log failure)
 */

import { NextResponse } from "next/server";
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

// ─── Route Handler ────────────────────────────────────────────────────────

export async function DELETE(
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
      logEvent("warn", "Vault delete: missing document ID", {
        requestId,
        hasId: !!documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]",
        method: "DELETE",
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
      logEvent("warn", "Vault delete: unauthenticated request", {
        requestId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]",
        method: "DELETE",
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
      logEvent("warn", "Vault delete: parent not found", {
        requestId,
        userId: user.userId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]",
        method: "DELETE",
        status: 403,
        durationMs: Date.now() - startedAt,
      });

      return forbidden(
        "parent_not_found",
        "User is not a parent in any family"
      );
    }

    const familyId = parent.familyId;

    // 4. Query repository: findById to verify ownership
    const document = await db.schoolVaultDocuments.findById(documentId);

    // 5. Check if document exists and is not already deleted
    if (!document) {
      logEvent("warn", "Vault delete: document not found", {
        requestId,
        userId: user.userId,
        familyId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]",
        method: "DELETE",
        status: 404,
        durationMs: Date.now() - startedAt,
      });

      return notFound(
        "document_not_found",
        "Document not found or has already been deleted"
      );
    }

    // 6. Verify family ownership (RLS already filtered, but double-check for safety)
    if (document.familyId !== familyId) {
      logEvent("error", "Vault delete: family mismatch (RLS bypass attempted)", {
        requestId,
        userId: user.userId,
        expectedFamilyId: familyId,
        documentFamilyId: document.familyId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]",
        method: "DELETE",
        status: 403,
        durationMs: Date.now() - startedAt,
      });

      return forbidden(
        "unauthorized",
        "You do not have access to this document"
      );
    }

    // 7. Call repository.delete() which handles soft-delete + quota reclaim atomically
    const deleteSuccess = await db.schoolVaultDocuments.delete(
      documentId,
      familyId
    );

    // 8. Check if delete succeeded
    if (!deleteSuccess) {
      logEvent("warn", "Vault delete: delete operation failed", {
        requestId,
        userId: user.userId,
        familyId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]",
        method: "DELETE",
        status: 404,
        durationMs: Date.now() - startedAt,
      });

      return notFound(
        "document_not_found",
        "Document not found or has already been deleted"
      );
    }

    // 9. Log deletion for audit trail
    try {
      await db.auditLogs.create({
        userId: user.userId,
        action: "vault.document.delete",
        metadata: {
          documentId,
          familyId,
          documentTitle: document.title,
          fileType: document.fileType,
          sizeBytes: document.sizeBytes,
          status: document.status,
        },
      });
    } catch (auditError) {
      // Log audit error but don't fail the deletion
      logEvent("error", "Vault delete: audit log failed", {
        requestId,
        userId: user.userId,
        documentId,
        error: auditError instanceof Error ? auditError.message : "unknown",
      });
    }

    // 10. Return deleted document with updated timestamp
    // Re-fetch to get the updated timestamp (soft-delete set updated_at = NOW())
    const deletedDocument = await db.schoolVaultDocuments.findById(documentId);
    if (!deletedDocument) {
      // This shouldn't happen, but safeguard against race condition
      logEvent("error", "Vault delete: document vanished after delete", {
        requestId,
        userId: user.userId,
        familyId,
        documentId,
      });

      observeApiRequest({
        route: "/api/school/vault/[id]",
        method: "DELETE",
        status: 500,
        durationMs: Date.now() - startedAt,
      });

      return internalError(
        "document_lost",
        "Document was deleted but could not be retrieved"
      );
    }

    // Log successful deletion
    logEvent("info", "Vault document deleted successfully", {
      requestId,
      userId: user.userId,
      familyId,
      documentId,
      documentTitle: document.title,
      fileType: document.fileType,
      sizeBytes: document.sizeBytes,
    });

    observeApiRequest({
      route: "/api/school/vault/[id]",
      method: "DELETE",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(deletedDocument, { status: 200 });
  } catch (error) {
    // Unexpected error
    const errorMessage =
      error instanceof Error ? error.message : "unknown error";

    logEvent("error", "Vault delete: unexpected error", {
      requestId,
      documentId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    observeApiRequest({
      route: "/api/school/vault/[id]",
      method: "DELETE",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError(
      "internal_error",
      "An unexpected error occurred during deletion"
    );
  }
}
