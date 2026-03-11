/**
 * Conflict Window Settings API Tests
 *
 * Tests for GET /api/settings/conflict-window endpoint.
 * Uses Jest mocks — no real DB connection required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFamilies = {
  findByParentUserId: jest.fn(),
};

const mockConflictWindows = {
  findByFamilyId: jest.fn(),
  upsert: jest.fn(),
};

jest.mock("@/lib/persistence", () => ({
  db: {
    families: mockFamilies,
    conflictWindows: mockConflictWindows,
  },
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/observability/api-observability", () => ({
  observeApiRequest: jest.fn(),
  observeApiException: jest.fn(),
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

jest.mock("@/lib/settings-engine", () => ({
  SettingsEngine: jest.fn().mockImplementation(() => ({
    resolveConflictWindow: jest.fn((familyId, overrides) => ({
      windowMins: Math.min(720, Math.max(0, overrides?.windowMins ?? 120)),
    })),
  })),
}));

// Mock NextResponse.json to work in Jest environment
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

import { GET, PUT } from "@/app/api/settings/conflict-window/route";
import { getCurrentUser } from "@/lib/auth";
import { observeApiRequest, observeApiException } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockObserveApiRequest = observeApiRequest as jest.Mock;
const mockObserveApiException = observeApiException as jest.Mock;
const mockLogEvent = logEvent as jest.Mock;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/settings/conflict-window", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 if user not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "GET",
        status: 401,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should return current conflict window for authenticated user", async () => {
    const userId = "user-123";
    const familyId = "family-456";

    mockGetCurrentUser.mockResolvedValue({
      userId,
      email: "parent@example.com",
      sessionId: "session-789",
    });

    mockFamilies.findByParentUserId.mockResolvedValue({
      id: familyId,
      name: "Smith Family",
      custodyAnchorDate: "2024-01-01",
      scheduleId: "schedule-123",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });

    mockConflictWindows.findByFamilyId.mockResolvedValue({
      familyId,
      windowMins: 90,
      updatedAt: "2024-03-01T12:00:00Z",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.windowMins).toBe(90);
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "GET",
        status: 200,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should return default value (120) if no setting exists", async () => {
    const userId = "user-123";
    const familyId = "family-456";

    mockGetCurrentUser.mockResolvedValue({
      userId,
      email: "parent@example.com",
      sessionId: "session-789",
    });

    mockFamilies.findByParentUserId.mockResolvedValue({
      id: familyId,
      name: "Smith Family",
      custodyAnchorDate: "2024-01-01",
      scheduleId: "schedule-123",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });

    mockConflictWindows.findByFamilyId.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.windowMins).toBe(120);
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "GET",
        status: 200,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should return 404 if family not found", async () => {
    const userId = "user-123";

    mockGetCurrentUser.mockResolvedValue({
      userId,
      email: "parent@example.com",
      sessionId: "session-789",
    });

    mockFamilies.findByParentUserId.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("family_not_found");
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "GET",
        status: 404,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should return 500 on database error", async () => {
    const userId = "user-123";

    mockGetCurrentUser.mockResolvedValue({
      userId,
      email: "parent@example.com",
      sessionId: "session-789",
    });

    const dbError = new Error("Database connection failed");
    mockFamilies.findByParentUserId.mockRejectedValue(dbError);

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("internal_server_error");
    expect(mockObserveApiException).toHaveBeenCalledWith(
      "/api/settings/conflict-window",
      "GET",
      dbError
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "Conflict window settings endpoint error",
      expect.any(Object)
    );
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "GET",
        status: 500,
        durationMs: expect.any(Number),
      })
    );
  });
});

describe("PUT /api/settings/conflict-window", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 if user not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const request = {
      json: jest.fn().mockResolvedValue({ windowMins: 90 }),
    } as unknown as Request;

    const response = await PUT(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "PUT",
        status: 401,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should return 400 on invalid input (non-numeric windowMins)", async () => {
    const userId = "user-123";
    const familyId = "family-456";

    mockGetCurrentUser.mockResolvedValue({
      userId,
      email: "parent@example.com",
      sessionId: "session-789",
    });

    mockFamilies.findByParentUserId.mockResolvedValue({
      id: familyId,
      name: "Smith Family",
      custodyAnchorDate: "2024-01-01",
      scheduleId: "schedule-123",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });

    const request = {
      json: jest.fn().mockResolvedValue({ windowMins: "not-a-number" }),
    } as unknown as Request;

    const response = await PUT(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("validation_error");
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "PUT",
        status: 400,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should clamp value to [0, 720] range (e.g., 9999 -> 720)", async () => {
    const userId = "user-123";
    const familyId = "family-456";

    mockGetCurrentUser.mockResolvedValue({
      userId,
      email: "parent@example.com",
      sessionId: "session-789",
    });

    mockFamilies.findByParentUserId.mockResolvedValue({
      id: familyId,
      name: "Smith Family",
      custodyAnchorDate: "2024-01-01",
      scheduleId: "schedule-123",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });

    mockConflictWindows.upsert.mockResolvedValue({
      familyId,
      windowMins: 720,
      updatedAt: "2024-03-01T12:00:00Z",
    });

    const request = {
      json: jest.fn().mockResolvedValue({ windowMins: 9999 }),
    } as unknown as Request;

    const response = await PUT(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.windowMins).toBe(720);
    expect(mockConflictWindows.upsert).toHaveBeenCalledWith(familyId, 720);
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "PUT",
        status: 200,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should persist updated setting to database", async () => {
    const userId = "user-123";
    const familyId = "family-456";

    mockGetCurrentUser.mockResolvedValue({
      userId,
      email: "parent@example.com",
      sessionId: "session-789",
    });

    mockFamilies.findByParentUserId.mockResolvedValue({
      id: familyId,
      name: "Smith Family",
      custodyAnchorDate: "2024-01-01",
      scheduleId: "schedule-123",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });

    mockConflictWindows.upsert.mockResolvedValue({
      familyId,
      windowMins: 90,
      updatedAt: "2024-03-01T12:00:00Z",
    });

    const request = {
      json: jest.fn().mockResolvedValue({ windowMins: 90 }),
    } as unknown as Request;

    const response = await PUT(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.windowMins).toBe(90);
    expect(mockConflictWindows.upsert).toHaveBeenCalledWith(familyId, 90);
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "PUT",
        status: 200,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should return 500 on database error", async () => {
    const userId = "user-123";

    mockGetCurrentUser.mockResolvedValue({
      userId,
      email: "parent@example.com",
      sessionId: "session-789",
    });

    const dbError = new Error("Database connection failed");
    mockFamilies.findByParentUserId.mockRejectedValue(dbError);

    const request = {
      json: jest.fn().mockResolvedValue({ windowMins: 90 }),
    } as unknown as Request;

    const response = await PUT(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("internal_server_error");
    expect(mockObserveApiException).toHaveBeenCalledWith(
      "/api/settings/conflict-window",
      "PUT",
      dbError
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "Conflict window settings endpoint error",
      expect.any(Object)
    );
    expect(mockObserveApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/settings/conflict-window",
        method: "PUT",
        status: 500,
        durationMs: expect.any(Number),
      })
    );
  });
});
