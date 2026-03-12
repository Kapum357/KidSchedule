/**
 * Export Share Token Endpoint
 *
 * POST /api/exports/{id}/share - Create a shareable token for public export verification
 */

import { getDb } from "@/lib/persistence";
import { getAuthenticatedUser } from "@/app/api/calendar/utils";
import { logEvent } from "@/lib/observability/logger";
import { badRequest, unauthorized, notFound } from "@/app/api/calendar/utils";
import { NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareTokenRequest {
  expiresInDays?: number;
}

interface ShareTokenResponse {
  token: string;
  shareLink: string;
  qrUrl: string;
  expiresAt: string; // ISO 8601
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const MIN_EXPIRES_DAYS = 1;
const MAX_EXPIRES_DAYS = 30;
const DEFAULT_EXPIRES_DAYS = 7;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ShareTokenResponse | { error: string; message: string }>> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    // 1. Authenticate user
    const user = await getAuthenticatedUser();
    if (!user) {
      logEvent("info", "Share token creation attempt without auth", {
        requestId,
        exportId: (await params).id,
      });
      return unauthorized();
    }

    // 2. Parse and validate request body
    let body: ShareTokenRequest = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK, use defaults
    }

    const { expiresInDays = DEFAULT_EXPIRES_DAYS } = body;

    // Validate expiresInDays
    if (!Number.isInteger(expiresInDays) || expiresInDays < MIN_EXPIRES_DAYS || expiresInDays > MAX_EXPIRES_DAYS) {
      logEvent("warn", "Invalid expiresInDays for share token", {
        requestId,
        expiresInDays,
        userId: user.userId,
      });
      return badRequest(
        "invalid_expiration",
        `expiresInDays must be an integer between ${MIN_EXPIRES_DAYS} and ${MAX_EXPIRES_DAYS}`
      );
    }

    // 3. Get export and verify user access
    const { id: exportId } = await params;
    const db = getDb();

    const exportJob = await db.exportJobs?.findById(exportId);
    if (!exportJob) {
      logEvent("warn", "Share token creation for non-existent export", {
        requestId,
        exportId,
        userId: user.userId,
      });
      return notFound("export_not_found", "Export not found");
    }

    // Verify user has access to this export (must belong to same family)
    const parent = await db.parents?.findByUserId(user.userId);
    if (!parent || parent.familyId !== exportJob.familyId) {
      logEvent("warn", "Unauthorized share token creation attempt", {
        requestId,
        exportId,
        userId: user.userId,
        familyId: exportJob.familyId,
      });
      return unauthorized("access_denied", "You do not have access to this export");
    }

    // 4. Create share token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const { token, id: tokenId } = await db.exportShareTokens!.create(
      exportId,
      user.userId,
      expiresAt,
      "external"
    );

    // 5. Generate share link and QR code URL
    const shareLink = `${BASE_URL}/exports/${exportId}/verify?token=${token}`;
    const encodedLink = encodeURIComponent(shareLink);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedLink}`;

    // 6. Log event
    logEvent("info", "Export share token created", {
      requestId,
      tokenId,
      exportId,
      userId: user.userId,
      familyId: parent.familyId,
      scope: "external",
      expiresInDays,
    });

    const createdAt = new Date().toISOString();

    // 7. Return response
    return NextResponse.json(
      {
        token,
        shareLink,
        qrUrl,
        expiresAt: expiresAt.toISOString(),
        createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    logEvent("error", "Failed to create export share token", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { error: "server_error", message: "Failed to create share token" },
      { status: 500 }
    );
  }
}
