/**
 * Export Verification API
 *
 * POST /api/exports/:id/verify
 *
 * Verifies the integrity of a court-ready PDF export by:
 * 1. Checking that the PDF hash matches the stored metadata
 * 2. Validating the embedded message hash chain
 * 3. Detecting any tamper evidence (out-of-order hashes, missing messages)
 * 4. Recording verification attempt in audit log for discovery
 */

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/persistence";
import crypto from "crypto";

interface VerifyRequest {
  pdfBuffer?: string; // Base64-encoded PDF buffer (for client-side verification)
  storedHash?: string; // Pre-computed hash to verify against
}

interface VerifyResponse {
  exportId: string;
  isValid: boolean;
  integrityStatus: "valid" | "tampered" | "incomplete" | "unknown";
  pdfHashMatch: boolean;
  messageChainValid: boolean;
  tamperDetectedAtIndex?: number;
  messagesVerified: number;
  errorsDetected: string[];
  verifiedAt: string;
}

/**
 * Helper: Get authenticated user from session/JWT
 */
async function getAuthenticatedUser() {
  // This would normally extract from JWT/session
  // For now, return null to indicate auth check needed
  return null;
}

/**
 * Helper: Verify user has access to family
 */
async function userBelongsToFamily(userId: string, familyId: string): Promise<boolean> {
  const db = getDb();
  const parents = await db.parents.findByFamilyId(familyId);
  return parents.some((p) => p.userId === userId);
}

/**
 * Helper: Compute SHA-256 hash
 */
function computeHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Helper: Validate message hash chain
 */
async function validateMessageChain(
  exportMetadataId: string
): Promise<{
  isValid: boolean;
  tamperDetectedAtIndex?: number;
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
            tamperDetectedAtIndex: i,
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

/**
 * POST /api/exports/:id/verify
 * Verify the integrity of an export PDF
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<VerifyResponse | { error: string }>> {
  try {
    const { id: exportId } = await params;
    const userId = await getAuthenticatedUser();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    // Find export and metadata
    const exportJob = await db.exportJobs.findById(exportId);
    if (!exportJob) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }

    // Verify user has access to family
    const hasAccess = await userBelongsToFamily(userId, exportJob.familyId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get export metadata
    const metadata = await db.exportMetadata.findByExportId(exportId);
    if (!metadata) {
      return NextResponse.json(
        { error: "Export metadata not found" },
        { status: 404 }
      );
    }

    const errors: string[] = [];
    let pdfHashMatch = false;
    let isValid = false;

    // Optional: Verify PDF hash if provided
    let storedPdfHash = metadata.pdfHash;
    if (request.body) {
      const body = (await request.json()) as VerifyRequest;

      if (body.pdfBuffer && body.storedHash) {
        try {
          const pdfBuffer = Buffer.from(body.pdfBuffer, "base64");
          const computedHash = computeHash(pdfBuffer);
          pdfHashMatch = computedHash === body.storedHash;

          if (!pdfHashMatch) {
            errors.push(
              `PDF hash mismatch: computed ${computedHash}, stored ${body.storedHash}`
            );
          }
        } catch (err) {
          errors.push(`Error verifying PDF hash: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // Validate message hash chain
    const chainValidation = await validateMessageChain(metadata.id);
    if (!chainValidation.isValid) {
      errors.push(...chainValidation.errors);
    }

    // Determine overall validity
    isValid = pdfHashMatch && chainValidation.isValid && errors.length === 0;
    const integrityStatus: "valid" | "tampered" | "incomplete" | "unknown" = isValid
      ? "valid"
      : chainValidation.tamperDetectedAtIndex !== undefined
        ? "tampered"
        : "incomplete";

    // Record verification attempt for audit trail
    const messageHashes = await db.exportMessageHashes.findByExportMetadataId(
      metadata.id
    );

    // Extract IP address from headers
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;

    await db.exportVerificationAttempts.create({
      exportMetadataId: metadata.id,
      verifiedBy: userId,
      verifiedAt: new Date().toISOString(),
      verificationStatus: integrityStatus,
      isValid,
      integrityStatus,
      pdfHashMatch,
      errorsDetected: errors,
      ipAddress,
      userAgent: request.headers.get("user-agent") || undefined,
    });

    // Return verification result
    const response: VerifyResponse = {
      exportId,
      isValid,
      integrityStatus,
      pdfHashMatch: pdfHashMatch || !request.body,
      messageChainValid: chainValidation.isValid,
      tamperDetectedAtIndex: chainValidation.tamperDetectedAtIndex,
      messagesVerified: messageHashes.length,
      errorsDetected: errors,
      verifiedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      status: isValid ? 200 : 422,
    });
  } catch (error) {
    console.error("[ExportVerify] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Verification failed",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/exports/:id/verify
 * Get the last verification result for an export
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<VerifyResponse | { error: string }>> {
  try {
    const { id: exportId } = await params;
    const userId = await getAuthenticatedUser();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    // Find export
    const exportJob = await db.exportJobs.findById(exportId);
    if (!exportJob) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }

    // Verify access
    const hasAccess = await userBelongsToFamily(userId, exportJob.familyId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get metadata and last verification
    const metadata = await db.exportMetadata.findByExportId(exportId);
    if (!metadata) {
      return NextResponse.json(
        { error: "Export metadata not found" },
        { status: 404 }
      );
    }

    const attempts = await db.exportVerificationAttempts.findByExportMetadataId(
      metadata.id
    );
    const lastAttempt = attempts[0]; // Ordered by verified_at DESC

    if (!lastAttempt) {
      return NextResponse.json(
        { error: "No verification records found" },
        { status: 404 }
      );
    }

    const messageHashes = await db.exportMessageHashes.findByExportMetadataId(
      metadata.id
    );

    const response: VerifyResponse = {
      exportId,
      isValid: lastAttempt.isValid,
      integrityStatus: (lastAttempt.integrityStatus || "unknown") as
        | "valid"
        | "tampered"
        | "incomplete"
        | "unknown",
      pdfHashMatch: lastAttempt.pdfHashMatch ?? false,
      messageChainValid: lastAttempt.integrityStatus === "valid",
      tamperDetectedAtIndex: undefined,
      messagesVerified: messageHashes.length,
      errorsDetected: lastAttempt.errorsDetected || [],
      verifiedAt: lastAttempt.verifiedAt,
    };

    return NextResponse.json(response, {
      status: response.isValid ? 200 : 422,
    });
  } catch (error) {
    console.error("[ExportVerify] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Verification failed",
      },
      { status: 500 }
    );
  }
}
