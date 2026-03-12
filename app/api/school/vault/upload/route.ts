/**
 * POST /api/school/vault/upload
 *
 * File upload endpoint for school vault documents.
 *
 * Validates file type, size, and quota before storing.
 * Stores files to disk and creates vault document record.
 *
 * Request: multipart/form-data with:
 *   - title: string (document title)
 *   - file: File (pdf, docx, xlsx, jpg, png only; max 20MB)
 *
 * Response (201): Created document with URL
 *   {
 *     id: string;
 *     familyId: string;
 *     title: string;
 *     fileType: string;
 *     status: "available";
 *     statusLabel: "Available";
 *     sizeBytes: number;
 *     url: string;
 *     addedAt: string (ISO 8601);
 *     addedBy: string (userId);
 *     updatedAt: string (ISO 8601);
 *   }
 *
 * Error responses:
 *   - 400: Bad request (invalid file type, missing fields, malformed input)
 *   - 401: Unauthorized (no authenticated user)
 *   - 404: Family not found or user not member of family
 *   - 413: Payload too large (file > 20MB)
 *   - 429: Quota exceeded (too many documents for subscription tier)
 *   - 500: Server error (storage failure, database error)
 */

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { getAuthenticatedUser, userBelongsToFamily, unauthorized, badRequest, notFound, forbidden, internalError } from "@/app/api/calendar/utils";

export const runtime = "nodejs";

// ─── Configuration ────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_FILE_TYPES = new Set(["pdf", "docx", "xlsx", "jpg", "png"]);
const UPLOADS_BASE_DIR = "/uploads/vault";

// MIME type mapping for validation
const MIME_TYPE_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// ─── Type Definitions ────────────────────────────────────────────────────

interface UploadedDocument {
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
}

// ─── Helper Functions ────────────────────────────────────────────────────

/**
 * Get file extension from MIME type.
 * Returns lowercase extension (pdf, docx, etc.) or null if unsupported.
 */
function getMimeFileType(mimeType: string): string | null {
  const normalized = mimeType.toLowerCase().trim();
  return MIME_TYPE_MAP[normalized] ?? null;
}

/**
 * Validate file type from MIME type and filename.
 * Returns extension if valid, error message string if invalid.
 */
function validateFileType(
  mimeType: string,
  filename: string
): { valid: boolean; extension?: string; error?: string } {
  // Get extension from MIME type
  const mimeExt = getMimeFileType(mimeType);

  // Get extension from filename
  const fileExt = filename.split(".").pop()?.toLowerCase();

  // Must have both
  if (!mimeExt || !fileExt) {
    return {
      valid: false,
      error: `Unsupported file type. Allowed types: ${Array.from(ALLOWED_FILE_TYPES).join(", ")}`,
    };
  }

  // Extensions should match (prevent MIME type spoofing)
  if (mimeExt !== fileExt) {
    return {
      valid: false,
      error: `File type mismatch: MIME type indicates ${mimeExt} but filename is .${fileExt}`,
    };
  }

  // Check against whitelist
  if (!ALLOWED_FILE_TYPES.has(mimeExt)) {
    return {
      valid: false,
      error: `File type not allowed: .${mimeExt}. Allowed types: ${Array.from(ALLOWED_FILE_TYPES).join(", ")}`,
    };
  }

  return { valid: true, extension: mimeExt };
}

/**
 * Get authenticated user and verify family membership.
 * Returns { user, error } where error is a NextResponse if unauthorized.
 */
async function getAuthenticatedAndVerified(familyId: string): Promise<
  { user: Awaited<ReturnType<typeof getAuthenticatedUser>>; error?: never } |
  { user?: never; error: NextResponse }
> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return { error: unauthorized() };
  }

  // Verify user belongs to family
  const belongsToFamily = await userBelongsToFamily(user.userId, familyId);
  if (!belongsToFamily) {
    return { error: forbidden("forbidden", "User does not belong to this family") };
  }

  return { user };
}

/**
 * Ensure uploads directory exists.
 */
async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOADS_BASE_DIR, { recursive: true });
  } catch (error) {
    logEvent("error", "Failed to create upload directory", {
      dir: UPLOADS_BASE_DIR,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw new Error("Failed to prepare storage");
  }
}

/**
 * Save file to disk and return the path.
 */
async function saveFileToDisk(
  buffer: Buffer,
  familyId: string,
  documentId: string,
  extension: string
): Promise<string> {
  try {
    // Create family directory if needed
    const familyDir = path.join(UPLOADS_BASE_DIR, familyId);
    await fs.mkdir(familyDir, { recursive: true });

    // Save file
    const filename = `${documentId}.${extension}`;
    const filepath = path.join(familyDir, filename);
    await fs.writeFile(filepath, buffer);

    // Return relative URL path (will be served by the app)
    return `/uploads/vault/${familyId}/${filename}`;
  } catch (error) {
    logEvent("error", "Failed to save file to disk", {
      familyId,
      documentId,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw new Error("Failed to store file");
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // 1. Parse multipart form data
    const formData = await request.formData();
    const title = formData.get("title");
    const file = formData.get("file");
    const familyId = formData.get("familyId");

    // 2. Validate required fields
    if (
      !title ||
      typeof title !== "string" ||
      !file ||
      !(file instanceof File) ||
      !familyId ||
      typeof familyId !== "string"
    ) {
      logEvent("warn", "Vault upload: missing required fields", {
        requestId,
        hasTitle: !!title,
        hasFile: !!file,
        hasFamilyId: !!familyId,
      });

      observeApiRequest({
        route: "/api/school/vault/upload",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });

      return badRequest(
        "missing_fields",
        "Missing required fields: title, file, familyId"
      );
    }

    // 3. Authenticate and verify family membership
    const authResult = await getAuthenticatedAndVerified(familyId);
    if (authResult.error) {
      observeApiRequest({
        route: "/api/school/vault/upload",
        method: "POST",
        status: authResult.error.status,
        durationMs: Date.now() - startedAt,
      });
      return authResult.error;
    }
    // TypeScript narrowing: if no error, user is guaranteed to exist
    const user = authResult.user!;

    // 4. Validate file type
    const { valid, extension, error } = validateFileType(
      file.type,
      file.name
    );
    if (!valid) {
      logEvent("warn", "Vault upload: invalid file type", {
        requestId,
        userId: user.userId,
        familyId,
        filename: file.name,
        mimeType: file.type,
        error,
      });

      observeApiRequest({
        route: "/api/school/vault/upload",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });

      return badRequest("invalid_file_type", error || "Unsupported file type");
    }

    // 5. Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      logEvent("warn", "Vault upload: file too large", {
        requestId,
        userId: user.userId,
        familyId,
        filename: file.name,
        sizeBytes: file.size,
        maxBytes: MAX_FILE_SIZE_BYTES,
      });

      observeApiRequest({
        route: "/api/school/vault/upload",
        method: "POST",
        status: 413,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json(
        {
          error: "file_too_large",
          message: `File size exceeds limit of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
        },
        { status: 413 }
      );
    }

    // 6. Convert File to Buffer for storage
    const buffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(buffer);

    // 7. Ensure upload directory exists
    await ensureUploadDir();

    // 8. Generate document ID (will be used as filename)
    const documentId = crypto.randomUUID();

    // 9. Save file to disk
    const fileUrl = await saveFileToDisk(
      fileBuffer,
      familyId,
      documentId,
      extension!
    );

    // 10. Create vault document record via repository
    // This checks quota and creates the record atomically
    let createdDocument;
    try {
      createdDocument = await db.schoolVaultDocuments.create({
        familyId,
        title: title.trim(),
        fileType: extension!,
        sizeBytes: fileBuffer.length,
        url: fileUrl,
        addedBy: user.userId,
        actionDeadline: undefined,
      });
    } catch (dbError) {
      // Handle specific HTTP errors from repository
      // The repository throws HttpError with statusCode property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusCode = (dbError as any)?.statusCode;
      const errorMessage =
        dbError instanceof Error ? dbError.message : "unknown database error";

      logEvent("error", "Vault upload: repository error", {
        requestId,
        userId: user.userId,
        familyId,
        filename: file.name,
        statusCode: statusCode || 500,
        error: errorMessage,
      });

      observeApiRequest({
        route: "/api/school/vault/upload",
        method: "POST",
        status: statusCode || 500,
        durationMs: Date.now() - startedAt,
      });

      if (statusCode === 429) {
        return NextResponse.json(
          {
            error: "quota_exceeded",
            message: errorMessage,
          },
          { status: 429 }
        );
      } else if (statusCode === 404) {
        return notFound("family_not_found", errorMessage);
      } else {
        return internalError(
          "database_error",
          "Failed to create document record"
        );
      }
    }

    // 11. Log successful upload
    logEvent("info", "Vault document uploaded successfully", {
      requestId,
      userId: user.userId,
      familyId,
      documentId: createdDocument.id,
      filename: file.name,
      sizeBytes: fileBuffer.length,
    });

    // 12. Return 201 Created with document details
    const response: UploadedDocument = {
      id: createdDocument.id,
      familyId: createdDocument.familyId,
      title: createdDocument.title,
      fileType: createdDocument.fileType,
      status: createdDocument.status,
      statusLabel: createdDocument.statusLabel,
      sizeBytes: createdDocument.sizeBytes ?? 0,
      url: createdDocument.url ?? "",
      addedAt: createdDocument.addedAt,
      addedBy: createdDocument.addedBy,
      updatedAt: createdDocument.updatedAt,
    };

    observeApiRequest({
      route: "/api/school/vault/upload",
      method: "POST",
      status: 201,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    // Unexpected error
    const errorMessage =
      error instanceof Error ? error.message : "unknown error";

    logEvent("error", "Vault upload: unexpected error", {
      requestId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    observeApiRequest({
      route: "/api/school/vault/upload",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError("internal_error", "An unexpected error occurred");
  }
}
