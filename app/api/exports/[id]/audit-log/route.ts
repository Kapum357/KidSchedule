/**
 * Export Audit Log API
 *
 * GET /api/exports/{id}/audit-log
 *
 * Returns a list of verification attempts for an export.
 */

import { getDb } from "@/lib/persistence";
import { getAuthenticatedUser } from "@/app/api/calendar/utils";
import { logEvent } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";

interface AuditLogEntry {
  id: string;
  verifiedAt: string;
  ipAddress?: string;
  verificationStatus: string;
  isValid: boolean;
  userAgent?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<AuditLogEntry[] | { error: string; message: string }>> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    // 1. Authenticate user
    const user = await getAuthenticatedUser();
    if (!user) {
      logEvent("info", "Audit log request without auth", {
        requestId,
      });
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    // 2. Get export and metadata
    const { id: exportId } = await params;
    const db = getDb();

    const exportJob = await db.exportJobs?.findById(exportId);
    if (!exportJob) {
      logEvent("warn", "Audit log requested for non-existent export", {
        requestId,
        exportId,
        userId: user.userId,
      });
      return NextResponse.json(
        { error: "export_not_found", message: "Export not found" },
        { status: 404 }
      );
    }

    // Verify user access
    const parent = await db.parents?.findByUserId(user.userId);
    if (!parent || parent.familyId !== exportJob.familyId) {
      logEvent("warn", "Unauthorized audit log access attempt", {
        requestId,
        exportId,
        userId: user.userId,
        familyId: exportJob.familyId,
      });
      return NextResponse.json(
        { error: "access_denied", message: "You do not have access to this export" },
        { status: 403 }
      );
    }

    // 3. Get metadata
    const metadata = await db.exportMetadata?.findByExportId(exportId);
    if (!metadata) {
      logEvent("warn", "Audit log requested for export without metadata", {
        requestId,
        exportId,
        userId: user.userId,
      });
      return NextResponse.json(
        { error: "metadata_not_found", message: "Export metadata not found" },
        { status: 404 }
      );
    }

    // 4. Fetch audit log entries
    const attempts = await db.exportVerificationAttempts?.findByExportMetadataId(
      metadata.id
    );

    // Map to response format
    const auditLog: AuditLogEntry[] = (attempts || []).map((attempt) => ({
      id: attempt.id,
      verifiedAt: attempt.verifiedAt,
      ipAddress: attempt.ipAddress,
      verificationStatus: attempt.verificationStatus,
      isValid: attempt.isValid ?? false,
      userAgent: attempt.userAgent,
    }));

    logEvent("info", "Audit log retrieved", {
      requestId,
      exportId,
      userId: user.userId,
      entriesCount: auditLog.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(auditLog, { status: 200 });
  } catch (error) {
    logEvent("error", "Failed to retrieve audit log", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        error: "server_error",
        message: "Failed to retrieve audit log",
      },
      { status: 500 }
    );
  }
}
