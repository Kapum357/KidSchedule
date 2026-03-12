/**
 * Notifications Pending Endpoint Tests
 *
 * Tests for GET /api/notifications/pending
 * Enforces authentication and family-based filtering.
 *
 * Uses Jest mocks — no real DB connection required.
 */

// ─── Setup Mocks ──────────────────────────────────────────────────────────────

if (!global.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.crypto = {} as any;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.crypto.randomUUID = jest.fn(() => "request-id-123") as any;

const mockScheduledNotifications = {
  findByFamilyId: jest.fn(),
  findPendingByTimeRange: jest.fn(),
};

const mockParents = {
  findByUserId: jest.fn(),
};

jest.mock("@/lib/persistence", () => ({
  getDb: jest.fn(() => ({
    scheduledNotifications: mockScheduledNotifications,
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
    unauthorized: jest.fn((error: string = "unauthorized", message: string = "Authentication required") =>
      NextResponse.json({ error, message }, { status: 401 })
    ),
    forbidden: jest.fn((error: string = "forbidden", message: string = "Access denied") =>
      NextResponse.json({ error, message }, { status: 403 })
    ),
    internalError: jest.fn((error: string = "internal_server_error", message: string = "An unexpected error occurred") =>
      NextResponse.json({ error, message }, { status: 500 })
    ),
    generateRequestId: jest.fn(() => "request-id-123"),
  };
});

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

jest.mock("@/lib/observability/api-observability", () => ({
  observeApiRequest: jest.fn(),
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

import { GET } from "@/app/api/notifications/schedule/route";
import { getAuthenticatedUser, unauthorized, forbidden, badRequest, internalError, generateRequestId } from "@/app/api/calendar/utils";

const mockGetAuthenticatedUser = getAuthenticatedUser as jest.Mock;
const mockUnauthorized = unauthorized as jest.Mock;
const mockForbidden = forbidden as jest.Mock;
const mockBadRequest = badRequest as jest.Mock;
const mockInternalError = internalError as jest.Mock;

// ─── Helper Functions ─────────────────────────────────────────────────────────

function createMockRequest(url = "http://localhost:3000/api/notifications/pending"): Request {
  return {
    url,
  } as Request;
}

function createMockNotification(overrides = {}) {
  const now = new Date();
  return {
    id: "notif-123",
    familyId: "family-123",
    parentId: "parent-123",
    notificationType: "transition_24h" as const,
    scheduledAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(), // 30 min from now
    deliveryStatus: "pending" as const,
    deliveryMethod: "sms" as const,
    transitionAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    fromParentId: "parent-123",
    toParentId: "parent-456",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe("GET /api/notifications/pending", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthenticatedUser.mockResolvedValueOnce(null);

      const request = createMockRequest();
      await GET(request as any);

      expect(mockGetAuthenticatedUser).toHaveBeenCalled();
      expect(mockUnauthorized).toHaveBeenCalledWith("unauthenticated", "Authentication required");
    });

    it("should return 403 when authenticated user has no parent profile", async () => {
      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });
      mockParents.findByUserId.mockResolvedValueOnce(null);

      const request = createMockRequest();
      await GET(request as any);

      expect(mockParents.findByUserId).toHaveBeenCalledWith("user-123");
      expect(mockForbidden).toHaveBeenCalledWith("parent_not_found", "Parent profile not found");
    });
  });

  describe("Authorization", () => {
    it("should only return notifications for the authenticated user's family", async () => {
      const now = new Date();
      const family1NotificationId = "notif-family1-123";
      const family2NotificationId = "notif-family2-456";

      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockResolvedValueOnce({
        id: "parent-123",
        familyId: "family-123",
        userId: "user-123",
        name: "Parent One",
      });

      // Mock notifications from multiple families (data leak scenario)
      const allNotifications = [
        createMockNotification({
          id: family1NotificationId,
          familyId: "family-123", // User's family
          parentId: "parent-123",
          scheduledAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        }),
        createMockNotification({
          id: family2NotificationId,
          familyId: "family-999", // Different family (should NOT be returned)
          parentId: "parent-999",
          scheduledAt: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
        }),
      ];

      mockScheduledNotifications.findByFamilyId.mockResolvedValueOnce(
        allNotifications.filter(n => n.familyId === "family-123")
      );

      const request = createMockRequest();
      const response = await GET(request as any);

      expect(mockScheduledNotifications.findByFamilyId).toHaveBeenCalledWith("family-123");
      expect((response.body as any).notifications).toHaveLength(1);
      expect((response.body as any).notifications[0].id).toBe(family1NotificationId);
      expect((response.body as any).notifications[0].familyId).toBe("family-123");
      // Verify the other family's notification is NOT included
      expect((response.body as any).notifications.some((n: any) => n.id === family2NotificationId)).toBe(false);
    });

    it("should filter by pending status only", async () => {
      const now = new Date();

      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockResolvedValueOnce({
        id: "parent-123",
        familyId: "family-123",
        userId: "user-123",
      });

      // Mix of pending and non-pending notifications
      const allNotifications = [
        createMockNotification({
          id: "pending-1",
          deliveryStatus: "pending",
          scheduledAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        }),
        createMockNotification({
          id: "sent-1",
          deliveryStatus: "sent",
          scheduledAt: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
        }),
        createMockNotification({
          id: "failed-1",
          deliveryStatus: "failed",
          scheduledAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
        }),
      ];

      mockScheduledNotifications.findByFamilyId.mockResolvedValueOnce(allNotifications);

      const request = createMockRequest();
      const response = await GET(request as any);

      // Should only return the pending notification
      expect((response.body as any).notifications).toHaveLength(1);
      expect((response.body as any).notifications[0].id).toBe("pending-1");
      expect((response.body as any).notifications[0].deliveryStatus).toBe("pending");
    });
  });

  describe("Time Window Filtering", () => {
    it("should respect the default 60-minute window", async () => {
      const now = new Date();

      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockResolvedValueOnce({
        id: "parent-123",
        familyId: "family-123",
      });

      const allNotifications = [
        createMockNotification({
          id: "within-window",
          scheduledAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(), // 30 min from now
        }),
        createMockNotification({
          id: "outside-window",
          scheduledAt: new Date(now.getTime() + 90 * 60 * 1000).toISOString(), // 90 min from now
        }),
        createMockNotification({
          id: "past-notification",
          scheduledAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 min ago
        }),
      ];

      mockScheduledNotifications.findByFamilyId.mockResolvedValueOnce(allNotifications);

      const request = createMockRequest("http://localhost:3000/api/notifications/pending");
      const response = await GET(request as any);

      // Should only include the notification within 60 minutes
      expect((response.body as any).notifications).toHaveLength(1);
      expect((response.body as any).notifications[0].id).toBe("within-window");
    });

    it("should respect custom window parameter", async () => {
      const now = new Date();

      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockResolvedValueOnce({
        id: "parent-123",
        familyId: "family-123",
      });

      const allNotifications = [
        createMockNotification({
          id: "at-30min",
          scheduledAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        }),
        createMockNotification({
          id: "at-120min",
          scheduledAt: new Date(now.getTime() + 120 * 60 * 1000).toISOString(),
        }),
      ];

      mockScheduledNotifications.findByFamilyId.mockResolvedValueOnce(allNotifications);

      const request = createMockRequest("http://localhost:3000/api/notifications/pending?window=120");
      const response = await GET(request as any);

      expect((response.body as any).notifications).toHaveLength(2);
    });

    it("should cap window at 1440 minutes (24 hours)", async () => {
      const now = new Date();

      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockResolvedValueOnce({
        id: "parent-123",
        familyId: "family-123",
      });

      // Notification at 25 hours (should be excluded even though request asked for 2000 minutes)
      const allNotifications = [
        createMockNotification({
          id: "future-notification",
          scheduledAt: new Date(now.getTime() + (25 * 60 * 60 * 1000)).toISOString(),
        }),
      ];

      mockScheduledNotifications.findByFamilyId.mockResolvedValueOnce(allNotifications);

      const request = createMockRequest("http://localhost:3000/api/notifications/pending?window=2000");
      const response = await GET(request as any);

      // Should be excluded because it's beyond 24 hours
      expect((response.body as any).notifications).toHaveLength(0);
    });

    it("should return 400 for invalid window parameter", async () => {
      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockResolvedValueOnce({
        id: "parent-123",
        familyId: "family-123",
      });

      const request = createMockRequest("http://localhost:3000/api/notifications/pending?window=invalid");
      await GET(request as any);

      expect(mockBadRequest).toHaveBeenCalledWith("invalid_input", "window must be a positive integer");
    });

    it("should return 400 for negative window parameter", async () => {
      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockResolvedValueOnce({
        id: "parent-123",
        familyId: "family-123",
      });

      const request = createMockRequest("http://localhost:3000/api/notifications/pending?window=-10");
      await GET(request as any);

      expect(mockBadRequest).toHaveBeenCalledWith("invalid_input", "window must be a positive integer");
    });
  });

  describe("Response Format", () => {
    it("should return success with empty array when no notifications", async () => {
      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockResolvedValueOnce({
        id: "parent-123",
        familyId: "family-123",
      });

      mockScheduledNotifications.findByFamilyId.mockResolvedValueOnce([]);

      const request = createMockRequest();
      const response = await GET(request as any);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        notifications: [] as any,
      });
    });

    it("should return multiple notifications in correct format", async () => {
      const now = new Date();

      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockResolvedValueOnce({
        id: "parent-123",
        familyId: "family-123",
      });

      const allNotifications = [
        createMockNotification({
          id: "notif-1",
          scheduledAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        }),
        createMockNotification({
          id: "notif-2",
          scheduledAt: new Date(now.getTime() + 40 * 60 * 1000).toISOString(),
        }),
      ];

      mockScheduledNotifications.findByFamilyId.mockResolvedValueOnce(allNotifications);

      const request = createMockRequest();
      const response = await GET(request as any);

      expect(response.status).toBe(200);
      expect((response.body as any).success).toBe(true);
      expect((response.body as any).notifications).toHaveLength(2);
      expect((response.body as any).notifications[0].id).toBe("notif-1");
      expect((response.body as any).notifications[1].id).toBe("notif-2");
    });
  });

  describe("Error Handling", () => {
    it("should return 500 on database error", async () => {
      mockGetAuthenticatedUser.mockResolvedValueOnce({
        userId: "user-123",
        email: "user@example.com",
        sessionId: "session-123",
      });

      mockParents.findByUserId.mockRejectedValueOnce(new Error("Database connection failed"));

      const request = createMockRequest();
      await GET(request as any);

      expect(mockInternalError).toHaveBeenCalledWith("internal_server_error", "Failed to get pending notifications");
    });
  });
});
