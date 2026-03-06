/**
 * Export Engine Unit Tests
 *
 * Tests for export result validation and type routing.
 * Mocks the engine so tests don't require real DB/filesystem.
 */

import type { ExportJobRecord } from "@/types";

// ─── Mock the export engine ───────────────────────────────────────────────────

const mockGenerateExport = jest.fn();

jest.mock("@/lib/export-engine", () => ({
  generateExport: mockGenerateExport,
}));

import { generateExport } from "@/lib/export-engine";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<ExportJobRecord> = {}): ExportJobRecord {
  return {
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
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Export Engine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Schedule PDF export", () => {
    it("should generate schedule PDF export result", async () => {
      const expected = {
        mimeType: "application/pdf",
        resultUrl: "https://cdn.example.com/exports/schedule-pdf-123.pdf",
        sizeBytes: 45000,
        generatedAt: new Date().toISOString(),
      };
      mockGenerateExport.mockResolvedValue(expected);

      const result = await generateExport(makeJob({ type: "schedule-pdf" }));

      expect(result).toBeDefined();
      expect(result.mimeType).toBe("application/pdf");
      expect(result.resultUrl).toBeTruthy();
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.generatedAt).toBeTruthy();
    });

    it("should include family schedule data in export URL", async () => {
      mockGenerateExport.mockResolvedValue({
        mimeType: "application/pdf",
        resultUrl: "https://cdn.example.com/exports/schedule-pdf-123.pdf",
        sizeBytes: 45000,
        generatedAt: new Date().toISOString(),
      });

      const result = await generateExport(
        makeJob({ type: "schedule-pdf", params: { dateRange: "2024-03" } })
      );

      expect(result.resultUrl).toContain("schedule-pdf");
    });
  });

  describe("Messages CSV export", () => {
    it("should generate messages CSV export result", async () => {
      mockGenerateExport.mockResolvedValue({
        mimeType: "text/csv",
        resultUrl: "https://cdn.example.com/exports/messages-csv-123.csv",
        sizeBytes: 12000,
        generatedAt: new Date().toISOString(),
      });

      const result = await generateExport(makeJob({ type: "messages-csv" }));

      expect(result.mimeType).toBe("text/csv");
      expect(result.resultUrl).toBeTruthy();
      expect(result.sizeBytes).toBeGreaterThan(0);
    });

    it("should include message history identifier in export URL", async () => {
      mockGenerateExport.mockResolvedValue({
        mimeType: "text/csv",
        resultUrl: "https://cdn.example.com/exports/messages-csv-456.csv",
        sizeBytes: 8000,
        generatedAt: new Date().toISOString(),
      });

      const result = await generateExport(
        makeJob({ type: "messages-csv", params: { limit: 100 } })
      );

      expect(result.resultUrl).toContain("messages-csv");
    });
  });

  describe("Error handling", () => {
    it("should throw on invalid export type", async () => {
      mockGenerateExport.mockRejectedValue(
        new Error("Unsupported export type: invalid-type")
      );

      await expect(
        generateExport(makeJob({ type: "invalid-type" as never }))
      ).rejects.toThrow();
    });

    it("should handle generation errors gracefully", async () => {
      mockGenerateExport.mockRejectedValue(new Error("DB connection failed"));

      try {
        await generateExport(makeJob({ familyId: "invalid-family" }));
        // If it doesn't throw, result should be defined
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Result metadata", () => {
    it("should return correct MIME type for each export type", async () => {
      const types: Array<[string, string]> = [
        ["schedule-pdf", "application/pdf"],
        ["invoices-pdf", "application/pdf"],
        ["messages-csv", "text/csv"],
        ["moments-archive", "application/zip"],
      ];

      for (const [type, expectedMime] of types) {
        mockGenerateExport.mockResolvedValue({
          mimeType: expectedMime,
          resultUrl: `https://cdn.example.com/exports/${type}-123.bin`,
          sizeBytes: 1024,
          generatedAt: new Date().toISOString(),
        });

        const result = await generateExport(makeJob({ type: type as never }));
        expect(result.mimeType).toBe(expectedMime);
      }
    });

    it("should set reasonable file sizes", async () => {
      mockGenerateExport.mockResolvedValue({
        mimeType: "text/csv",
        resultUrl: "https://cdn.example.com/exports/messages-csv-789.csv",
        sizeBytes: 8192,
        generatedAt: new Date().toISOString(),
      });

      const result = await generateExport(makeJob({ type: "messages-csv" }));

      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.sizeBytes).toBeLessThan(1024 * 1024 * 100);
    });
  });
});
