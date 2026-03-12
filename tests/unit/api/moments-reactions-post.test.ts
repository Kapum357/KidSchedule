/**
 * Unit tests for POST /api/moments/{id}/reactions
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
      addReaction: jest.fn(),
    },
  },
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

jest.mock("@/lib/constants/emoji", () => ({
  validateEmoji: jest.fn(),
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
import { POST } from "@/app/api/moments/[id]/reactions/route";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import { validateEmoji } from "@/lib/constants/emoji";

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockDb = db as jest.Mocked<typeof db>;
const mockLogEvent = logEvent as jest.MockedFunction<typeof logEvent>;
const mockValidateEmoji = validateEmoji as jest.MockedFunction<typeof validateEmoji>;

describe("POST /api/moments/{id}/reactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should add a new reaction and return 201 Created", async () => {
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
    mockValidateEmoji.mockReturnValue(true);
    mockDb.momentReactions.addReaction.mockResolvedValue({
      id: "reaction-uuid-1",
      isNew: true,
    });

    const request = new Request("http://localhost:3000/api/moments/moment-456/reactions", {
      method: "POST",
      body: JSON.stringify({ emoji: "❤️" }),
    }) as any;

    // Mock json() method on request
    request.json = jest.fn().mockResolvedValue({ emoji: "❤️" });

    const response = await POST(request, {
      params: { id: "moment-456" },
    } as any);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toEqual({
      id: "reaction-uuid-1",
      emoji: "❤️",
      parentId: "parent-123",
      isNew: true,
      createdAt: expect.any(String),
    });
    expect(mockDb.momentReactions.addReaction).toHaveBeenCalledWith(
      "moment-456",
      "parent-123",
      "❤️"
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "Moment reaction added",
      expect.objectContaining({
        momentId: "moment-456",
        parentId: "parent-123",
        emoji: "❤️",
        isNew: true,
      })
    );
  });

  it("should return 400 for invalid emoji", async () => {
    const mockSession = {
      userId: "parent-123",
      email: "parent@example.com",
      sessionId: "session-abc",
    };

    mockGetCurrentUser.mockResolvedValue(mockSession);
    mockValidateEmoji.mockReturnValue(false);

    const request = new Request("http://localhost:3000/api/moments/moment-456/reactions", {
      method: "POST",
      body: JSON.stringify({ emoji: "👽" }),
    }) as any;

    // Mock json() method on request
    request.json = jest.fn().mockResolvedValue({ emoji: "👽" });

    const response = await POST(request, {
      params: { id: "moment-456" },
    } as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("INVALID_EMOJI");
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const request = new Request("http://localhost:3000/api/moments/moment-456/reactions", {
      method: "POST",
      body: JSON.stringify({ emoji: "❤️" }),
    }) as any;

    // Mock json() method on request
    request.json = jest.fn().mockResolvedValue({ emoji: "❤️" });

    const response = await POST(request, {
      params: { id: "moment-456" },
    } as any);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("UNAUTHORIZED");
  });

  it("should return 404 when moment not found", async () => {
    const mockSession = {
      userId: "parent-123",
      email: "parent@example.com",
      sessionId: "session-abc",
    };

    mockGetCurrentUser.mockResolvedValue(mockSession);
    mockDb.moments.findById.mockResolvedValue(null);
    mockValidateEmoji.mockReturnValue(true);

    const request = new Request("http://localhost:3000/api/moments/nonexistent/reactions", {
      method: "POST",
      body: JSON.stringify({ emoji: "❤️" }),
    }) as any;

    // Mock json() method on request
    request.json = jest.fn().mockResolvedValue({ emoji: "❤️" });

    const response = await POST(request, {
      params: { id: "nonexistent" },
    } as any);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("MOMENT_NOT_FOUND");
  });
});
