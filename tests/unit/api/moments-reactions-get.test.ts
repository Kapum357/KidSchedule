/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Unit tests for GET /api/moments/{id}/reactions
 */

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/persistence", () => ({
  db: {
    moments: {
      findById: jest.fn(),
    },
    momentReactions: {
      findByMomentId: jest.fn(),
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
import { GET } from "@/app/api/moments/[id]/reactions/route";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockDb = db as jest.Mocked<typeof db>;
const mockLogEvent = logEvent as jest.MockedFunction<typeof logEvent>;

describe("GET /api/moments/{id}/reactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return grouped reactions with counts", async () => {
    const mockSession = {
      userId: "parent-123",
      email: "parent@example.com",
      sessionId: "session-abc",
    };

    const mockMoment = {
      id: "moment-456",
      familyId: "family-789",
      uploadedBy: "parent-999",
      mediaUrl: "https://example.com/photo.jpg",
      mediaType: "photo" as const,
      title: "Family Day",
      childTag: "both" as const,
      visibility: "shared" as const,
      createdAt: "2026-03-11T10:00:00Z",
      updatedAt: "2026-03-11T10:00:00Z",
    };

    const mockReactions = [
      {
        id: "reaction-1",
        momentId: "moment-456",
        parentId: "parent-123",
        emoji: "❤️",
        reactedAt: "2026-03-11T10:00:00Z",
      },
      {
        id: "reaction-2",
        momentId: "moment-456",
        parentId: "parent-456",
        emoji: "❤️",
        reactedAt: "2026-03-11T10:01:00Z",
      },
      {
        id: "reaction-3",
        momentId: "moment-456",
        parentId: "parent-789",
        emoji: "👍",
        reactedAt: "2026-03-11T10:02:00Z",
      },
    ];

    mockGetCurrentUser.mockResolvedValue(mockSession);
    mockDb.moments.findById.mockResolvedValue(mockMoment as any);
    mockDb.momentReactions.findByMomentId.mockResolvedValue(mockReactions as any);

    const request = new Request("http://localhost:3000/api/moments/moment-456/reactions", {
      method: "GET",
    });

    const response = await GET(request as any, {
      params: { id: "moment-456" },
    } as any);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.momentId).toBe("moment-456");
    expect(data.reactions).toHaveLength(2);

    const heartReaction = data.reactions.find((r: any) => r.emoji === "❤️");
    expect(heartReaction).toEqual({
      emoji: "❤️",
      count: 2,
      byCurrentUser: true,
      userIds: expect.arrayContaining(["parent-123", "parent-456"]),
    });

    const thumbsReaction = data.reactions.find((r: any) => r.emoji === "👍");
    expect(thumbsReaction).toEqual({
      emoji: "👍",
      count: 1,
      byCurrentUser: false,
      userIds: ["parent-789"],
    });

    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "Moment reactions retrieved",
      expect.objectContaining({
        momentId: "moment-456",
        reactionCount: 3,
        groupCount: 2,
      })
    );
  });

  it("should return empty reactions array when no reactions exist", async () => {
    const mockSession = {
      userId: "parent-123",
      email: "parent@example.com",
      sessionId: "session-abc",
    };

    const mockMoment = {
      id: "moment-456",
      familyId: "family-789",
      uploadedBy: "parent-999",
      mediaUrl: "https://example.com/photo.jpg",
      mediaType: "photo" as const,
      title: "Family Day",
      childTag: "both" as const,
      visibility: "shared" as const,
      createdAt: "2026-03-11T10:00:00Z",
      updatedAt: "2026-03-11T10:00:00Z",
    };

    mockGetCurrentUser.mockResolvedValue(mockSession);
    mockDb.moments.findById.mockResolvedValue(mockMoment as any);
    mockDb.momentReactions.findByMomentId.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/moments/moment-456/reactions", {
      method: "GET",
    });

    const response = await GET(request as any, {
      params: { id: "moment-456" },
    } as any);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.momentId).toBe("moment-456");
    expect(data.reactions).toEqual([]);
  });

  it("should return 404 when moment not found", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    mockDb.moments.findById.mockResolvedValue(null);

    const request = new Request("http://localhost:3000/api/moments/nonexistent/reactions", {
      method: "GET",
    });

    const response = await GET(request as any, {
      params: { id: "nonexistent" },
    } as any);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("MOMENT_NOT_FOUND");
  });
});
