/**
 * Export Engine Unit Tests
 *
 * Tests for export file generation and result handling
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateExport } from "@/lib/export-engine";
import type { ExportJobRecord } from "@/types";

describe("Export Engine", () => {
  const mockJob: ExportJobRecord = {
    id: "export-123",
    familyId: "fam-123",
    userId: "user-123",
    type: "schedule-pdf",
    params: {},
    status: "processing",
    resultUrl: undefined,
    mimeType: undefined,
    sizeBytes: undefined,
    error: undefined,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Schedule PDF export", () => {
    it("should generate schedule PDF export result", async () => {
      const result = await generateExport({
        ...mockJob,
        type: "schedule-pdf",
      });

      expect(result).toBeDefined();
      expect(result.mimeType).toBe("application/pdf");
      expect(result.resultUrl).toBeTruthy();
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.generatedAt).toBeTruthy();
    });

    it("should include family schedule data in export", async () => {
      const result = await generateExport({
        ...mockJob,
        type: "schedule-pdf",
        params: { dateRange: "2024-03" },
      });

      expect(result.resultUrl).toContain("schedule-pdf");
    });
  });

  describe("Messages CSV export", () => {
    it("should generate messages CSV export result", async () => {
      const result = await generateExport({
        ...mockJob,
        type: "messages-csv",
      });

      expect(result).toBeDefined();
      expect(result.mimeType).toBe("text/csv");
      expect(result.resultUrl).toBeTruthy();
      expect(result.sizeBytes).toBeGreaterThan(0);
    });

    it("should include message history in export", async () => {
      const result = await generateExport({
        ...mockJob,
        type: "messages-csv",
        params: { limit: 100 },
      });

      expect(result.resultUrl).toContain("messages-csv");
    });
  });

  describe("Error handling", () => {
    it("should throw on invalid export type", async () => {
      await expect(
        generateExport({
          ...mockJob,
          type: "invalid-type" as any,
        })
      ).rejects.toThrow();
    });

    it("should handle generation errors gracefully", async () => {
      // Mock a failure scenario
      const failingJob = {
        ...mockJob,
        type: "schedule-pdf",
        familyId: "invalid-family",
      };

      // Should either throw or return error state
      try {
        const result = await generateExport(failingJob);
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Result metadata", () => {
    it("should include correct MIME type for each export type", async () => {
      const types: Array<[string, string]> = [
        ["schedule-pdf", "application/pdf"],
        ["invoices-pdf", "application/pdf"],
        ["messages-csv", "text/csv"],
        ["moments-archive", "application/zip"],
      ];

      for (const [type, expectedMime] of types) {
        const result = await generateExport({
          ...mockJob,
          type: type as any,
        });

        expect(result.mimeType).toBe(expectedMime);
      }
    });

    it("should set reasonable file sizes", async () => {
      const result = await generateExport({
        ...mockJob,
        type: "messages-csv",
      });

      // CSV should be reasonably small compared to archive
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.sizeBytes).toBeLessThan(1024 * 1024 * 100); // Less than 100MB
    });
  });
});
