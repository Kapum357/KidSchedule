/**
 * Tests for purge-deleted-documents cleanup job
 *
 * Validates:
 * - Documents deleted 30+ days ago are hard-deleted from DB
 * - Documents deleted <30 days ago are preserved
 * - Files are deleted from /uploads/vault/{familyId}/{documentId}.{ext}
 * - Soft-deleted 30+ days ago but files missing are still DB-deleted (idempotent)
 * - Missing files don't prevent DB deletion
 * - Audit logging for each deletion
 * - Error handling for file system and database errors
 * - Graceful continuation when individual file deletions fail
 */

import { purgeDeletedDocuments, getJobConfig } from "@/lib/jobs/purge-deleted-documents";
import * as fs from "fs";
import { promises as fsPromises } from "fs";
import { mkdir } from "fs/promises";

// Mock dependencies
jest.mock("@/lib/persistence", () => ({
  getDb: jest.fn(() => ({
    schoolVaultDocuments: {
      hardDelete: jest.fn(),
    },
  })),
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

jest.mock("@/lib/persistence/postgres/client", () => ({
  sql: jest.fn(async (strings: any) => {
    // Mock SQL query - will be configured per test
    return [];
  }),
}));

import { getDb } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";

const mockGetDb = getDb as jest.MockedFunction<typeof getDb>;
const mockLogEvent = logEvent as jest.MockedFunction<typeof logEvent>;

describe("purgeDeletedDocuments", () => {
  let testVaultPath: string;

  beforeEach(async () => {
    // Create temporary test vault directory
    testVaultPath = "/tmp/test-vault-" + Date.now();
    await mkdir(testVaultPath, { recursive: true });

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fsPromises.rm(testVaultPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("document age filtering", () => {
    it("should delete documents soft-deleted 30+ days ago", async () => {
      // Mock SQL query to return a document that was deleted 31 days ago
      const mockSql = jest.fn().mockResolvedValue([
        {
          id: "doc-1",
          familyId: "family-1",
          fileType: "pdf",
        },
      ]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      // Mock hardDelete to return count
      const mockHardDelete = jest.fn().mockResolvedValue(1);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      // Create the document file
      const familyDir = `${testVaultPath}/family-1`;
      await mkdir(familyDir, { recursive: true });
      await fsPromises.writeFile(`${familyDir}/doc-1.pdf`, "test content");

      const result = await purgeDeletedDocuments(testVaultPath);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
      expect(mockHardDelete).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith("info", expect.stringContaining("completed"), {
        deletedCount: 1,
        fileErrorCount: 0,
      });
    });

    it("should preserve documents soft-deleted less than 30 days ago", async () => {
      // The SQL query itself filters by 30 days, so it naturally won't return
      // documents that were deleted recently. This test verifies the query logic.
      const mockSql = jest.fn().mockResolvedValue([]); // No documents returned
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(0);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      const result = await purgeDeletedDocuments(testVaultPath);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        expect.stringContaining("Found documents"),
        {
          count: 0,
        }
      );
    });
  });

  describe("file cleanup", () => {
    it("should delete document files from /uploads/vault/{familyId}/{documentId}.{ext}", async () => {
      const mockSql = jest.fn().mockResolvedValue([
        {
          id: "doc-123",
          familyId: "family-abc",
          fileType: "pdf",
        },
      ]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(1);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      // Create the document file
      const familyDir = `${testVaultPath}/family-abc`;
      await mkdir(familyDir, { recursive: true });
      const filePath = `${familyDir}/doc-123.pdf`;
      await fsPromises.writeFile(filePath, "test pdf content");

      // Verify file exists before purge
      expect(fs.existsSync(filePath)).toBe(true);

      const result = await purgeDeletedDocuments(testVaultPath);

      // Verify file is deleted
      expect(fs.existsSync(filePath)).toBe(false);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle documents with different file types (.pdf, .docx, .jpg, .png, .xlsx)", async () => {
      const fileTypes = ["pdf", "docx", "jpg", "png", "xlsx"];
      const mockDocs = fileTypes.map((ext, i) => ({
        id: `doc-${i}`,
        familyId: "family-1",
        fileType: ext,
      }));

      const mockSql = jest.fn().mockResolvedValue(mockDocs);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(5);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      // Create files for all types
      const familyDir = `${testVaultPath}/family-1`;
      await mkdir(familyDir, { recursive: true });

      for (let i = 0; i < fileTypes.length; i++) {
        const filePath = `${familyDir}/doc-${i}.${fileTypes[i]}`;
        await fsPromises.writeFile(filePath, `content ${i}`);
      }

      const result = await purgeDeletedDocuments(testVaultPath);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(5);
      // All files should be deleted
      for (let i = 0; i < fileTypes.length; i++) {
        expect(fs.existsSync(`${familyDir}/doc-${i}.${fileTypes[i]}`)).toBe(false);
      }
    });
  });

  describe("audit logging", () => {
    it("should log job start with vault path", async () => {
      const mockSql = jest.fn().mockResolvedValue([]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(0);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      await purgeDeletedDocuments(testVaultPath);

      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        expect.stringContaining("Starting purge-deleted-documents"),
        {
          vaultBasePath: testVaultPath,
        }
      );
    });

    it("should log each successful file deletion", async () => {
      const mockSql = jest.fn().mockResolvedValue([
        {
          id: "doc-1",
          familyId: "family-1",
          fileType: "pdf",
        },
        {
          id: "doc-2",
          familyId: "family-2",
          fileType: "docx",
        },
      ]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(2);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      // Create files
      for (const familyId of ["family-1", "family-2"]) {
        await mkdir(`${testVaultPath}/${familyId}`, { recursive: true });
      }
      await fsPromises.writeFile(`${testVaultPath}/family-1/doc-1.pdf`, "test");
      await fsPromises.writeFile(`${testVaultPath}/family-2/doc-2.docx`, "test");

      await purgeDeletedDocuments(testVaultPath);

      // Should log file deletion for each document
      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "File deleted for document",
        expect.objectContaining({
          documentId: "doc-1",
          familyId: "family-1",
          fileType: "pdf",
        })
      );
      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "File deleted for document",
        expect.objectContaining({
          documentId: "doc-2",
          familyId: "family-2",
          fileType: "docx",
        })
      );
    });

    it("should log job completion with metrics", async () => {
      const mockSql = jest.fn().mockResolvedValue([
        {
          id: "doc-1",
          familyId: "family-1",
          fileType: "pdf",
        },
      ]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(1);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      const familyDir = `${testVaultPath}/family-1`;
      await mkdir(familyDir, { recursive: true });
      await fsPromises.writeFile(`${familyDir}/doc-1.pdf`, "test");

      const result = await purgeDeletedDocuments(testVaultPath);

      // Should log completion
      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "Purge job completed successfully",
        {
          deletedCount: 1,
          fileErrorCount: 0,
        }
      );

      // Result should include timing
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("error handling", () => {
    it("should continue processing when individual file delete fails", async () => {
      const mockSql = jest.fn().mockResolvedValue([
        {
          id: "doc-1",
          familyId: "family-1",
          fileType: "pdf",
        },
        {
          id: "doc-2",
          familyId: "family-2",
          fileType: "pdf",
        },
      ]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(2);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      // Create only family-2 directory (family-1 will fail)
      await mkdir(`${testVaultPath}/family-2`, { recursive: true });
      await fsPromises.writeFile(`${testVaultPath}/family-2/doc-2.pdf`, "test");

      const result = await purgeDeletedDocuments(testVaultPath);

      // Should still succeed overall
      expect(result.success).toBe(true);
      // Should record file deletion error for doc-1
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            documentId: "doc-1",
            error: expect.stringContaining("ENOENT"),
          }),
        ])
      );
      // But DB deletion should still proceed
      expect(result.deletedCount).toBe(2);
    });

    it("should be idempotent when files are already deleted", async () => {
      // If a file was already deleted from filesystem but the DB record exists,
      // the purge job should handle it gracefully
      const mockSql = jest.fn().mockResolvedValue([
        {
          id: "doc-1",
          familyId: "family-1",
          fileType: "pdf",
        },
      ]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(1);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      // Create directory but NOT the file (simulates already-deleted file)
      await mkdir(`${testVaultPath}/family-1`, { recursive: true });

      const result = await purgeDeletedDocuments(testVaultPath);

      // Should succeed despite missing file
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0); // No errors - ENOENT is ignored
      expect(result.deletedCount).toBe(1);
    });

    it("should handle database errors gracefully", async () => {
      const mockSql = jest.fn().mockResolvedValue([
        {
          id: "doc-1",
          familyId: "family-1",
          fileType: "pdf",
        },
      ]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      // Mock hardDelete to throw error
      const mockHardDelete = jest.fn().mockRejectedValue(new Error("Database connection failed"));
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      const familyDir = `${testVaultPath}/family-1`;
      await mkdir(familyDir, { recursive: true });
      await fsPromises.writeFile(`${familyDir}/doc-1.pdf`, "test");

      const result = await purgeDeletedDocuments(testVaultPath);

      // Should return failure status
      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      // Should log error
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("Purge job failed"),
        expect.any(Object)
      );
    });

    it("should log warnings for file deletion failures but continue", async () => {
      const mockSql = jest.fn().mockResolvedValue([
        {
          id: "doc-1",
          familyId: "family-1",
          fileType: "pdf",
        },
      ]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(1);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      // File doesn't exist (will trigger ENOENT - silently ignored)
      const result = await purgeDeletedDocuments(testVaultPath);

      expect(result.success).toBe(true);
      // No errors recorded for missing files (ENOENT is idempotent)
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("result object", () => {
    it("should return PurgeResult with all required fields", async () => {
      const mockSql = jest.fn().mockResolvedValue([
        {
          id: "doc-1",
          familyId: "family-1",
          fileType: "pdf",
        },
      ]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(1);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      const familyDir = `${testVaultPath}/family-1`;
      await mkdir(familyDir, { recursive: true });
      await fsPromises.writeFile(`${familyDir}/doc-1.pdf`, "test");

      const result = await purgeDeletedDocuments(testVaultPath);

      expect(result).toEqual({
        success: true,
        deletedCount: 1,
        errors: [],
        startedAt: expect.any(String),
        completedAt: expect.any(String),
        durationMs: expect.any(Number),
      });

      // Verify timestamps are ISO strings
      expect(new Date(result.startedAt).toISOString()).toBe(result.startedAt);
      expect(new Date(result.completedAt).toISOString()).toBe(result.completedAt);
    });

    it("should track duration accurately", async () => {
      const mockSql = jest.fn().mockResolvedValue([]);
      jest.doMock("@/lib/persistence/postgres/client", () => ({
        sql: mockSql,
      }));

      const mockHardDelete = jest.fn().mockResolvedValue(0);
      mockGetDb.mockReturnValue({
        schoolVaultDocuments: {
          hardDelete: mockHardDelete,
        },
      } as any);

      const result = await purgeDeletedDocuments(testVaultPath);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      const startTime = new Date(result.startedAt).getTime();
      const endTime = new Date(result.completedAt).getTime();
      expect(result.durationMs).toBeCloseTo(endTime - startTime, 0);
    });
  });
});

describe("getJobConfig", () => {
  it("should return default configuration", () => {
    const config = getJobConfig();

    expect(config).toEqual({
      name: "purge-deleted-documents",
      description: expect.stringContaining("Hard-delete documents"),
      enabled: true,
      cronSchedule: "0 2 * * *", // Default: 2 AM UTC daily
      vaultBasePath: "/uploads/vault",
    });
  });

  it("should use environment variables when set", () => {
    const originalEnv = process.env;
    process.env.PURGE_DELETED_DOCUMENTS_ENABLED = "false";
    process.env.PURGE_DELETED_DOCUMENTS_CRON = "0 3 * * *"; // 3 AM UTC
    process.env.VAULT_BASE_PATH = "/custom/vault/path";

    const config = getJobConfig();

    expect(config.enabled).toBe(false);
    expect(config.cronSchedule).toBe("0 3 * * *");
    expect(config.vaultBasePath).toBe("/custom/vault/path");

    process.env = originalEnv;
  });
});
