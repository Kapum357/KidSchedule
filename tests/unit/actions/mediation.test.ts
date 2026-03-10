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
  ...jest.requireActual("@/lib"),
  requireAuth: jest.fn(),
}));

jest.mock("@/lib/persistence", () => ({
  db: {
    parents: {
      findByUserId: jest.fn(),
      findById: jest.fn(),
    },
    mediationTopics: {
      findById: jest.fn(),
      update: jest.fn(),
      findByFamilyId: jest.fn(),
      saveDraft: jest.fn(),
      create: jest.fn(),
    },
    messageThreads: {
      findByParticipantsAndSubject: jest.fn(),
      create: jest.fn(),
    },
    messages: {
      create: jest.fn(),
      findByFamilyId: jest.fn(),
    },
    mediationWarnings: {
      findByFamilyId: jest.fn(),
      findUndismissedByFamilyId: jest.fn(),
      findById: jest.fn(),
      dismiss: jest.fn(),
      getStats: jest.fn(),
    },
  },
}));

jest.mock("@/lib/providers/ai", () => ({
  adjustSuggestion: jest.fn(),
}));

jest.mock("@/lib/providers/ai/mediation-assistant", () => ({
  getDeescalationTips: jest.fn(),
}));

jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { adjustSuggestionTone, sendMediationSuggestion, loadMediationData, dismissWarning, getDeescalationTips } from "@/app/mediation/page-actions";
import { requireAuth } from "@/lib";
import { db } from "@/lib/persistence";
import { adjustSuggestion } from "@/lib/providers/ai";
import { getDeescalationTips as getDeescalationTipsFromAssistant } from "@/lib/providers/ai/mediation-assistant";
import { ValidationError, ServerError } from "@/lib";
import { logEvent } from "@/lib/observability/logger";

// ─── Shared test data ─────────────────────────────────────────────────────────

const FAMILY_ID = "family-123";
const mockUser = { userId: "user-123", email: "test@example.com", sessionId: "session-123" };
const mockParent = {
  id: "parent-123",
  familyId: FAMILY_ID,
  userId: "user-123",
  name: "Test Parent",
  email: "test@example.com",
  role: "parent" as const,
  createdAt: new Date().toISOString(),
};

describe("adjustSuggestionTone", () => {
  const VALID_TEXT = "Hello world";
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
    ).rejects.toThrow("Text must be under 2000 characters");
  });

  it("allows exactly 2000 chars", async () => {
    const text2000 = "a".repeat(MAX_LENGTH);
    adjustSuggestion.mockResolvedValue({ adjustedText: "adjusted text", isFallback: false });

    const result = await adjustSuggestionTone(text2000, "gentler");

    expect(result).toEqual({ adjustedText: "adjusted text", isFallback: false });
    expect(adjustSuggestion).toHaveBeenCalledWith("user-123", text2000, "gentler");
  });

  it("handles API failure gracefully", async () => {
    adjustSuggestion.mockResolvedValue({ adjustedText: VALID_TEXT, isFallback: true });

    const result = await adjustSuggestionTone(VALID_TEXT, "gentler");

    expect(result).toEqual({ adjustedText: VALID_TEXT, isFallback: true });
    expect(adjustSuggestion).toHaveBeenCalledWith("user-123", VALID_TEXT, "gentler");
    expect(logEvent).toHaveBeenCalledWith("warn", "mediation.suggestion_adjustment_fallback", {
      familyId: FAMILY_ID,
      adjustment: "gentler",
      reason: "Claude API error - using original text",
    });
  });

  it("succeeds with valid input", async () => {
    adjustSuggestion.mockResolvedValue({ adjustedText: "This is gentler text.", isFallback: false });

    const result = await adjustSuggestionTone(VALID_TEXT, "gentler");

    expect(result).toEqual({ adjustedText: "This is gentler text.", isFallback: false });
    expect(adjustSuggestion).toHaveBeenCalledWith("user-123", VALID_TEXT, "gentler");
    expect(logEvent).toHaveBeenCalledWith("info", "mediation.suggestion_adjusted", {
      familyId: "family-123",
      adjustment: "gentler",
      originalLength: 11,
      adjustedLength: 21,
    });
  });

  it("logs error on API failure", async () => {
    adjustSuggestion.mockRejectedValue(new Error("Claude API unavailable"));

    const result = await adjustSuggestionTone(VALID_TEXT, "gentler");

    expect(result).toEqual({ adjustedText: VALID_TEXT, isFallback: true });
    expect(logEvent).toHaveBeenCalledWith("error", "mediation.suggestion_adjustment_failed", {
      familyId: FAMILY_ID,
      adjustment: "gentler",
      errorMessage: "Claude API unavailable",
    });
  });
});

describe("sendMediationSuggestion", () => {
  const TOPIC_ID = "topic-123";
  const RECIPIENT_ID = "recipient-123";
  const THREAD_ID = "thread-123";
  const MESSAGE_ID = "message-123";
  const MAX_LENGTH = 2000;

  const mockTopic = { id: TOPIC_ID, familyId: FAMILY_ID, title: "Test Topic" };
  const mockRecipient = { id: RECIPIENT_ID, familyId: FAMILY_ID };
  const mockThread = { id: THREAD_ID };
  const mockMessage = { id: MESSAGE_ID };

  beforeEach(() => {
    jest.clearAllMocks();
    requireAuth.mockResolvedValue(mockUser);
    db.parents.findByUserId.mockResolvedValue(mockParent);
    db.mediationTopics.findById.mockResolvedValue(mockTopic);
    db.parents.findById.mockResolvedValue(mockRecipient);
    db.messageThreads.findByParticipantsAndSubject.mockResolvedValue(null);
    db.messageThreads.create.mockResolvedValue(mockThread);
    db.messages.create.mockResolvedValue(mockMessage);
    db.mediationTopics.update.mockResolvedValue(undefined);
    db.mediationWarnings.findByFamilyId.mockResolvedValue([]);
  });

  it("throws ValidationError for empty text", async () => {
    await expect(
      sendMediationSuggestion(TOPIC_ID, "", RECIPIENT_ID),
    ).rejects.toThrow(ValidationError);
    await expect(
      sendMediationSuggestion(TOPIC_ID, "", RECIPIENT_ID),
    ).rejects.toThrow("cannot be empty");
  });

  it("throws ValidationError for only whitespace", async () => {
    await expect(
      sendMediationSuggestion(TOPIC_ID, "   ", RECIPIENT_ID),
    ).rejects.toThrow(ValidationError);
    await expect(
      sendMediationSuggestion(TOPIC_ID, "   ", RECIPIENT_ID),
    ).rejects.toThrow("cannot be empty");
  });

  it("throws ValidationError for text over 2000 chars", async () => {
    const longText = "a".repeat(MAX_LENGTH + 1);
    await expect(
      sendMediationSuggestion(TOPIC_ID, longText, RECIPIENT_ID),
    ).rejects.toThrow(ValidationError);
    await expect(
      sendMediationSuggestion(TOPIC_ID, longText, RECIPIENT_ID),
    ).rejects.toThrow("must be under 2,000 characters");
  });

  it("succeeds with 1 character", async () => {
    const result = await sendMediationSuggestion(TOPIC_ID, "a", RECIPIENT_ID);
    expect(result).toEqual({ success: true, messageId: MESSAGE_ID });
  });

  it("succeeds with exactly 2000 characters", async () => {
    const text2000 = "a".repeat(MAX_LENGTH);
    const result = await sendMediationSuggestion(TOPIC_ID, text2000, RECIPIENT_ID);
    expect(result).toEqual({ success: true, messageId: MESSAGE_ID });
  });

  it("throws ValidationError for non-existent topic", async () => {
    db.mediationTopics.findById.mockResolvedValue(null);
    await expect(
      sendMediationSuggestion(TOPIC_ID, "Hello", RECIPIENT_ID),
    ).rejects.toThrow(ValidationError);
    await expect(
      sendMediationSuggestion(TOPIC_ID, "Hello", RECIPIENT_ID),
    ).rejects.toThrow("Topic not found");
  });

  it("throws ValidationError for topic access denied", async () => {
    db.mediationTopics.findById.mockResolvedValue({ ...mockTopic, familyId: "other-family" });
    await expect(
      sendMediationSuggestion(TOPIC_ID, "Hello", RECIPIENT_ID),
    ).rejects.toThrow(ValidationError);
    await expect(
      sendMediationSuggestion(TOPIC_ID, "Hello", RECIPIENT_ID),
    ).rejects.toThrow("Topic not found or access denied");
  });

  it("throws ValidationError for non-existent recipient", async () => {
    db.parents.findById.mockResolvedValue(null);
    await expect(
      sendMediationSuggestion(TOPIC_ID, "Hello", RECIPIENT_ID),
    ).rejects.toThrow(ValidationError);
    await expect(
      sendMediationSuggestion(TOPIC_ID, "Hello", RECIPIENT_ID),
    ).rejects.toThrow("Recipient parent not found");
  });

  it("throws ServerError for database errors", async () => {
    db.messages.create.mockRejectedValue(new Error("Database error"));
    await expect(
      sendMediationSuggestion(TOPIC_ID, "Hello", RECIPIENT_ID),
    ).rejects.toThrow(ServerError);
  });

  it("succeeds with valid input", async () => {
    const result = await sendMediationSuggestion(TOPIC_ID, "Hello world", RECIPIENT_ID);
    expect(result).toEqual({ success: true, messageId: MESSAGE_ID });
    expect(db.messages.create).toHaveBeenCalled();
    expect(db.mediationTopics.update).toHaveBeenCalledWith(TOPIC_ID, { status: "in_progress" });
    expect(logEvent).toHaveBeenCalledWith("info", "mediation.suggestion_sent", {
      topicId: TOPIC_ID,
      messageId: MESSAGE_ID,
      familyId: FAMILY_ID,
      threadId: THREAD_ID,
      activeConflictCount: 0,
      hasHighSeverityConflict: false,
    });
  });
});

describe("loadMediationData", () => {
  const mockTopics = [
    {
      id: "topic-1",
      familyId: FAMILY_ID,
      parentId: "parent-123",
      title: "Test Topic",
      description: null,
      status: "draft" as const,
      draftSuggestion: undefined,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockWarnings = [
    {
      id: "warning-1",
      familyId: FAMILY_ID,
      messageId: "message-1",
      senderParentId: "parent-456",
      category: "aggressive_capitalization",
      severity: "high" as const,
      title: "Aggressive Capitalization",
      description: "Message contains aggressive capitalization",
      excerpt: "STOP YELLING AT ME!",
      flaggedAt: new Date().toISOString(),
      dismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockStats = {
    total: 1,
    undismissed: 1,
    highSeverityCount: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    requireAuth.mockResolvedValue(mockUser);
    db.parents.findByUserId.mockResolvedValue(mockParent);
    db.mediationTopics.findByFamilyId.mockResolvedValue(mockTopics);
    db.mediationWarnings.findUndismissedByFamilyId.mockResolvedValue(mockWarnings);
    db.mediationWarnings.getStats.mockResolvedValue(mockStats);
  });

  it("loads mediation data for current user's family", async () => {
    const result = await loadMediationData();

    expect(db.parents.findByUserId).toHaveBeenCalledWith("user-123");
    expect(db.mediationTopics.findByFamilyId).toHaveBeenCalledWith(FAMILY_ID);
    expect(db.mediationWarnings.findUndismissedByFamilyId).toHaveBeenCalledWith(FAMILY_ID);
    expect(db.mediationWarnings.getStats).toHaveBeenCalledWith(FAMILY_ID);

    expect(result).toEqual({
      topics: [
        {
          id: "topic-1",
          title: "Test Topic",
          status: "draft",
          createdAt: expect.any(String),
          lastEditedAt: expect.any(String),
          draftSuggestion: undefined,
          isNew: true,
        },
      ],
      warnings: [
        {
          id: "warning-1",
          category: "aggressive_capitalization",
          severity: "high",
          title: "Aggressive Capitalization",
          description: "Message contains aggressive capitalization",
          createdAt: expect.any(String),
        },
      ],
      stats: mockStats,
    });
  });

  it("throws error if parent not found", async () => {
    db.parents.findByUserId.mockResolvedValue(null);

    await expect(loadMediationData()).rejects.toThrow("Parent profile not found");
  });
});

describe("dismissWarning", () => {
  const WARNING_ID = "warning-123";
  const mockWarning = {
    id: WARNING_ID,
    familyId: FAMILY_ID,
    messageId: "message-1",
    senderParentId: "parent-456",
    category: "aggressive_capitalization",
    severity: "high" as const,
    title: "Aggressive Capitalization",
    description: "Message contains aggressive capitalization",
    excerpt: "STOP YELLING AT ME!",
    flaggedAt: new Date().toISOString(),
    dismissed: false,
    dismissedAt: null,
    dismissedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    requireAuth.mockResolvedValue(mockUser);
    db.parents.findByUserId.mockResolvedValue(mockParent);
    db.mediationWarnings.findById.mockResolvedValue(mockWarning);
    db.mediationWarnings.dismiss.mockResolvedValue(undefined);
  });

  it("dismisses warning successfully", async () => {
    await dismissWarning(WARNING_ID);

    expect(db.parents.findByUserId).toHaveBeenCalledWith("user-123");
    expect(db.mediationWarnings.findById).toHaveBeenCalledWith(WARNING_ID);
    expect(db.mediationWarnings.dismiss).toHaveBeenCalledWith(WARNING_ID, "parent-123");
    expect(logEvent).toHaveBeenCalledWith("info", "mediation.warning_dismissed", {
      warningId: WARNING_ID,
      familyId: FAMILY_ID,
      withAcknowledgment: false,
    });
  });

  it("throws error if parent not found", async () => {
    db.parents.findByUserId.mockResolvedValue(null);

    await expect(dismissWarning(WARNING_ID)).rejects.toThrow("Parent profile not found");
  });

  it("throws error if warning not found", async () => {
    db.mediationWarnings.findById.mockResolvedValue(null);

    await expect(dismissWarning(WARNING_ID)).rejects.toThrow("Warning not found or access denied");
  });

  it("throws error if warning belongs to different family", async () => {
    const otherFamilyWarning = { ...mockWarning, familyId: "other-family" };
    db.mediationWarnings.findById.mockResolvedValue(otherFamilyWarning);

    await expect(dismissWarning(WARNING_ID)).rejects.toThrow("Warning not found or access denied");
  });
});

describe("getDeescalationTips", () => {
  const mockMessages = [
    {
      id: "message-1",
      familyId: FAMILY_ID,
      threadId: "thread-1",
      senderId: "parent-123",
      body: "Hello world",
      sentAt: new Date().toISOString(),
      attachmentIds: [],
      messageHash: "",
      chainIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    requireAuth.mockResolvedValue(mockUser);
    db.parents.findByUserId.mockResolvedValue(mockParent);
    db.messages.findByFamilyId.mockResolvedValue(mockMessages);
    getDeescalationTipsFromAssistant.mockResolvedValue(["Tip 1", "Tip 2"]);
  });

  it("retrieves de-escalation tips successfully", async () => {
    const result = await getDeescalationTips();

    expect(db.parents.findByUserId).toHaveBeenCalledWith("user-123");
    expect(db.messages.findByFamilyId).toHaveBeenCalledWith(FAMILY_ID);
    expect(getDeescalationTipsFromAssistant).toHaveBeenCalledWith("user-123", mockMessages);
    expect(logEvent).toHaveBeenCalledWith("info", "mediation.deescalation_tips_retrieved", {
      familyId: FAMILY_ID,
      tipsCount: 2,
      messagesAnalyzed: 1,
    });
    expect(result).toEqual(["Tip 1", "Tip 2"]);
  });

  it("throws error if parent not found", async () => {
    db.parents.findByUserId.mockResolvedValue(null);

    await expect(getDeescalationTips()).rejects.toThrow("Parent profile not found");
  });

  it("logs error on AI failure", async () => {
    getDeescalationTipsFromAssistant.mockRejectedValue(new Error("AI service unavailable"));

    await expect(getDeescalationTips()).rejects.toThrow("AI service unavailable");
    expect(logEvent).toHaveBeenCalledWith("error", "mediation.deescalation_tips_failed", {
      familyId: FAMILY_ID,
      errorMessage: "AI service unavailable",
    });
  });
});

// ─── Performance Tests ───────────────────────────────────────────────────────

describe("Performance Requirements", () => {
  const TOPIC_ID = "topic-123";
  const RECIPIENT_ID = "recipient-123";
  const THREAD_ID = "thread-123";
  const MESSAGE_ID = "message-123";
  const WARNING_ID = "warning-123";
  const MAX_SEND_DISMISS_TIME_MS = 2000;
  const MAX_AI_TIME_MS = 5000;

  beforeEach(() => {
    jest.clearAllMocks();
    (requireAuth as jest.MockedFunction<typeof requireAuth>).mockResolvedValue(mockUser);
    (db.parents.findByUserId as jest.MockedFunction<typeof db.parents.findByUserId>).mockResolvedValue({
      ...mockParent,
      role: "primary",
    });
  });

  it("sendMediationSuggestion completes within 2 seconds", async () => {
    // Setup mocks for successful send
    (db.mediationTopics.findById as jest.MockedFunction<typeof db.mediationTopics.findById>).mockResolvedValue({
      id: TOPIC_ID,
      familyId: FAMILY_ID,
      parentId: "parent-123",
      title: "Test Topic",
      description: undefined,
      status: "draft",
      draftSuggestion: undefined,
      resolvedAt: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    (db.parents.findById as jest.MockedFunction<typeof db.parents.findById>).mockResolvedValue({
      id: RECIPIENT_ID,
      familyId: FAMILY_ID,
      userId: "user-456",
      name: "Other Parent",
      email: "other@example.com",
      role: "secondary",
      createdAt: new Date().toISOString(),
    });
    (db.messageThreads.findByParticipantsAndSubject as jest.MockedFunction<typeof db.messageThreads.findByParticipantsAndSubject>).mockResolvedValue(null);
    (db.messageThreads.create as jest.MockedFunction<typeof db.messageThreads.create>).mockResolvedValue({
      id: THREAD_ID,
      familyId: FAMILY_ID,
      subject: "Mediation: Test Topic",
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    });
    (db.messages.create as jest.MockedFunction<typeof db.messages.create>).mockResolvedValue({
      id: MESSAGE_ID,
      threadId: THREAD_ID,
      familyId: FAMILY_ID,
      senderId: "parent-123",
      body: "Hello world",
      sentAt: new Date().toISOString(),
      attachmentIds: [],
      messageHash: "",
      chainIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    (db.mediationTopics.update as jest.MockedFunction<typeof db.mediationTopics.update>).mockResolvedValue({
      id: TOPIC_ID,
      familyId: FAMILY_ID,
      parentId: "parent-123",
      title: "Test Topic",
      description: undefined,
      status: "in_progress",
      draftSuggestion: undefined,
      resolvedAt: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    (db.mediationWarnings.findByFamilyId as jest.MockedFunction<typeof db.mediationWarnings.findByFamilyId>).mockResolvedValue([]);

    const startTime = Date.now();
    await sendMediationSuggestion(TOPIC_ID, "Hello world", RECIPIENT_ID);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(MAX_SEND_DISMISS_TIME_MS);
  });

  it("dismissWarning completes within 2 seconds", async () => {
    (db.mediationWarnings.findById as jest.MockedFunction<typeof db.mediationWarnings.findById>).mockResolvedValue({
      id: WARNING_ID,
      familyId: FAMILY_ID,
      messageId: "message-1",
      senderParentId: "parent-456",
      category: "aggressive_capitalization",
      severity: "high",
      title: "Aggressive Capitalization",
      description: "Message contains aggressive capitalization",
      excerpt: "STOP YELLING AT ME!",
      flaggedAt: new Date().toISOString(),
      dismissed: false,
      dismissedAt: undefined,
      dismissedBy: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    (db.mediationWarnings.dismiss as jest.MockedFunction<typeof db.mediationWarnings.dismiss>).mockResolvedValue({
      id: WARNING_ID,
      familyId: FAMILY_ID,
      messageId: "message-1",
      senderParentId: "parent-456",
      category: "aggressive_capitalization",
      severity: "high",
      title: "Aggressive Capitalization",
      description: "Message contains aggressive capitalization",
      excerpt: "STOP YELLING AT ME!",
      flaggedAt: new Date().toISOString(),
      dismissed: true,
      dismissedAt: new Date().toISOString(),
      dismissedBy: "parent-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const startTime = Date.now();
    await dismissWarning(WARNING_ID);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(MAX_SEND_DISMISS_TIME_MS);
  });

  it("adjustSuggestionTone completes within 5 seconds", async () => {
    (adjustSuggestion as jest.MockedFunction<typeof adjustSuggestion>).mockResolvedValue({
      adjustedText: "Hello world, please be gentle",
      isFallback: false,
    });

    const startTime = Date.now();
    const result = await adjustSuggestionTone("Hello world", "gentler");
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(MAX_AI_TIME_MS);
    expect(result.adjustedText).toBe("Hello world, please be gentle");
    expect(result.isFallback).toBe(false);
  });
});