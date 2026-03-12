/**
 * Export Verification Full Flow Integration Test
 *
 * End-to-end test: export → share token → public verify → audit log
 * Uses Jest mocks to simulate database and API interactions.
 * This is a single happy-path test following KISS principle.
 */

// ─── Mock Setup ────────────────────────────────────────────────────────────

// Mock crypto.randomUUID for request ID generation
if (!global.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.crypto = {} as any;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.crypto.randomUUID = jest.fn(() => "request-id-123") as any;

// Database mocks
const mockFamilies = {
  create: jest.fn(),
  findById: jest.fn(),
};

const mockParents = {
  create: jest.fn(),
  findByUserId: jest.fn(),
};

const mockSchedules = {
  findByFamilyId: jest.fn(),
};

const mockExportJobs = {
  create: jest.fn(),
  findById: jest.fn(),
};

const mockExportMetadata = {
  findByExportId: jest.fn(),
};

const mockExportMessageHashes = {
  findByExportMetadataId: jest.fn(),
};

const mockExportShareTokens = {
  create: jest.fn(),
  findByToken: jest.fn(),
  updateAccessCount: jest.fn(),
};

const mockExportVerificationAttempts = {
  findByExportMetadataId: jest.fn(),
  create: jest.fn(),
};

jest.mock("@/lib/persistence", () => ({
  getDb: jest.fn(() => ({
    families: mockFamilies,
    parents: mockParents,
    schedules: mockSchedules,
    exportJobs: mockExportJobs,
    exportMetadata: mockExportMetadata,
    exportMessageHashes: mockExportMessageHashes,
    exportShareTokens: mockExportShareTokens,
    exportVerificationAttempts: mockExportVerificationAttempts,
  })),
}));

// Mock API utilities
jest.mock("@/app/api/calendar/utils", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NextResponse = require("next/server").NextResponse;
  return {
    getAuthenticatedUser: jest.fn(),
    badRequest: jest.fn((error: string, message: string) =>
      NextResponse.json({ error, message }, { status: 400 })
    ),
    unauthorized: jest.fn((error?: string, message?: string) =>
      NextResponse.json(
        { error: error || "unauthorized", message: message || "Authentication required" },
        { status: 401 }
      )
    ),
    notFound: jest.fn((error: string, message: string) =>
      NextResponse.json({ error, message }, { status: 404 })
    ),
  };
});

// Mock observability
jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

// Mock NextResponse
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

// ─── Imports ──────────────────────────────────────────────────────────────

import { POST as postShare } from "@/app/api/exports/[id]/share/route";
import { POST as postVerify } from "@/app/api/exports/verify/route";
import { GET as getAuditLog } from "@/app/api/exports/[id]/audit-log/route";
import { getAuthenticatedUser } from "@/app/api/calendar/utils";
import { logEvent } from "@/lib/observability/logger";

const mockGetAuthenticatedUser = getAuthenticatedUser as jest.Mock;
const mockLogEvent = logEvent as jest.Mock;

// ─── Test Data Fixtures ────────────────────────────────────────────────────

const createMockRequest = (body: object, method = "POST", headers: Record<string, string> = {}) => {
  return {
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    json: jest.fn().mockResolvedValue(body),
    headers: new Map(Object.entries(headers)),
    method,
    url: "http://localhost:3000/api",
  };
};

const createMockNextRequest = (body: object, method = "POST", headers: Record<string, string> = {}) => {
  return {
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    json: jest.fn().mockResolvedValue(body),
    headers: new Map(Object.entries(headers)),
    method,
    url: "http://localhost:3000/api",
  };
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Export Verification Full Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Export → Generate Share Token → Public Verify → Audit Log", async () => {
    // Test IDs and data
    const familyId = "family-1";
    const parentId = "parent-1";
    const userId = "user-1";
    const scheduleId = "schedule-1";
    const exportId = "export-1";
    const metadataId = "metadata-1";
    const tokenId = "token-1";
    const token = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const pdfHash = "da39a3ee5e6b4b0d3255bfef95601890afd80709";

    // ─── Step 1: Create family ───────────────────────────────────────────
    const mockFamily = {
      id: familyId,
      name: "Test Family",
      createdAt: new Date().toISOString(),
    };
    mockFamilies.create.mockResolvedValue(mockFamily);
    mockFamilies.findById.mockResolvedValue(mockFamily);

    // ─── Step 2: Create parent ───────────────────────────────────────────
    const mockParent = {
      id: parentId,
      userId,
      familyId,
      email: "parent@example.com",
      createdAt: new Date().toISOString(),
    };
    mockParents.create.mockResolvedValue(mockParent);
    mockParents.findByUserId.mockResolvedValue(mockParent);
    mockGetAuthenticatedUser.mockResolvedValue({ userId, familyId });

    // ─── Step 3: Create schedule ────────────────────────────────────────
    const mockSchedule = {
      id: scheduleId,
      familyId,
      type: "weekly",
      createdAt: new Date().toISOString(),
    };
    mockSchedules.findByFamilyId.mockResolvedValue(mockSchedule);

    // ─── Step 4: Create export ──────────────────────────────────────────
    const mockExportJob = {
      id: exportId,
      scheduleId,
      familyId,
      type: "pdf",
      status: "complete",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { pdfHash },
    };
    mockExportJobs.create.mockResolvedValue(mockExportJob);
    mockExportJobs.findById.mockResolvedValue(mockExportJob);

    // Create export metadata
    const mockMetadata = {
      id: metadataId,
      exportId,
      familyId,
      reportType: "message-transcript",
      pdfHash,
      pdfSizeBytes: 5000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      includedMessageIds: ["msg-1"],
    };
    mockExportMetadata.findByExportId.mockResolvedValue(mockMetadata);

    // Create export message hashes
    const mockMessageHashes = [
      {
        id: "hash-1",
        exportMetadataId: metadataId,
        messageId: "msg-1",
        chainIndex: 0,
        messageHash: "abc123def456",
        previousHash: "",
        sentAt: new Date().toISOString(),
        senderId: userId,
        createdAt: new Date().toISOString(),
      },
    ];
    mockExportMessageHashes.findByExportMetadataId.mockResolvedValue(mockMessageHashes);

    // ─── Step 5: Generate share token ────────────────────────────────────
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const mockShareToken = {
      id: tokenId,
      exportId,
      token,
      expiresAt: expiresAt.toISOString(),
      scope: "external",
      createdAt: new Date().toISOString(),
      accessCount: 0,
      createdByUserId: userId,
    };
    mockExportShareTokens.create.mockResolvedValue(mockShareToken);

    const shareRequest = createMockRequest({ expiresInDays: 7 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shareResponse = await postShare(shareRequest as any, {
      params: Promise.resolve({ id: exportId }),
    });

    expect(shareResponse.status).toBe(201);
    const shareBody = await shareResponse.json();
    expect(shareBody.token).toBe(token);
    expect(shareBody.shareLink).toContain(exportId);
    expect(shareBody.shareLink).toContain(token);
    expect(shareBody.qrUrl).toBeDefined();
    expect(shareBody.expiresAt).toBeDefined();

    // Verify logging
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "Export share token created",
      expect.objectContaining({
        exportId,
        userId,
        tokenId,
        familyId,
        scope: "external",
      })
    );

    // ─── Step 6: Public verify with token ───────────────────────────────
    mockExportShareTokens.findByToken.mockResolvedValue(mockShareToken);
    mockExportShareTokens.updateAccessCount.mockResolvedValue(undefined);

    const verifyRequest = createMockRequest(
      {
        exportId,
        token,
      },
      "POST",
      { "x-forwarded-for": "192.168.1.100" }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verifyResponse = await postVerify(verifyRequest as any);

    expect(verifyResponse.status).toBe(200);
    const verifyBody = await verifyResponse.json();
    expect(verifyBody.verified).toBe(true);
    expect(verifyBody.verifiedAt).toBeDefined();
    expect(verifyBody.chainValid).toBe(true);

    // Verify token access count was updated
    expect(mockExportShareTokens.updateAccessCount).toHaveBeenCalledWith(tokenId);

    // ─── Step 7: Verify audit log contains attempt ──────────────────────
    const mockAttempt = {
      id: "attempt-1",
      exportMetadataId: metadataId,
      verifiedAt: new Date().toISOString(),
      ipAddress: "192.168.1.100",
      verificationStatus: "verified",
      isValid: true,
      userAgent: undefined,
    };
    mockExportVerificationAttempts.findByExportMetadataId.mockResolvedValue([mockAttempt]);

    const auditRequest = createMockNextRequest({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditResponse = await getAuditLog(auditRequest as any, {
      params: Promise.resolve({ id: exportId }),
    });

    expect(auditResponse.status).toBe(200);
    const auditBody = await auditResponse.json();
    expect(Array.isArray(auditBody)).toBe(true);
    expect(auditBody.length).toBe(1);
    expect(auditBody[0]).toMatchObject({
      id: "attempt-1",
      verifiedAt: expect.any(String),
      ipAddress: "192.168.1.100",
      verificationStatus: "verified",
      isValid: true,
    });

    // ─── Verify logging throughout flow ──────────────────────────────────
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "Public verification attempt",
      expect.objectContaining({
        exportId,
        tokenId,
        verified: true,
        ipAddress: "192.168.1.100",
      })
    );

    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "Audit log retrieved",
      expect.objectContaining({
        exportId,
        userId,
        entriesCount: 1,
      })
    );

    // ─── Final Assertion: Full happy path succeeded ──────────────────────
    expect(mockLogEvent).toHaveBeenCalled();
    // At least 3 log events: token creation, verification, audit retrieval
    const infoLogs = mockLogEvent.mock.calls.filter((call) => call[0] === "info");
    expect(infoLogs.length).toBeGreaterThanOrEqual(3);
  });
});
