/**
 * KidSchedule – Moments File Upload API
 *
 * POST /api/moments/upload
 * Accepts multipart/form-data with a 'file' field.
 * Validates file type and size, uploads to storage, returns media URL.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createLocalStorageAdapter } from "@/lib/storage/local";
import { getMomentsStorageConfig } from "@/lib/config";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "video/mp4"];
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export const runtime = "nodejs";

async function validateFile(file: File): Promise<{ valid: true } | { valid: false; error: string }> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Unsupported file type. Please upload a PNG, JPG, or MP4 file.",
    };
  }

  if (file.size > MAX_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File too large (${sizeMB} MB). Maximum size is 50 MB.`,
    };
  }

  return { valid: true };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "MISSING_FILE", message: "No file provided in request." },
        { status: 400 }
      );
    }

    // Validate file
    const validation = await validateFile(file);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "INVALID_FILE", message: validation.error },
        { status: 400 }
      );
    }

    // Read file into Buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Upload to storage
    const storageConfig = getMomentsStorageConfig();
    const storageAdapter = createLocalStorageAdapter(storageConfig);

    const { url: mediaUrl } = await storageAdapter.upload(
      fileBuffer,
      file.name,
      file.type
    );

    // Log success
    console.log(`[Moments Upload] File uploaded: ${requestId}`, {
      filename: file.name,
      mediaUrl,
      size: file.size,
    });

    return NextResponse.json(
      {
        mediaUrl,
        mediaType: file.type,
      },
      { status: 200 }
    );
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.error(`[Moments Upload] Upload failed: ${requestId}`, {
      error: error instanceof Error ? error.message : String(error),
      duration,
    });

    return NextResponse.json(
      { error: "UPLOAD_FAILED", message: "Could not upload file. Please try again." },
      { status: 500 }
    );
  }
}
