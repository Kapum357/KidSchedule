/**
 * Export Share Token API Tests
 *
 * Tests for POST /api/exports/{id}/share endpoint.
 * Uses Jest mocks — no real DB connection required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock crypto.randomUUID for request ID generation
if (!global.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.crypto = {} as any;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.crypto.randomUUID = jest.fn(() => "request-id-123") as any;

const mockExportJobs = {
  findById: jest.fn(),
};

const mockParents = {
  findByUserId: jest.fn(),
};

const mockExportShareTokens = {
  create: jest.fn(),
};

jest.mock("@/lib/persistence", () => ({
  getDb: jest.fn(() => ({
    exportJobs: mockExportJobs,
    parents: mockParents,
    exportShareTokens: mockExportShareTokens,
  })),
}));

jest.mock("@/app/api/calendar/utils", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NextResponse = require("next/server").NextResponse;
  return {
    getAuthenticatedUser: jest.fn(),
    badRequest: jest.fn((error: string, message: string) =>
      NextResponse.json({ error, message }, { status: 400 })
    ),
    unauthorized: jest.fn(() =>
      NextResponse.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 })
    ),
    notFound: jest.fn((error: string, message: string) =>
      NextResponse.json({ error, message }, { status: 404 })
    ),
  };
});

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

// ─── Imports ──────────────────────────────────────────────────────────────────

import { POST } from "@/app/api/exports/[id]/share/route";
import { getAuthenticatedUser, unauthorized, notFound } from "@/app/api/calendar/utils";
import { logEvent } from "@/lib/observability/logger";

const mockGetAuthenticatedUser = getAuthenticatedUser as jest.Mock;
const mockUnauthorized = unauthorized as jest.Mock;
const mockNotFound = notFound as jest.Mock;
const mockLogEvent = logEvent as jest.Mock;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/exports/[id]/share", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthenticatedUser.mockResolvedValue(null);

      const request = new Request("http://localhost:3000/api/exports/export-1/share", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: "export-1" }),
      });

      expect(response.status).toBe(401);
      expect(mockGetAuthenticatedUser).toHaveBeenCalled();
      expect(mockUnauthorized).toHaveBeenCalled();
    });
  });

  describe("access control", () => {
    it("should return 403 when user does not have access to export", async () => {
      const userId = "user-123";
      const familyId = "family-456";
      const otherFamilyId = "family-999";

      mockGetAuthenticatedUser.mockResolvedValue({
        userId,
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockExportJobs.findById.mockResolvedValue({
        id: "export-1",
        familyId: otherFamilyId,
        userId,
        type: "pdf",
        status: "complete",
      });

      mockParents.findByUserId.mockResolvedValue({
        id: "parent-123",
        userId,
        familyId,
        isPrimary: true,
      });

      const request = new Request("http://localhost:3000/api/exports/export-1/share", {
        method: "POST",
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: "export-1" }),
      });

      expect(response.status).toBe(401);
      expect(mockUnauthorized).toHaveBeenCalledWith(
        "access_denied",
        "You do not have access to this export"
      );
    });
  });

  describe("validation", () => {
    it("should return 404 when export does not exist", async () => {
      const userId = "user-123";

      mockGetAuthenticatedUser.mockResolvedValue({
        userId,
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockExportJobs.findById.mockResolvedValue(null);

      const request = new Request("http://localhost:3000/api/exports/export-1/share", {
        method: "POST",
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: "export-1" }),
      });

      expect(response.status).toBe(404);
      expect(mockNotFound).toHaveBeenCalledWith("export_not_found", "Export not found");
    });
  });

  describe("happy path", () => {
    it("should create share token and return 201 with valid response", async () => {
      const userId = "user-123";
      const familyId = "family-456";
      const exportId = "export-1";
      const token = "a".repeat(64); // 64-char token
      const tokenId = "token-123";

      mockGetAuthenticatedUser.mockResolvedValue({
        userId,
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockExportJobs.findById.mockResolvedValue({
        id: exportId,
        familyId,
        userId,
        type: "pdf",
        status: "complete",
      });

      mockParents.findByUserId.mockResolvedValue({
        id: "parent-123",
        userId,
        familyId,
        isPrimary: true,
      });

      mockExportShareTokens.create.mockResolvedValue({
        token,
        id: tokenId,
      });

      const request = new Request("http://localhost:3000/api/exports/export-1/share", {
        method: "POST",
        body: JSON.stringify({ expiresInDays: 7 }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: exportId }),
      });

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.token).toBe(token);
      expect(body.shareLink).toContain(exportId);
      expect(body.shareLink).toContain(token);
      expect(body.qrUrl).toContain("api.qrserver.com");
      expect(body.expiresAt).toBeDefined();
      expect(body.createdAt).toBeDefined();

      // Verify expiration is ~7 days from now
      const expiresDate = new Date(body.expiresAt);
      const now = new Date();
      const diffDays = Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(6);
      expect(diffDays).toBeLessThanOrEqual(7);

      // Verify logging
      expect(mockLogEvent).toHaveBeenCalledWith("info", "Export share token created", {
        requestId: expect.any(String),
        tokenId,
        exportId,
        userId,
        familyId,
        scope: "external",
        expiresInDays: 7,
      });
    });

    it("should use default expiresInDays (7) when not provided", async () => {
      const userId = "user-123";
      const familyId = "family-456";
      const exportId = "export-1";
      const token = "a".repeat(64);
      const tokenId = "token-123";

      mockGetAuthenticatedUser.mockResolvedValue({
        userId,
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockExportJobs.findById.mockResolvedValue({
        id: exportId,
        familyId,
        userId,
        type: "pdf",
        status: "complete",
      });

      mockParents.findByUserId.mockResolvedValue({
        id: "parent-123",
        userId,
        familyId,
        isPrimary: true,
      });

      mockExportShareTokens.create.mockResolvedValue({
        token,
        id: tokenId,
      });

      // Empty body (no expiresInDays)
      const request = new Request("http://localhost:3000/api/exports/export-1/share", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: exportId }),
      });

      expect(response.status).toBe(201);

      // Verify create was called with 7-day expiration
      expect(mockExportShareTokens.create).toHaveBeenCalledWith(
        exportId,
        userId,
        expect.any(Date),
        "external"
      );

      // Verify the expiration date is approximately 7 days from now
      const callArgs = mockExportShareTokens.create.mock.calls[0];
      const expiresAtArg = callArgs[2] as Date;
      const diffDays = Math.floor((expiresAtArg.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(6);
      expect(diffDays).toBeLessThanOrEqual(7);
    });

    it("should generate 64-character token", async () => {
      const userId = "user-123";
      const familyId = "family-456";
      const exportId = "export-1";
      const token = "a".repeat(64);
      const tokenId = "token-123";

      mockGetAuthenticatedUser.mockResolvedValue({
        userId,
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockExportJobs.findById.mockResolvedValue({
        id: exportId,
        familyId,
        userId,
        type: "pdf",
        status: "complete",
      });

      mockParents.findByUserId.mockResolvedValue({
        id: "parent-123",
        userId,
        familyId,
        isPrimary: true,
      });

      mockExportShareTokens.create.mockResolvedValue({
        token,
        id: tokenId,
      });

      const request = new Request("http://localhost:3000/api/exports/export-1/share", {
        method: "POST",
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: exportId }),
      });

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.token).toHaveLength(64);
      expect(body.token).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
