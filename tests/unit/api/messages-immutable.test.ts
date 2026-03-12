/**
 * Message Immutability API Tests
 *
 * Tests for PATCH/PUT /api/messages/{id} endpoints.
 * Enforces message immutability and prevents modification after export.
 *
 * Uses Jest mocks — no real DB connection required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

if (!global.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.crypto = {} as any;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.crypto.randomUUID = jest.fn(() => "request-id-123") as any;

const mockMessages = {
  findById: jest.fn(),
};

const mockExportJobs = {
  findByMessageId: jest.fn(),
};

const mockParents = {
  findByUserId: jest.fn(),
};

jest.mock("@/lib/persistence", () => ({
  getDb: jest.fn(() => ({
    messages: mockMessages,
    exportJobs: mockExportJobs,
    parents: mockParents,
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

import { PATCH, PUT } from "@/app/api/messages/[id]/route";
import { getAuthenticatedUser, unauthorized, badRequest, notFound } from "@/app/api/calendar/utils";
import { logEvent } from "@/lib/observability/logger";

const mockGetAuthenticatedUser = getAuthenticatedUser as jest.Mock;
const mockUnauthorized = unauthorized as jest.Mock;
const mockBadRequest = badRequest as jest.Mock;
const mockNotFound = notFound as jest.Mock;
const mockLogEvent = logEvent as jest.Mock;

// ─── Test Data Helpers ────────────────────────────────────────────────────────

interface MockMessage {
  id: string;
  threadId: string;
  familyId: string;
  senderId: string;
  body: string;
  sentAt: string;
  readAt: string | null;
  attachmentIds: string[];
  toneAnalysis: Record<string, unknown> | null;
  messageHash: string;
  previousHash: string | null;
  chainIndex: number;
  createdAt: string;
  updatedAt: string;
}

interface MockExportJob {
  id: string;
  familyId: string;
  userId: string;
  type: string;
  params: Record<string, unknown>;
  status: string;
  resultUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

function makeMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: "msg-123",
    threadId: "thread-123",
    familyId: "fam-123",
    senderId: "user-123",
    body: "Test message",
    sentAt: new Date().toISOString(),
    readAt: null,
    attachmentIds: [],
    toneAnalysis: null,
    messageHash: "abc123def456",
    previousHash: null,
    chainIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeExportJob(overrides: Partial<MockExportJob> = {}): MockExportJob {
  return {
    id: "export-123",
    familyId: "fam-123",
    userId: "user-123",
    type: "messages-csv",
    params: { messageIds: ["msg-123"] },
    status: "complete",
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown> = {}): Request {
  return {
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Request;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Message Immutability API (PATCH/PUT)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue({ userId: "user-123" });
  });

  describe("PATCH /api/messages/[id]", () => {
    describe("authentication", () => {
      it("should return 401 if user is not authenticated", async () => {
        mockGetAuthenticatedUser.mockResolvedValue(null);

        const request = makeRequest({ body: "Updated message" });
        const response = await PATCH(request, { params: { id: "msg-123" } });

        expect(mockUnauthorized).toHaveBeenCalled();
        expect(response.status).toBe(401);
      });
    });

    describe("message validation", () => {
      it("should return 400 if message ID is missing", async () => {
        const request = makeRequest({ body: "Updated message" });
        const response = await PATCH(request, { params: { id: "" } });

        expect(mockBadRequest).toHaveBeenCalledWith(
          "invalid_request",
          "Message ID is required"
        );
        expect(response.status).toBe(400);
      });

      it("should return 404 if message is not found", async () => {
        mockMessages.findById.mockResolvedValue(null);

        const request = makeRequest({ body: "Updated message" });
        const response = await PATCH(request, { params: { id: "msg-not-exist" } });

        expect(mockNotFound).toHaveBeenCalledWith(
          "message_not_found",
          "Message not found"
        );
        expect(response.status).toBe(404);
      });
    });

    describe("immutability enforcement", () => {
      it("should return 403 if message has been exported", async () => {
        const message = makeMessage();
        const exportJob = makeExportJob();

        mockMessages.findById.mockResolvedValue(message);
        mockExportJobs.findByMessageId.mockResolvedValue([exportJob]);

        const request = makeRequest({ body: "Updated message" });
        const response = await PATCH(request, { params: { id: "msg-123" } });

        expect(mockLogEvent).toHaveBeenCalledWith(
          "warn",
          "Immutable message modification attempt",
          expect.objectContaining({
            messageId: "msg-123",
            userId: "user-123",
            exportCount: 1,
          })
        );

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          error: "immutable_exported",
          message: "Cannot modify message that has been exported",
        });
      });

      it("should return 403 for design immutability even if not exported", async () => {
        const message = makeMessage();

        mockMessages.findById.mockResolvedValue(message);
        mockExportJobs.findByMessageId.mockResolvedValue([]);

        const request = makeRequest({ body: "Updated message" });
        const response = await PATCH(request, { params: { id: "msg-123" } });

        expect(mockLogEvent).toHaveBeenCalledWith(
          "info",
          "Message modification blocked by hash chain immutability",
          expect.objectContaining({
            messageId: "msg-123",
            userId: "user-123",
          })
        );

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          error: "immutable_design",
          message: "Messages are immutable after creation to preserve hash chain integrity",
        });
      });

      it("should log violation with correct request ID", async () => {
        const message = makeMessage();
        const exportJob = makeExportJob();

        mockMessages.findById.mockResolvedValue(message);
        mockExportJobs.findByMessageId.mockResolvedValue([exportJob]);

        const request = makeRequest({ body: "Updated message" });
        await PATCH(request, { params: { id: "msg-123" } });

        expect(mockLogEvent).toHaveBeenCalledWith(
          "warn",
          expect.anything(),
          expect.objectContaining({
            requestId: "request-id-123",
          })
        );
      });
    });

    describe("error handling", () => {
      it("should return 500 on unexpected error", async () => {
        mockMessages.findById.mockRejectedValue(new Error("DB connection failed"));

        const request = makeRequest({ body: "Updated message" });
        const response = await PATCH(request, { params: { id: "msg-123" } });

        expect(mockLogEvent).toHaveBeenCalledWith(
          "error",
          "Failed to process message PATCH",
          expect.objectContaining({
            error: "DB connection failed",
          })
        );

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          error: "server_error",
          message: "Failed to process request",
        });
      });
    });
  });

  describe("PUT /api/messages/[id]", () => {
    describe("authentication", () => {
      it("should return 401 if user is not authenticated", async () => {
        mockGetAuthenticatedUser.mockResolvedValue(null);

        const request = makeRequest({ body: "Replaced message" });
        const response = await PUT(request, { params: { id: "msg-123" } });

        expect(mockUnauthorized).toHaveBeenCalled();
        expect(response.status).toBe(401);
      });
    });

    describe("message validation", () => {
      it("should return 400 if message ID is missing", async () => {
        const request = makeRequest({ body: "Replaced message" });
        const response = await PUT(request, { params: { id: "" } });

        expect(mockBadRequest).toHaveBeenCalledWith(
          "invalid_request",
          "Message ID is required"
        );
        expect(response.status).toBe(400);
      });

      it("should return 404 if message is not found", async () => {
        mockMessages.findById.mockResolvedValue(null);

        const request = makeRequest({ body: "Replaced message" });
        const response = await PUT(request, { params: { id: "msg-not-exist" } });

        expect(mockNotFound).toHaveBeenCalledWith(
          "message_not_found",
          "Message not found"
        );
        expect(response.status).toBe(404);
      });
    });

    describe("immutability enforcement", () => {
      it("should return 403 if message has been exported", async () => {
        const message = makeMessage();
        const exportJob = makeExportJob();

        mockMessages.findById.mockResolvedValue(message);
        mockExportJobs.findByMessageId.mockResolvedValue([exportJob]);

        const request = makeRequest({ body: "Replaced message" });
        const response = await PUT(request, { params: { id: "msg-123" } });

        expect(mockLogEvent).toHaveBeenCalledWith(
          "warn",
          "Immutable message modification attempt (PUT)",
          expect.objectContaining({
            messageId: "msg-123",
            userId: "user-123",
            exportCount: 1,
          })
        );

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          error: "immutable_exported",
          message: "Cannot modify message that has been exported",
        });
      });

      it("should return 403 for design immutability even if not exported", async () => {
        const message = makeMessage();

        mockMessages.findById.mockResolvedValue(message);
        mockExportJobs.findByMessageId.mockResolvedValue([]);

        const request = makeRequest({ body: "Replaced message" });
        const response = await PUT(request, { params: { id: "msg-123" } });

        expect(mockLogEvent).toHaveBeenCalledWith(
          "info",
          "Message replacement blocked by hash chain immutability",
          expect.objectContaining({
            messageId: "msg-123",
            userId: "user-123",
          })
        );

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          error: "immutable_design",
          message: "Messages are immutable after creation to preserve hash chain integrity",
        });
      });
    });

    describe("error handling", () => {
      it("should return 500 on unexpected error", async () => {
        mockMessages.findById.mockRejectedValue(new Error("DB connection failed"));

        const request = makeRequest({ body: "Replaced message" });
        const response = await PUT(request, { params: { id: "msg-123" } });

        expect(mockLogEvent).toHaveBeenCalledWith(
          "error",
          "Failed to process message PUT",
          expect.objectContaining({
            error: "DB connection failed",
          })
        );

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          error: "server_error",
          message: "Failed to process request",
        });
      });
    });
  });

  describe("multiple exports", () => {
    it("should detect immutability when message is in multiple exports", async () => {
      const message = makeMessage();
      const exportJob1 = makeExportJob({ id: "export-1" });
      const exportJob2 = makeExportJob({ id: "export-2" });

      mockMessages.findById.mockResolvedValue(message);
      mockExportJobs.findByMessageId.mockResolvedValue([exportJob1, exportJob2]);

      const request = makeRequest({ body: "Updated message" });
      const response = await PATCH(request, { params: { id: "msg-123" } });

      expect(response.status).toBe(403);
      expect(mockLogEvent).toHaveBeenCalledWith(
        "warn",
        "Immutable message modification attempt",
        expect.objectContaining({
          exportCount: 2,
        })
      );
    });
  });

  describe("audit trail", () => {
    it("should log all immutability violations for audit", async () => {
      const message = makeMessage();
      const exportJob = makeExportJob();

      mockMessages.findById.mockResolvedValue(message);
      mockExportJobs.findByMessageId.mockResolvedValue([exportJob]);

      const request = makeRequest({ body: "Updated message" });
      await PATCH(request, { params: { id: "msg-123" } });

      expect(mockLogEvent).toHaveBeenCalledWith(
        "warn",
        "Immutable message modification attempt",
        expect.objectContaining({
          messageId: "msg-123",
          userId: "user-123",
          exportCount: 1,
          requestId: "request-id-123",
        })
      );
    });
  });
});
