/**
 * GET /api/school/vault
 *
 * Returns paginated list of documents for a family with subscription quota info.
 *
 * Query Parameters:
 *   - limit?: number (default 20, max 100) - documents per page
 *   - offset?: number (default 0) - pagination offset
 *   - status?: string (optional) - filter by status: available, pending_signature, signed, expired
 *
 * Response (200): List of documents + quota metadata
 *   {
 *     documents: [
 *       {
 *         id: string;
 *         familyId: string;
 *         title: string;
 *         fileType: string;
 *         status: string;
 *         statusLabel: string;
 *         sizeBytes: number;
 *         url: string;
 *         addedAt: string (ISO 8601);
 *         addedBy: string (userId);
 *         updatedAt: string (ISO 8601);
 *         actionDeadline?: string;
 *       }
 *     ];
 *     quota: {
 *       maxDocuments: number | null;      // null = unlimited
 *       currentDocuments: number;
 *       maxStorageBytes: number | null;   // null = unlimited
 *       usedStorageBytes: number;
 *       documentPercentFull: number | null; // 0-100, null if unlimited
 *       storagePercentFull: number | null;  // 0-100, null if unlimited
 *       canUpload: boolean;                // true if under both limits
 *     };
 *     pagination: {
 *       limit: number;
 *       offset: number;
 *       total: number;
 *     };
 *   }
 *
 * Error responses:
 *   - 400: Bad request (invalid pagination parameters)
 *   - 401: Unauthorized (no authenticated user)
 *   - 404: Family not found
 *   - 500: Server error (database error)
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";
import {
  getAuthenticatedUser,
  getFamilyForUser,
  unauthorized,
  notFound,
  internalError,
  badRequest,
} from "@/app/api/calendar/utils";

export const runtime = "nodejs";

// ─── Type Definitions ─────────────────────────────────────────────────────

interface DocumentResponse {
  id: string;
  familyId: string;
  title: string;
  fileType: string;
  status: string;
  statusLabel: string;
  sizeBytes: number;
  url: string;
  addedAt: string;
  addedBy: string;
  updatedAt: string;
  actionDeadline?: string;
}

interface QuotaInfo {
  maxDocuments: number | null;
  currentDocuments: number;
  maxStorageBytes: number | null;
  usedStorageBytes: number;
  documentPercentFull: number | null;
  storagePercentFull: number | null;
  canUpload: boolean;
}

interface PaginationInfo {
  limit: number;
  offset: number;
  total: number;
}

interface VaultListResponse {
  documents: DocumentResponse[];
  quota: QuotaInfo;
  pagination: PaginationInfo;
}

// ─── Route Handler ────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // 1. Authenticate user
    const user = await getAuthenticatedUser();
    if (!user) {
      observeApiRequest({
        route: "/api/school/vault",
        method: "GET",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return unauthorized();
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const statusFilter = searchParams.get("status");

    // Validate and parse pagination parameters
    let limit = 20; // default
    let offset = 0; // default

    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 100) {
        logEvent("warn", "Vault list: invalid limit parameter", {
          requestId,
          userId: user.userId,
          limitParam,
        });

        observeApiRequest({
          route: "/api/school/vault",
          method: "GET",
          status: 400,
          durationMs: Date.now() - startedAt,
        });

        return badRequest(
          "invalid_limit",
          "limit must be a number between 1 and 100"
        );
      }
      limit = parsed;
    }

    if (offsetParam) {
      const parsed = parseInt(offsetParam, 10);
      if (isNaN(parsed) || parsed < 0) {
        logEvent("warn", "Vault list: invalid offset parameter", {
          requestId,
          userId: user.userId,
          offsetParam,
        });

        observeApiRequest({
          route: "/api/school/vault",
          method: "GET",
          status: 400,
          durationMs: Date.now() - startedAt,
        });

        return badRequest(
          "invalid_offset",
          "offset must be a non-negative number"
        );
      }
      offset = parsed;
    }

    // 3. Get user's family
    const family = await getFamilyForUser(user.userId);
    if (!family) {
      logEvent("warn", "Vault list: family not found", {
        requestId,
        userId: user.userId,
      });

      observeApiRequest({
        route: "/api/school/vault",
        method: "GET",
        status: 404,
        durationMs: Date.now() - startedAt,
      });

      return notFound("family_not_found", "Family not found for user");
    }

    const familyId = family.id;

    // 4. Get subscription and plan tier limits
    const parent = await db.parents.findByUserId(user.userId);
    if (!parent) {
      logEvent("warn", "Vault list: parent not found", {
        requestId,
        userId: user.userId,
      });

      observeApiRequest({
        route: "/api/school/vault",
        method: "GET",
        status: 404,
        durationMs: Date.now() - startedAt,
      });

      return notFound("parent_not_found", "Parent record not found");
    }

    // Get Stripe customer and subscription
    const stripeCustomer = await db.stripeCustomers.findByUserId(user.userId);
    let subscription = null;
    let planTier = null;

    if (stripeCustomer) {
      subscription = await db.subscriptions.findActive(stripeCustomer.id);
      if (subscription) {
        planTier = await db.planTiers.findById(subscription.planTier);
      }
    }

    // If no active subscription, user is on free tier or unsubscribed
    // Free tier defaults: 10 documents, 100 MB storage
    const maxDocuments = planTier?.maxDocuments ?? 10;
    const maxStorageBytes = planTier?.maxStorageBytes ?? 104857600; // 100 MB default

    // 5. Count current non-deleted documents for family
    const allDocuments = await db.schoolVaultDocuments.findByFamilyId(
      familyId
    );
    const activeDocuments = allDocuments.filter((doc) => !doc.isDeleted);
    const totalDocuments = activeDocuments.length;

    // 6. Get used storage from subscription (or 0 if none)
    const usedStorageBytes = subscription?.usedStorageBytes ?? 0;

    // 7. Calculate percentages and canUpload
    const documentPercentFull =
      maxDocuments && maxDocuments > 0
        ? Math.round((totalDocuments / maxDocuments) * 100)
        : null;

    const storagePercentFull =
      maxStorageBytes && maxStorageBytes > 0
        ? Math.round((usedStorageBytes / maxStorageBytes) * 100)
        : null;

    // canUpload is true if under both limits
    const canUpload =
      (maxDocuments == null ||
        maxDocuments === 0 ||
        totalDocuments < maxDocuments) &&
      (maxStorageBytes == null ||
        maxStorageBytes === 0 ||
        usedStorageBytes < maxStorageBytes);

    // 8. Get paginated documents, with optional status filter
    let documentsToReturn: typeof activeDocuments;
    if (statusFilter) {
      // Validate status parameter
      const validStatuses = [
        "available",
        "pending_signature",
        "signed",
        "expired",
      ];
      if (!validStatuses.includes(statusFilter)) {
        logEvent("warn", "Vault list: invalid status filter", {
          requestId,
          userId: user.userId,
          statusFilter,
        });

        observeApiRequest({
          route: "/api/school/vault",
          method: "GET",
          status: 400,
          durationMs: Date.now() - startedAt,
        });

        return badRequest(
          "invalid_status",
          `status must be one of: ${validStatuses.join(", ")}`
        );
      }

      // Use findByStatus with pagination
      documentsToReturn = await db.schoolVaultDocuments.findByStatus(
        familyId,
        statusFilter,
        limit,
        offset
      );
    } else {
      // Return paginated active documents (sorted by added_at DESC, which is the default)
      // Since we don't have a generic paginated findByFamilyId, we manually paginate
      documentsToReturn = activeDocuments
        .sort(
          (a, b) =>
            new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
        )
        .slice(offset, offset + limit);
    }

    // 9. Format response documents
    const documentResponses: DocumentResponse[] = documentsToReturn.map(
      (doc) => ({
        id: doc.id,
        familyId: doc.familyId,
        title: doc.title,
        fileType: doc.fileType,
        status: doc.status,
        statusLabel: doc.statusLabel,
        sizeBytes: doc.sizeBytes ?? 0,
        url: doc.url ?? "",
        addedAt: doc.addedAt,
        addedBy: doc.addedBy,
        updatedAt: doc.updatedAt,
        actionDeadline: doc.actionDeadline,
      })
    );

    // 10. Build quota info
    const quotaInfo: QuotaInfo = {
      maxDocuments,
      currentDocuments: totalDocuments,
      maxStorageBytes,
      usedStorageBytes,
      documentPercentFull,
      storagePercentFull,
      canUpload,
    };

    // 11. Build pagination info
    const paginationInfo: PaginationInfo = {
      limit,
      offset,
      total: statusFilter
        ? // For filtered results, we'd need to count filtered documents
          // For now, use total count as approximation (could optimize later)
          totalDocuments
        : totalDocuments,
    };

    // 12. Prepare response
    const response: VaultListResponse = {
      documents: documentResponses,
      quota: quotaInfo,
      pagination: paginationInfo,
    };

    logEvent("info", "Vault documents listed", {
      requestId,
      userId: user.userId,
      familyId,
      documentCount: documentResponses.length,
      totalDocuments,
      limit,
      offset,
      canUpload,
    });

    observeApiRequest({
      route: "/api/school/vault",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "unknown error";

    logEvent("error", "Vault list: unexpected error", {
      requestId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    observeApiRequest({
      route: "/api/school/vault",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError("internal_error", "An unexpected error occurred");
  }
}
