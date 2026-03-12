/**
 * Public Export Verification API
 *
 * POST /api/exports/verify
 *
 * Enables anyone with a valid share token to verify an export's integrity
 * without authentication. The share token is the only security control.
 *
 * - No authentication required
 * - Share token must be valid and not expired
 * - Token ownership is verified against exportId
 * - Access count is tracked for audit trail
 * - Rate limited: 10 requests/min per IP
 */

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicVerifyRequest {
  exportId: string;
  token: string;
  pdfHash?: string; // Optional: if provided, verify PDF hash
  chainHash?: string; // Optional: if provided, verify message chain
}

interface PublicVerifyResponse {
  verified: boolean;
  reason?: string; // "invalid_token", "expired_token", "export_not_found", etc.
  verifiedAt: string; // ISO 8601 timestamp
  pdfHashMatch?: boolean;
  chainValid?: boolean;
}

// ─── Rate Limiter (In-Memory) ─────────────────────────────────────────────────

interface RateLimitRecord {
  count: number;
  expiresAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

function checkPublicVerifyRateLimit(ipAddress: string): { allowed: boolean; resetAfterMs: number } {
  const WINDOW_MS = 60000; // 1 minute
  const MAX_REQUESTS = 10;

  const key = `verify:${ipAddress}`;
  const now = Date.now();

  const record = rateLimitStore.get(key);
  if (!record || record.expiresAt <= now) {
    // Start new window
    rateLimitStore.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return { allowed: true, resetAfterMs: WINDOW_MS };
  }

  record.count += 1;
  rateLimitStore.set(key, record);

  const allowed = record.count <= MAX_REQUESTS;
  const resetAfterMs = Math.max(0, record.expiresAt - now);

  return { allowed, resetAfterMs };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract IP address from request headers.
 */
function getIpAddress(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Compute SHA-256 hash.
 */
function computeHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Validate message hash chain.
 */
async function validateMessageChain(
  exportMetadataId: string
): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  const db = getDb();
  const errors: string[] = [];

  try {
    const messageHashes = await db.exportMessageHashes.findByExportMetadataId(
      exportMetadataId
    );

    if (messageHashes.length === 0) {
      return { isValid: true, errors: ["No messages to verify"] };
    }

    // Check chain continuity
    for (let i = 0; i < messageHashes.length; i++) {
      const current = messageHashes[i];

      // Verify chain index matches position
      if (current.chainIndex !== i) {
        errors.push(
          `Chain index mismatch at position ${i}: expected ${i}, got ${current.chainIndex}`
        );
      }

      // For messages after the first, verify link to previous
      if (i > 0) {
        const previous = messageHashes[i - 1];

        if (current.previousHash !== previous.messageHash) {
          errors.push(
            `Chain link broken at position ${i}: previousHash doesn't match previous message hash`
          );
          return {
            isValid: false,
            errors,
          };
        }
      } else {
        // First message should have empty or sentinel previousHash
        if (current.previousHash && current.previousHash !== "") {
          errors.push(`First message should have empty previousHash, got: ${current.previousHash}`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  } catch (err) {
    return {
      isValid: false,
      errors: [`Error validating message chain: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * POST /api/exports/verify
 * Public endpoint to verify export integrity using share token.
 */
export async function POST(request: NextRequest): Promise<NextResponse<PublicVerifyResponse | { error: string }>> {
  let exportId = "";
  let token = "";

  try {
    const ipAddress = getIpAddress(request);

    // 1. Check rate limit
    const rateLimit = checkPublicVerifyRateLimit(ipAddress);
    if (!rateLimit.allowed) {
      logEvent("warn", "Public verification rate limit exceeded", {
        ipAddress,
      });
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    // 2. Parse and validate request body
    let body: PublicVerifyRequest | null = null;
    try {
      const text = await request.text();
      if (!text) {
        return NextResponse.json(
          { error: "Invalid request body" },
          { status: 400 }
        );
      }
      body = JSON.parse(text) as PublicVerifyRequest;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    if (!body || !body.exportId || !body.token) {
      return NextResponse.json(
        { error: "Missing exportId or token" },
        { status: 400 }
      );
    }

    exportId = body.exportId;
    token = body.token;
    const db = getDb();

    // 3. Validate token: query share token from DB
    const shareToken = await db.exportShareTokens.findByToken(token);

    if (!shareToken) {
      logEvent("warn", "Public verification: invalid token", {
        exportId,
        ipAddress,
      });
      return NextResponse.json(
        {
          verified: false,
          reason: "invalid_token",
          verifiedAt: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // 4. Check token not expired
    const now = new Date();
    if (new Date(shareToken.expiresAt) < now) {
      logEvent("warn", "Public verification: expired token", {
        exportId,
        tokenId: shareToken.id,
        ipAddress,
      });
      return NextResponse.json(
        {
          verified: false,
          reason: "expired_token",
          verifiedAt: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // 5. Check token belongs to export
    if (shareToken.exportId !== exportId) {
      logEvent("warn", "Public verification: token mismatch", {
        exportId,
        tokenId: shareToken.id,
        tokenExportId: shareToken.exportId,
        ipAddress,
      });
      return NextResponse.json(
        {
          verified: false,
          reason: "token_mismatch",
          verifiedAt: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // 6. Update token access count
    await db.exportShareTokens.updateAccessCount(shareToken.id);

    // 7. Fetch export and metadata
    const exportJob = await db.exportJobs.findById(exportId);
    if (!exportJob) {
      logEvent("warn", "Public verification: export not found", {
        exportId,
        tokenId: shareToken.id,
        ipAddress,
      });
      return NextResponse.json(
        {
          verified: false,
          reason: "export_not_found",
          verifiedAt: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    const metadata = await db.exportMetadata.findByExportId(exportId);
    if (!metadata) {
      logEvent("warn", "Public verification: metadata not found", {
        exportId,
        tokenId: shareToken.id,
        ipAddress,
      });
      return NextResponse.json(
        {
          verified: false,
          reason: "export_not_found",
          verifiedAt: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    // 8. Perform verification
    const errors: string[] = [];
    let pdfHashMatch: boolean | undefined = undefined;
    let chainValid = true;

    // Verify PDF hash if provided
    const storedPdfHash = metadata.pdfHash;
    if (body.pdfHash && storedPdfHash) {
      try {
        const pdfBuffer = Buffer.from(body.pdfHash, "base64");
        const computedHash = computeHash(pdfBuffer);
        pdfHashMatch = computedHash === storedPdfHash;

        if (!pdfHashMatch) {
          errors.push("PDF hash mismatch");
        }
      } catch (err) {
        errors.push(`Error verifying PDF hash: ${err instanceof Error ? err.message : String(err)}`);
        pdfHashMatch = false;
      }
    }

    // Validate message hash chain
    const chainValidation = await validateMessageChain(metadata.id);
    chainValid = chainValidation.isValid;
    if (!chainValidation.isValid) {
      errors.push(...chainValidation.errors);
    }

    // 9. Determine overall verification result
    // If pdfHash was provided, it must match. Chain must always be valid. No errors.
    const verified =
      (pdfHashMatch === undefined || pdfHashMatch) && // Either not provided or matches
      chainValid &&
      errors.length === 0;

    // 10. Log event
    logEvent("info", "Public verification attempt", {
      exportId,
      tokenId: shareToken.id,
      verified,
      pdfHashMatch,
      chainValid,
      ipAddress,
    });

    // 11. Return response
    const response: PublicVerifyResponse = {
      verified,
      verifiedAt: new Date().toISOString(),
      pdfHashMatch: pdfHashMatch,
      chainValid: chainValid || undefined,
    };

    return NextResponse.json(response, {
      status: 200,
    });
  } catch (error) {
    logEvent("error", "Public verification failed", {
      exportId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Verification failed",
      },
      { status: 500 }
    );
  }
}
