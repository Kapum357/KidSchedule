/**
 * Mediation Page Actions Unit Tests
 *
 * Tests the mediation server actions including adjustSuggestionTone.
 *
 * Key invariants under test:
 *  - adjustSuggestionTone validates input length (max 2000 chars)
 *  - adjustSuggestionTone validates adjustment type
 *  - adjustSuggestionTone rejects empty text
 *  - adjustSuggestionTone handles API failures gracefully
 */

// ─── Environment setup ───────────────────────────────────────────────────────
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { webcrypto } = require("node:crypto") as { webcrypto: Crypto };
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, writable: true, configurable: true });
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("@/lib", () => ({
  requireAuth: jest.fn(),
}));

jest.mock("@/lib/persistence", () => ({
  db: {
    parents: {
      findByUserId: jest.fn(),
    },
  },
}));

jest.mock("@/lib/providers/ai", () => ({
  adjustSuggestion: jest.fn(),
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { adjustSuggestionTone } from "@/app/mediation/page-actions";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { requireAuth } = require("@/lib") as { requireAuth: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("@/lib/persistence") as {
  db: {
    parents: { findByUserId: jest.Mock };
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { adjustSuggestion } = require("@/lib/providers/ai") as {
  adjustSuggestion: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logEvent } = require("@/lib/observability/logger") as {
  logEvent: jest.Mock;
};

describe("adjustSuggestionTone", () => {
  const mockUser = { userId: "user-123", email: "test@example.com", sessionId: "session-123" };
  const mockParent = {
    id: "parent-123",
    familyId: "family-123",
    userId: "user-123",
    name: "Test Parent",
    email: "test@example.com",
    role: "parent" as const,
    createdAt: new Date().toISOString(),
  };
  const VALID_TEXT = "Hello world";
  const API_ERROR_MESSAGE = "API failed";
  const MAX_LENGTH = 2000;

  beforeEach(() => {
    jest.clearAllMocks();
    requireAuth.mockResolvedValue(mockUser);
    db.parents.findByUserId.mockResolvedValue(mockParent);
  });

  it("validates adjustment type", async () => {
    await expect(
      adjustSuggestionTone(VALID_TEXT, "invalid" as any), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toThrow("Invalid adjustment: invalid");
  });

  it("rejects empty text", async () => {
    await expect(
      adjustSuggestionTone("", "gentler"),
    ).rejects.toThrow("Text cannot be empty");

    await expect(
      adjustSuggestionTone("   ", "gentler"),
    ).rejects.toThrow("Text cannot be empty");
  });

  it("respects max 2000 char limit", async () => {
    const longText = "a".repeat(MAX_LENGTH + 1);
    await expect(
      adjustSuggestionTone(longText, "gentler"),
    ).rejects.toThrow("Text must be under 2,000 characters");
  });

  it("allows exactly 2000 chars", async () => {
    const text2000 = "a".repeat(MAX_LENGTH);
    adjustSuggestion.mockResolvedValue("adjusted text");

    const result = await adjustSuggestionTone(text2000, "gentler");

    expect(result).toEqual({ adjustedText: "adjusted text" });
    expect(adjustSuggestion).toHaveBeenCalledWith("user-123", text2000, "gentler");
  });

  it("handles API failure gracefully", async () => {
    adjustSuggestion.mockRejectedValue(new Error(API_ERROR_MESSAGE));

    await expect(
      adjustSuggestionTone(VALID_TEXT, "gentler"),
    ).rejects.toThrow(API_ERROR_MESSAGE);

    expect(logEvent).toHaveBeenCalledWith("error", "mediation.suggestion_adjustment_failed", {
      familyId: "family-123",
      adjustment: "gentler",
      errorMessage: API_ERROR_MESSAGE,
    });
  });

  it("succeeds with valid input", async () => {
    adjustSuggestion.mockResolvedValue("This is gentler text.");

    const result = await adjustSuggestionTone(VALID_TEXT, "gentler");

    expect(result).toEqual({ adjustedText: "This is gentler text." });
    expect(adjustSuggestion).toHaveBeenCalledWith("user-123", VALID_TEXT, "gentler");
    expect(logEvent).toHaveBeenCalledWith("info", "mediation.suggestion_adjusted", {
      familyId: "family-123",
      adjustment: "gentler",
      originalLength: 11,
      adjustedLength: 21,
    });
  });

  it("throws error if parent not found", async () => {
    db.parents.findByUserId.mockResolvedValue(null);

    await expect(
      adjustSuggestionTone(VALID_TEXT, "gentler"),
    ).rejects.toThrow("Parent profile not found");
  });
});