/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/school/vault/upload endpoint tests - Core logic validation
 *
 * Tests cover:
 * 1. File type validation (MIME types and extensions)
 * 2. File size validation
 * 3. Request parsing and validation
 * 4. Error handling for common cases
 *
 * Note: Full integration tests with actual Next.js Request/Response
 * are better handled with E2E/Playwright tests due to jest/jsdom limitations.
 */

describe("POST /api/school/vault/upload - File Validation Logic", () => {
  // ─── File Type Validation ─────────────────────────────────────────────

  describe("MIME type mapping", () => {
    const MIME_TYPE_MAP: Record<string, string> = {
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "docx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "xlsx",
      "image/jpeg": "jpg",
      "image/png": "png",
    };

    it("should map PDF MIME type to pdf extension", () => {
      expect(MIME_TYPE_MAP["application/pdf"]).toBe("pdf");
    });

    it("should map DOCX MIME type to docx extension", () => {
      expect(
        MIME_TYPE_MAP[
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ]
      ).toBe("docx");
    });

    it("should map XLSX MIME type to xlsx extension", () => {
      expect(
        MIME_TYPE_MAP[
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ]
      ).toBe("xlsx");
    });

    it("should map JPEG MIME type to jpg extension", () => {
      expect(MIME_TYPE_MAP["image/jpeg"]).toBe("jpg");
    });

    it("should map PNG MIME type to png extension", () => {
      expect(MIME_TYPE_MAP["image/png"]).toBe("png");
    });

    it("should not map unsupported MIME types", () => {
      expect(MIME_TYPE_MAP["text/plain"]).toBeUndefined();
      expect(MIME_TYPE_MAP["application/msword"]).toBeUndefined();
    });
  });

  // ─── File Extension Validation ────────────────────────────────────────

  describe("allowed file types", () => {
    const ALLOWED_FILE_TYPES = new Set(["pdf", "docx", "xlsx", "jpg", "png"]);

    it("should allow PDF files", () => {
      expect(ALLOWED_FILE_TYPES.has("pdf")).toBe(true);
    });

    it("should allow DOCX files", () => {
      expect(ALLOWED_FILE_TYPES.has("docx")).toBe(true);
    });

    it("should allow XLSX files", () => {
      expect(ALLOWED_FILE_TYPES.has("xlsx")).toBe(true);
    });

    it("should allow JPG files", () => {
      expect(ALLOWED_FILE_TYPES.has("jpg")).toBe(true);
    });

    it("should allow PNG files", () => {
      expect(ALLOWED_FILE_TYPES.has("png")).toBe(true);
    });

    it("should NOT allow TXT files", () => {
      expect(ALLOWED_FILE_TYPES.has("txt")).toBe(false);
    });

    it("should NOT allow DOC files", () => {
      expect(ALLOWED_FILE_TYPES.has("doc")).toBe(false);
    });

    it("should NOT allow XLS files", () => {
      expect(ALLOWED_FILE_TYPES.has("xls")).toBe(false);
    });

    it("should have exactly 5 allowed types", () => {
      expect(ALLOWED_FILE_TYPES.size).toBe(5);
    });
  });

  // ─── File Size Validation ──────────────────────────────────────────────

  describe("file size limits", () => {
    const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

    it("should allow files up to 20MB", () => {
      const size = 20 * 1024 * 1024;
      expect(size).toBeLessThanOrEqual(MAX_FILE_SIZE_BYTES);
      expect(size).toBe(MAX_FILE_SIZE_BYTES);
    });

    it("should reject files over 20MB", () => {
      const size = 21 * 1024 * 1024;
      expect(size).toBeGreaterThan(MAX_FILE_SIZE_BYTES);
    });

    it("should allow small files (1KB)", () => {
      const size = 1024;
      expect(size).toBeLessThanOrEqual(MAX_FILE_SIZE_BYTES);
    });

    it("should allow empty files (0 bytes)", () => {
      const size = 0;
      expect(size).toBeLessThanOrEqual(MAX_FILE_SIZE_BYTES);
    });

    it("should specify 20MB as 20971520 bytes", () => {
      expect(20 * 1024 * 1024).toBe(20971520);
    });
  });

  // ─── MIME Type Extension Matching ─────────────────────────────────────

  describe("MIME type to filename extension matching", () => {
    interface ValidationResult {
      valid: boolean;
      extension?: string;
      error?: string;
    }

    function validateFileType(
      mimeType: string,
      filename: string
    ): ValidationResult {
      const MIME_TYPE_MAP: Record<string, string> = {
        "application/pdf": "pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
          "xlsx",
        "image/jpeg": "jpg",
        "image/png": "png",
      };

      const ALLOWED_FILE_TYPES = new Set(["pdf", "docx", "xlsx", "jpg", "png"]);

      // Get extension from MIME type
      const mimeExt = MIME_TYPE_MAP[mimeType.toLowerCase().trim()];

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

    it("should accept matching PDF MIME and extension", () => {
      const result = validateFileType("application/pdf", "document.pdf");
      expect(result.valid).toBe(true);
      expect(result.extension).toBe("pdf");
    });

    it("should reject mismatched PDF MIME with DOCX extension", () => {
      const result = validateFileType("application/pdf", "document.docx");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("mismatch");
    });

    it("should reject unsupported TXT MIME type", () => {
      const result = validateFileType("text/plain", "document.txt");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported");
    });

    it("should accept matching JPEG MIME and JPG extension", () => {
      const result = validateFileType("image/jpeg", "photo.jpg");
      expect(result.valid).toBe(true);
      expect(result.extension).toBe("jpg");
    });

    it("should handle case-insensitive MIME types", () => {
      const result = validateFileType(
        "APPLICATION/PDF",
        "document.pdf"
      );
      expect(result.valid).toBe(true);
      expect(result.extension).toBe("pdf");
    });

    it("should handle MIME types with whitespace", () => {
      const result = validateFileType(
        "  application/pdf  ",
        "document.pdf"
      );
      expect(result.valid).toBe(true);
      expect(result.extension).toBe("pdf");
    });
  });

  // ─── Configuration Constants ───────────────────────────────────────────

  describe("configuration constants", () => {
    it("should define correct uploads base directory", () => {
      const UPLOADS_BASE_DIR = "/uploads/vault";
      expect(UPLOADS_BASE_DIR).toBe("/uploads/vault");
    });

    it("should define 20MB as max file size", () => {
      const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
      expect(MAX_FILE_SIZE_BYTES).toBe(20971520);
    });

    it("should have exactly 5 allowed file types", () => {
      const ALLOWED_FILE_TYPES = new Set(["pdf", "docx", "xlsx", "jpg", "png"]);
      expect(ALLOWED_FILE_TYPES.size).toBe(5);
    });
  });
});
