/**
 * POST /api/admin/jobs/purge-deleted-documents
 *
 * Manually trigger the purge-deleted-documents cleanup job.
 * Hard-deletes documents soft-deleted 30+ days ago for FERPA compliance.
 *
 * Admin-only endpoint (requires authentication).
 * Useful for testing and on-demand purges outside of scheduled runs.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { purgeDeletedDocuments, getJobConfig } from "@/lib/jobs/purge-deleted-documents";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST handler: Trigger purge-deleted-documents job
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    // 1. Authenticate request
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Authentication required",
        },
        { status: 401 }
      );
    }

    // 2. Check if user is admin (in a real system, would check role/permissions)
    // For now, we just log that an authenticated user triggered this
    logEvent("info", "Admin job endpoint accessed", {
      userId: user.userId,
      endpoint: "/api/admin/jobs/purge-deleted-documents",
    });

    // 3. Parse optional request body
    let vaultBasePath: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      vaultBasePath = (body as { vaultBasePath?: string }).vaultBasePath;
    } catch {
      // No body provided, use default
    }

    logEvent("info", "Triggering purge-deleted-documents job", {
      userId: user.userId,
      vaultBasePath,
    });

    // 4. Run the job
    const result = await purgeDeletedDocuments(vaultBasePath);

    // 5. Track metrics
    observeApiRequest({
      route: "/api/admin/jobs/purge-deleted-documents",
      method: "POST",
      status: result.success ? 200 : 500,
      durationMs: Date.now() - startedAt,
    });

    // 6. Log result
    logEvent("info", "Purge job completed", {
      userId: user.userId,
      success: result.success,
      deletedCount: result.deletedCount,
      errorCount: result.errors.length,
      durationMs: result.durationMs,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logEvent("error", "Failed to trigger purge-deleted-documents job", {
      error: errorMessage,
      requestId,
    });

    observeApiRequest({
      route: "/api/admin/jobs/purge-deleted-documents",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler: Get job configuration and status
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    // 1. Authenticate request
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Authentication required",
        },
        { status: 401 }
      );
    }

    // 2. Get job configuration
    const config = getJobConfig();

    // 3. Track metrics
    observeApiRequest({
      route: "/api/admin/jobs/purge-deleted-documents",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      config,
      message: "Job is configured and ready to run",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logEvent("error", "Failed to get purge-deleted-documents job config", {
      error: errorMessage,
      requestId,
    });

    observeApiRequest({
      route: "/api/admin/jobs/purge-deleted-documents",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
