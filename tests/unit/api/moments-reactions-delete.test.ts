/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Unit tests for DELETE /api/moments/{id}/reactions/{reactionId}
 */

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/persistence", () => ({
  db: {
    momentReactions: {
      findById: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
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

import { NextResponse } from "next/server";
import { DELETE } from "@/app/api/moments/[id]/reactions/[reactionId]/route";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockDb = db as jest.Mocked<typeof db>;
const mockLogEvent = logEvent as jest.MockedFunction<typeof logEvent>;

describe("DELETE /api/moments/{id}/reactions/{reactionId}", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should delete reaction and return 204 No Content", async () => {
    const mockSession = {
      userId: "parent-123",
      email: "parent@example.com",
      sessionId: "session-abc",
    };

    const mockReaction = {
      id: "reaction-uuid-1",
      momentId: "moment-456",
      parentId: "parent-123",
      emoji: "❤️",
      reactedAt: "2026-03-11T10:00:00Z",
    };

    mockGetCurrentUser.mockResolvedValue(mockSession);
    mockDb.momentReactions.findById.mockResolvedValue(mockReaction as any);
    mockDb.momentReactions.delete.mockResolvedValue(true);

    const request = new Request(
      "http://localhost:3000/api/moments/moment-456/reactions/reaction-uuid-1",
      { method: "DELETE" }
    );

    const response = await DELETE(request as any, {
      params: { id: "moment-456", reactionId: "reaction-uuid-1" },
    } as any);

    expect(response.status).toBe(204);
    expect(mockDb.momentReactions.delete).toHaveBeenCalledWith("reaction-uuid-1");
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "Moment reaction deleted",
      expect.objectContaining({
        momentId: "moment-456",
        reactionId: "reaction-uuid-1",
        parentId: "parent-123",
        emoji: "❤️",
      })
    );
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const request = new Request(
      "http://localhost:3000/api/moments/moment-456/reactions/reaction-uuid-1",
      { method: "DELETE" }
    );

    const response = await DELETE(request as any, {
      params: { id: "moment-456", reactionId: "reaction-uuid-1" },
    } as any);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("UNAUTHORIZED");
  });

  it("should return 404 when reaction not found", async () => {
    const mockSession = {
      userId: "parent-123",
      email: "parent@example.com",
      sessionId: "session-abc",
    };

    mockGetCurrentUser.mockResolvedValue(mockSession);
    mockDb.momentReactions.findById.mockResolvedValue(null);

    const request = new Request(
      "http://localhost:3000/api/moments/moment-456/reactions/nonexistent",
      { method: "DELETE" }
    );

    const response = await DELETE(request as any, {
      params: { id: "moment-456", reactionId: "nonexistent" },
    } as any);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("REACTION_NOT_FOUND");
  });

  it("should return 403 when user does not own the reaction", async () => {
    const mockSession = {
      userId: "parent-123",
      email: "parent@example.com",
      sessionId: "session-abc",
    };

    const mockReaction = {
      id: "reaction-uuid-1",
      momentId: "moment-456",
      parentId: "parent-999", // Different parent
      emoji: "❤️",
      reactedAt: "2026-03-11T10:00:00Z",
    };

    mockGetCurrentUser.mockResolvedValue(mockSession);
    mockDb.momentReactions.findById.mockResolvedValue(mockReaction as any);

    const request = new Request(
      "http://localhost:3000/api/moments/moment-456/reactions/reaction-uuid-1",
      { method: "DELETE" }
    );

    const response = await DELETE(request as any, {
      params: { id: "moment-456", reactionId: "reaction-uuid-1" },
    } as any);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("FORBIDDEN");
    expect(mockDb.momentReactions.delete).not.toHaveBeenCalled();
  });
});
