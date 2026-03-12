/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Public Export Verification API Tests
 *
 * Tests for POST /api/exports/verify endpoint.
 * Uses Jest mocks — no real DB connection required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockExportShareTokens = {
  findByToken: jest.fn(),
  updateAccessCount: jest.fn(),
};

const mockExportJobs = {
  findById: jest.fn(),
};

const mockExportMetadata = {
  findByExportId: jest.fn(),
};

const mockExportMessageHashes = {
  findByExportMetadataId: jest.fn(),
};

jest.mock("@/lib/persistence", () => ({
  getDb: jest.fn(() => ({
    exportShareTokens: mockExportShareTokens,
    exportJobs: mockExportJobs,
    exportMetadata: mockExportMetadata,
    exportMessageHashes: mockExportMessageHashes,
  })),
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => {
      const response = {
        status: init?.status || 200,
        body,
        json: jest.fn().mockResolvedValue(body),
      };
      return response;
    }),
  },
}));

// ─── Helper to create mock NextRequest ──────────────────────────────────────────

function createMockRequest(body: object, headers: Record<string, string> = {}) {
  return {
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    json: jest.fn().mockResolvedValue(body),
    headers: new Map(Object.entries(headers)),
    method: "POST",
    url: "http://localhost:3000/api/exports/verify",
  };
}

// ─── Imports ──────────────────────────────────────────────────────────────────

import { POST } from "@/app/api/exports/verify/route";
import { logEvent } from "@/lib/observability/logger";

const mockLogEvent = logEvent as jest.Mock;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/exports/verify (Public Verification)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("validation", () => {
    it("should return 400 when exportId is missing", async () => {
      const request = createMockRequest({
        token: "valid-token",
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Missing exportId or token");
    });

    it("should return 400 when token is missing", async () => {
      const request = createMockRequest({
        exportId: "export-1",
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Missing exportId or token");
    });

    it("should return 400 when body is invalid JSON", async () => {
      const request = {
        text: jest.fn().mockResolvedValue("not-json"),
        json: jest.fn().mockRejectedValue(new Error("Invalid JSON")),
        headers: new Map([["x-forwarded-for", "192.168.1.1"]]),
        method: "POST",
        url: "http://localhost:3000/api/exports/verify",
      };

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid request body");
    });
  });

  describe("token validation", () => {
    it("should return 400 with 'invalid_token' when token does not exist", async () => {
      mockExportShareTokens.findByToken.mockResolvedValue(null);

      const request = createMockRequest(
        {
          exportId: "export-1",
          token: "invalid-token",
        },
        { "x-forwarded-for": "192.168.1.1" }
      );

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.verified).toBe(false);
      expect(body.reason).toBe("invalid_token");
    });

    it("should return 400 with 'expired_token' when token is expired", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockExportShareTokens.findByToken.mockResolvedValue({
        id: "token-1",
        exportId: "export-1",
        token: "test-token",
        expiresAt: yesterday.toISOString(),
        scope: "external",
        createdAt: new Date().toISOString(),
        accessCount: 0,
        createdByUserId: "user-1",
      });

      const request = createMockRequest(
        {
          exportId: "export-1",
          token: "test-token",
        },
        { "x-forwarded-for": "192.168.1.1" }
      );

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.verified).toBe(false);
      expect(body.reason).toBe("expired_token");
    });

    it("should return 400 with 'token_mismatch' when token belongs to different export", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      mockExportShareTokens.findByToken.mockResolvedValue({
        id: "token-1",
        exportId: "export-2",
        token: "test-token",
        expiresAt: tomorrow.toISOString(),
        scope: "external",
        createdAt: new Date().toISOString(),
        accessCount: 0,
        createdByUserId: "user-1",
      });

      const request = createMockRequest(
        {
          exportId: "export-1",
          token: "test-token",
        },
        { "x-forwarded-for": "192.168.1.1" }
      );

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.verified).toBe(false);
      expect(body.reason).toBe("token_mismatch");
    });
  });

  describe("happy path - valid token, successful verification", () => {
    it("should return 200 with verified=true when all checks pass", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      mockExportShareTokens.findByToken.mockResolvedValue({
        id: "token-1",
        exportId: "export-1",
        token: "valid-token",
        expiresAt: tomorrow.toISOString(),
        scope: "external",
        createdAt: new Date().toISOString(),
        accessCount: 0,
        createdByUserId: "user-1",
      });

      mockExportShareTokens.updateAccessCount.mockResolvedValue(undefined);

      mockExportJobs.findById.mockResolvedValue({
        id: "export-1",
        familyId: "family-1",
        type: "pdf",
        status: "complete",
        createdAt: new Date().toISOString(),
      });

      const pdfHash = "da39a3ee5e6b4b0d3255bfef95601890afd80709";
      mockExportMetadata.findByExportId.mockResolvedValue({
        id: "metadata-1",
        exportId: "export-1",
        familyId: "family-1",
        reportType: "message-transcript",
        pdfHash,
        pdfSizeBytes: 5000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        includedMessageIds: [],
      });

      mockExportMessageHashes.findByExportMetadataId.mockResolvedValue([
        {
          id: "hash-1",
          exportMetadataId: "metadata-1",
          messageId: "msg-1",
          chainIndex: 0,
          messageHash: "abc123",
          previousHash: "",
          sentAt: new Date().toISOString(),
          senderId: "user-1",
          createdAt: new Date().toISOString(),
        },
      ]);

      const request = createMockRequest(
        {
          exportId: "export-1",
          token: "valid-token",
        },
        { "x-forwarded-for": "192.168.1.1" }
      );

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.verified).toBe(true);
      expect(body.verifiedAt).toBeDefined();

      expect(mockExportShareTokens.updateAccessCount).toHaveBeenCalledWith("token-1");

      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "Public verification attempt",
        expect.objectContaining({
          exportId: "export-1",
          tokenId: "token-1",
          verified: true,
        })
      );
    });

    it("should return export_not_found when export does not exist", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      mockExportShareTokens.findByToken.mockResolvedValue({
        id: "token-1",
        exportId: "export-1",
        token: "valid-token",
        expiresAt: tomorrow.toISOString(),
        scope: "external",
        createdAt: new Date().toISOString(),
        accessCount: 0,
        createdByUserId: "user-1",
      });

      mockExportJobs.findById.mockResolvedValue(null);

      const request = createMockRequest(
        {
          exportId: "export-1",
          token: "valid-token",
        },
        { "x-forwarded-for": "192.168.1.1" }
      );

      const response = await POST(request as any);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.verified).toBe(false);
      expect(body.reason).toBe("export_not_found");
    });

    it("should verify message chain validity", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      mockExportShareTokens.findByToken.mockResolvedValue({
        id: "token-1",
        exportId: "export-1",
        token: "valid-token",
        expiresAt: tomorrow.toISOString(),
        scope: "external",
        createdAt: new Date().toISOString(),
        accessCount: 0,
        createdByUserId: "user-1",
      });

      mockExportShareTokens.updateAccessCount.mockResolvedValue(undefined);

      mockExportJobs.findById.mockResolvedValue({
        id: "export-1",
        familyId: "family-1",
        type: "pdf",
        status: "complete",
      });

      mockExportMetadata.findByExportId.mockResolvedValue({
        id: "metadata-1",
        exportId: "export-1",
        familyId: "family-1",
        reportType: "message-transcript",
        pdfHash: "test-hash",
        pdfSizeBytes: 5000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        includedMessageIds: ["msg-1", "msg-2"],
      });

      mockExportMessageHashes.findByExportMetadataId.mockResolvedValue([
        {
          id: "hash-1",
          exportMetadataId: "metadata-1",
          messageId: "msg-1",
          chainIndex: 0,
          messageHash: "abc123",
          previousHash: "",
          sentAt: new Date().toISOString(),
          senderId: "user-1",
          createdAt: new Date().toISOString(),
        },
        {
          id: "hash-2",
          exportMetadataId: "metadata-1",
          messageId: "msg-2",
          chainIndex: 1,
          messageHash: "def456",
          previousHash: "abc123",
          sentAt: new Date().toISOString(),
          senderId: "user-2",
          createdAt: new Date().toISOString(),
        },
      ]);

      const request = createMockRequest(
        {
          exportId: "export-1",
          token: "valid-token",
        },
        { "x-forwarded-for": "192.168.1.1" }
      );

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.chainValid).toBe(true);
    });
  });

  describe("rate limiting", () => {
    it("should allow requests under the limit", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      mockExportShareTokens.findByToken.mockResolvedValue({
        id: "token-1",
        exportId: "export-1",
        token: "valid-token",
        expiresAt: tomorrow.toISOString(),
        scope: "external",
        createdAt: new Date().toISOString(),
        accessCount: 0,
        createdByUserId: "user-1",
      });

      mockExportShareTokens.updateAccessCount.mockResolvedValue(undefined);

      mockExportJobs.findById.mockResolvedValue({
        id: "export-1",
        familyId: "family-1",
        type: "pdf",
        status: "complete",
      });

      mockExportMetadata.findByExportId.mockResolvedValue({
        id: "metadata-1",
        exportId: "export-1",
        familyId: "family-1",
        reportType: "message-transcript",
        pdfHash: "test-hash",
        pdfSizeBytes: 5000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        includedMessageIds: [],
      });

      mockExportMessageHashes.findByExportMetadataId.mockResolvedValue([]);

      // Make 3 requests under the limit
      for (let i = 0; i < 3; i++) {
        const request = createMockRequest(
          {
            exportId: "export-1",
            token: "valid-token",
          },
          { "x-forwarded-for": "192.168.1.2" }
        );

        const response = await POST(request as any);
        expect(response.status).toBe(200);
      }
    });

    it("should rate limit after exceeding 10 requests per IP", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      mockExportShareTokens.findByToken.mockResolvedValue({
        id: "token-1",
        exportId: "export-1",
        token: "valid-token",
        expiresAt: tomorrow.toISOString(),
        scope: "external",
        createdAt: new Date().toISOString(),
        accessCount: 0,
        createdByUserId: "user-1",
      });

      mockExportShareTokens.updateAccessCount.mockResolvedValue(undefined);

      mockExportJobs.findById.mockResolvedValue({
        id: "export-1",
        familyId: "family-1",
        type: "pdf",
        status: "complete",
      });

      mockExportMetadata.findByExportId.mockResolvedValue({
        id: "metadata-1",
        exportId: "export-1",
        familyId: "family-1",
        reportType: "message-transcript",
        pdfHash: "test-hash",
        pdfSizeBytes: 5000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        includedMessageIds: [],
      });

      mockExportMessageHashes.findByExportMetadataId.mockResolvedValue([]);

      // Make 10 successful requests
      for (let i = 0; i < 10; i++) {
        const request = createMockRequest(
          {
            exportId: "export-1",
            token: "valid-token",
          },
          { "x-forwarded-for": "192.168.1.3" }
        );

        const response = await POST(request as any);
        expect(response.status).toBe(200);
      }

      // 11th request should be rate limited
      const rateLimitedRequest = createMockRequest(
        {
          exportId: "export-1",
          token: "valid-token",
        },
        { "x-forwarded-for": "192.168.1.3" }
      );

      const response = await POST(rateLimitedRequest as any);
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe("Rate limit exceeded");
    });
  });

  describe("logging", () => {
    it("should log successful verification attempts", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      mockExportShareTokens.findByToken.mockResolvedValue({
        id: "token-1",
        exportId: "export-1",
        token: "valid-token",
        expiresAt: tomorrow.toISOString(),
        scope: "external",
        createdAt: new Date().toISOString(),
        accessCount: 0,
        createdByUserId: "user-1",
      });

      mockExportShareTokens.updateAccessCount.mockResolvedValue(undefined);

      mockExportJobs.findById.mockResolvedValue({
        id: "export-1",
        familyId: "family-1",
        type: "pdf",
        status: "complete",
      });

      mockExportMetadata.findByExportId.mockResolvedValue({
        id: "metadata-1",
        exportId: "export-1",
        familyId: "family-1",
        reportType: "message-transcript",
        pdfHash: "test-hash",
        pdfSizeBytes: 5000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        includedMessageIds: [],
      });

      mockExportMessageHashes.findByExportMetadataId.mockResolvedValue([]);

      const request = createMockRequest(
        {
          exportId: "export-1",
          token: "valid-token",
        },
        { "x-forwarded-for": "192.168.1.1" }
      );

      await POST(request as any);

      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "Public verification attempt",
        expect.objectContaining({
          exportId: "export-1",
          tokenId: "token-1",
          verified: true,
          ipAddress: "192.168.1.1",
        })
      );
    });

    it("should log invalid token attempts", async () => {
      mockExportShareTokens.findByToken.mockResolvedValue(null);

      const request = createMockRequest(
        {
          exportId: "export-1",
          token: "invalid-token",
        },
        { "x-forwarded-for": "192.168.1.1" }
      );

      await POST(request as any);

      expect(mockLogEvent).toHaveBeenCalledWith(
        "warn",
        "Public verification: invalid token",
        expect.objectContaining({
          exportId: "export-1",
          ipAddress: "192.168.1.1",
        })
      );
    });
  });
});
