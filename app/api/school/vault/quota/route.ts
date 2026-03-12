/**
 * GET /api/school/vault/quota
 *
 * Returns quota status for school vault documents including:
 * - maxDocuments: from subscription plan tier
 * - currentDocuments: count of non-deleted documents
 * - maxStorageBytes: from subscription plan tier
 * - usedStorageBytes: from subscriptions table
 * - percentFull: usage percentage (0-100)
 * - canUpload: boolean (true if under limits)
 *
 * Authentication: Required (JWT in access_token cookie)
 * Family context: From authenticated user's family
 *
 * Response (200): Quota status
 *   {
 *     maxDocuments: number | null;      // null = unlimited
 *     currentDocuments: number;
 *     maxStorageBytes: number | null;   // null = unlimited
 *     usedStorageBytes: number;
 *     documentPercentFull: number;      // 0-100, null if unlimited
 *     storagePercentFull: number;       // 0-100, null if unlimited
 *     canUpload: boolean;               // true if under both limits
 *   }
 *
 * Error responses:
 *   - 400: Bad request (invalid input)
 *   - 401: Unauthorized (no authenticated user)
 *   - 404: Not found (family or subscription not found)
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
} from "@/app/api/calendar/utils";

export const runtime = "nodejs";

// ─── Type Definitions ─────────────────────────────────────────────────────

interface QuotaResponse {
  maxDocuments: number | null;
  currentDocuments: number;
  maxStorageBytes: number | null;
  usedStorageBytes: number;
  documentPercentFull: number | null;
  storagePercentFull: number | null;
  canUpload: boolean;
}

// ─── Route Handler ────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // 1. Authenticate user
    const user = await getAuthenticatedUser();
    if (!user) {
      observeApiRequest({
        route: "/api/school/vault/quota",
        method: "GET",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return unauthorized();
    }

    // 2. Get user's family
    const family = await getFamilyForUser(user.userId);
    if (!family) {
      logEvent("warn", "Vault quota: family not found", {
        requestId,
        userId: user.userId,
      });

      observeApiRequest({
        route: "/api/school/vault/quota",
        method: "GET",
        status: 404,
        durationMs: Date.now() - startedAt,
      });

      return notFound("family_not_found", "Family not found for user");
    }

    const familyId = family.id;

    // 3. Get subscription and plan tier limits
    const parent = await db.parents.findByUserId(user.userId);
    if (!parent) {
      logEvent("warn", "Vault quota: parent not found", {
        requestId,
        userId: user.userId,
      });

      observeApiRequest({
        route: "/api/school/vault/quota",
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

    // 4. Count current non-deleted documents for family
    const allDocuments = await db.schoolVaultDocuments.findByFamilyId(
      familyId
    );
    const currentDocuments = allDocuments.filter(
      (doc) => !doc.isDeleted
    ).length;

    // 5. Get used storage from subscription (or 0 if none)
    const usedStorageBytes = subscription?.usedStorageBytes ?? 0;

    // 6. Calculate percentages and canUpload
    const documentPercentFull =
      maxDocuments && maxDocuments > 0
        ? Math.round((currentDocuments / maxDocuments) * 100)
        : null;

    const storagePercentFull =
      maxStorageBytes && maxStorageBytes > 0
        ? Math.round((usedStorageBytes / maxStorageBytes) * 100)
        : null;

    // canUpload is true if under both limits
    const canUpload =
      (maxDocuments == null ||
        maxDocuments === 0 ||
        currentDocuments < maxDocuments) &&
      (maxStorageBytes == null ||
        maxStorageBytes === 0 ||
        usedStorageBytes < maxStorageBytes);

    // 7. Prepare response
    const response: QuotaResponse = {
      maxDocuments,
      currentDocuments,
      maxStorageBytes,
      usedStorageBytes,
      documentPercentFull,
      storagePercentFull,
      canUpload,
    };

    logEvent("info", "Vault quota retrieved", {
      requestId,
      userId: user.userId,
      familyId,
      currentDocuments,
      usedStorageBytes,
      canUpload,
    });

    observeApiRequest({
      route: "/api/school/vault/quota",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "unknown error";

    logEvent("error", "Vault quota: unexpected error", {
      requestId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    observeApiRequest({
      route: "/api/school/vault/quota",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError("internal_error", "An unexpected error occurred");
  }
}
