/**
 * Export Job Detail Endpoint
 *
 * GET /api/exports/:id - Get status and details of a specific export job
 */

import { getDb } from "@/lib/persistence";
import { getAuthenticatedUser, unauthorized } from "@/app/api/calendar/utils";

/**
 * GET /api/exports/:id - Get export job status and details
 *
 * Response:
 *   { id, type, status, resultUrl, sizeBytes, mimeType, error, createdAt, completedAt }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized();
    }

    const { id } = await params;
    const db = getDb();
    const job = await db.exportJobs?.findById(id);

    if (!job) {
      return Response.json(
        { error: "not_found", message: "Export not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this export
    const parent = await db.parents?.findByUserId(user.userId);
    if (!parent || parent.familyId !== job.familyId) {
      return unauthorized(
        "access_denied",
        "You do not have access to this export"
      );
    }

    // Return job details
    const response = {
      id: job.id,
      type: job.type,
      status: job.status,
      resultUrl: job.resultUrl,
      sizeBytes: job.sizeBytes,
      mimeType: job.mimeType,
      error: job.error,
      retryCount: job.retryCount,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };

    return Response.json(response);
  } catch (error) {
    console.error("[API] Failed to get export:", error);
    return Response.json(
      { error: "server_error", message: "Failed to get export" },
      { status: 500 }
    );
  }
}
