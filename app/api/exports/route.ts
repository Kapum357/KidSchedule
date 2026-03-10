/**
 * Export Endpoints
 *
 * POST /api/exports - Trigger a new export job
 * GET /api/exports - List export jobs for current user's family
 */

import { getDb } from "@/lib/persistence";
import { enqueueExport } from "@/lib/export-queue";
import type { ExportType } from "@/lib";
import { getAuthenticatedUser, badRequest, unauthorized } from "@/app/api/calendar/utils";

/**
 * POST /api/exports - Create and enqueue a new export job
 *
 * Request body:
 *   type: "schedule-pdf" | "invoices-pdf" | "messages-csv" | "moments-archive"
 *   params?: Record<string, unknown> - Type-specific parameters (date ranges, etc.)
 *
 * Response:
 *   { id, status, type, createdAt }
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized();
    }

    const body = await request.json();
    const { type, params } = body;

    // Validate export type
    const validTypes: ExportType[] = [
      "schedule-pdf",
      "invoices-pdf",
      "messages-csv",
      "moments-archive",
    ];
    if (!type || !validTypes.includes(type)) {
      return badRequest(
        "invalid_export_type",
        `Invalid export type. Must be one of: ${validTypes.join(", ")}`
      );
    }

    // Get user's family
    const db = getDb();
    const parent = await db.parents?.findByUserId(user.userId);
    if (!parent) {
      return unauthorized("parent_not_found", "User is not a parent");
    }

    // Create export job record
    const job = await db.exportJobs?.create({
      familyId: parent.familyId,
      userId: user.userId,
      type,
      params: params || {},
    });

    if (!job) {
      return badRequest(
        "export_creation_failed",
        "Failed to create export job"
      );
    }

    // Enqueue the job for processing
    await enqueueExport(job.id);

    return Response.json(
      {
        id: job.id,
        status: job.status,
        type: job.type,
        createdAt: job.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API] Failed to create export:", error);
    return Response.json(
      { error: "server_error", message: "Failed to create export" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/exports - List recent exports for the current user's family
 *
 * Query params:
 *   status?: "queued" | "processing" | "complete" | "failed"
 *   limit?: number (default 20)
 *
 * Response:
 *   { exports: [...] }
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // Get user's family
    const db = getDb();
    const parent = await db.parents?.findByUserId(user.userId);
    if (!parent) {
      return unauthorized("User is not a parent");
    }

    let jobs = await db.exportJobs?.findByFamilyId(parent.familyId);

    if (!jobs) {
      jobs = [];
    }

    // Filter by status if provided
    if (status) {
      jobs = jobs.filter((job) => job.status === status);
    }

    // Return exports with public fields only
    const exports = jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      resultUrl: job.resultUrl,
      sizeBytes: job.sizeBytes,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    }));

    return Response.json({ exports });
  } catch (error) {
    console.error("[API] Failed to list exports:", error);
    return Response.json(
      { error: "server_error", message: "Failed to list exports" },
      { status: 500 }
    );
  }
}
