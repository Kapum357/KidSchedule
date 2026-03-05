/**
 * Messages Action Unit Tests
 *
 * Tests the sendMessage server action and resolveMessageState helper.
 *
 * Key invariants under test:
 *  - Empty messages → error redirect (no DB touch)
 *  - Messages > 2000 chars → error redirect + draft preserved (no DB touch)
 *  - Hostile tone detected → blocked redirect with indicators/suggestion (no DB write)
 *  - Unauthenticated user → onboarding redirect
 *  - No existing thread → thread created with "Family Messages" subject
 *  - Existing thread reused (first thread in list wins)
 *  - Successful send → success=1 redirect
 *  - resolveMessageState correctly maps all search-param combinations
 */

// ─── Environment setup ───────────────────────────────────────────────────────
// jsdom provides global.crypto but omits .subtle; override with Node.js webcrypto
// so that sha256Hex (crypto.subtle.digest) works in the test environment.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { webcrypto } = require("crypto") as { webcrypto: Crypto };
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, writable: true, configurable: true });
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

// redirect() in Next.js throws internally; replicate that so guards abort execution
const mockRedirect = jest.fn().mockImplementation((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

jest.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

jest.mock("@/lib", () => ({
  requireAuth: jest.fn(),
}));

jest.mock("@/lib/persistence", () => ({
  db: {
    parents: {
      findByUserId: jest.fn(),
    },
    messageThreads: {
      findByFamilyId: jest.fn(),
      create: jest.fn(),
    },
    messages: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/providers/ai", () => ({
  analyzeMessageTone: jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { sendMessage } from "@/app/messages/actions";
import { resolveMessageState } from "@/app/messages/page";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { requireAuth } = require("@/lib") as { requireAuth: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("@/lib/persistence") as {
  db: {
    parents: { findByUserId: jest.Mock };
    messageThreads: { findByFamilyId: jest.Mock; create: jest.Mock };
    messages: { create: jest.Mock };
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { analyzeMessageTone } = require("@/lib/providers/ai") as {
  analyzeMessageTone: jest.Mock;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFormData(message: string): FormData {
  const fd = new FormData();
  fd.append("message", message);
  return fd;
}

/** Extract redirect URL from the thrown NEXT_REDIRECT error */
function captureRedirectUrl(error: unknown): string {
  expect(error).toBeInstanceOf(Error);
  const msg = (error as Error).message;
  expect(msg).toMatch(/^NEXT_REDIRECT:/);
  return msg.replace("NEXT_REDIRECT:", "");
}

function makeParent(overrides = {}) {
  return { id: "parent-1", userId: "user-1", familyId: "family-1", name: "Alice", ...overrides };
}

function makeThread(overrides = {}) {
  return { id: "thread-1", familyId: "family-1", subject: "Family Messages", ...overrides };
}

function makeMessage(overrides = {}) {
  return {
    id: "msg-1",
    threadId: "thread-1",
    familyId: "family-1",
    senderId: "parent-1",
    body: "Hello",
    sentAt: "2026-03-01T10:00:00.000Z",
    chainIndex: 0,
    messageHash: "abc123",
    ...overrides,
  };
}

// ─── resolveMessageState ──────────────────────────────────────────────────────

describe("resolveMessageState", () => {
  it("returns empty state when no search params provided", () => {
    const state = resolveMessageState(undefined);

    expect(state.successMessage).toBeUndefined();
    expect(state.errorMessage).toBeUndefined();
    expect(state.blockedMessage).toBeUndefined();
    expect(state.blockedIndicators).toEqual([]);
    expect(state.blockedSuggestion).toBeUndefined();
    expect(state.draft).toBe("");
  });

  it("sets successMessage when success=1", () => {
    const state = resolveMessageState({ success: "1" });

    expect(state.successMessage).toBe("Message sent successfully.");
    expect(state.errorMessage).toBeUndefined();
  });

  it("does not set successMessage when success is not '1'", () => {
    const state = resolveMessageState({ success: "0" });

    expect(state.successMessage).toBeUndefined();
  });

  it("sets errorMessage from error param", () => {
    const state = resolveMessageState({ error: "Please enter a message before sending." });

    expect(state.errorMessage).toBe("Please enter a message before sending.");
  });

  it("sets blockedMessage when blocked=1", () => {
    const state = resolveMessageState({ blocked: "1" });

    expect(state.blockedMessage).toBe(
      "This message was blocked before sending because it may escalate conflict."
    );
  });

  it("does not set blockedMessage when blocked is not '1'", () => {
    const state = resolveMessageState({ blocked: "0" });

    expect(state.blockedMessage).toBeUndefined();
  });

  it("parses pipe-delimited indicators", () => {
    const state = resolveMessageState({ blocked: "1", indicators: "Threatening language||Accusatory tone" });

    expect(state.blockedIndicators).toEqual(["Threatening language", "Accusatory tone"]);
  });

  it("trims whitespace from indicators and removes empty entries", () => {
    const state = resolveMessageState({ indicators: "  hostile  ||  || accusatory " });

    expect(state.blockedIndicators).toEqual(["hostile", "accusatory"]);
  });

  it("returns empty blockedIndicators when indicators param is absent", () => {
    const state = resolveMessageState({ blocked: "1" });

    expect(state.blockedIndicators).toEqual([]);
  });

  it("sets blockedSuggestion from suggestion param", () => {
    const state = resolveMessageState({ suggestion: "Perhaps we can discuss this calmly." });

    expect(state.blockedSuggestion).toBe("Perhaps we can discuss this calmly.");
  });

  it("hydrates draft from draft param", () => {
    const state = resolveMessageState({ draft: "My unfinished message" });

    expect(state.draft).toBe("My unfinished message");
  });

  it("sets draft to empty string when draft param is absent", () => {
    const state = resolveMessageState({});

    expect(state.draft).toBe("");
  });
});

// ─── sendMessage – validation guards ────────────────────────────────────────

describe("sendMessage – validation guards", () => {
  beforeEach(() => {
    requireAuth.mockResolvedValue({ userId: "user-1" });
    db.parents.findByUserId.mockResolvedValue(makeParent());
    analyzeMessageTone.mockResolvedValue({ isHostile: false, indicators: [], neutralRewrite: "" });
    db.messageThreads.findByFamilyId.mockResolvedValue([makeThread()]);
    db.messages.create.mockResolvedValue(makeMessage());
  });

  it("redirects with error when message is empty", async () => {
    const error = await sendMessage(makeFormData("")).catch((e) => e);
    const url = captureRedirectUrl(error);

    expect(url).toContain("/messages");
    expect(url).toContain("error=");
    expect(db.messages.create).not.toHaveBeenCalled();
  });

  it("redirects with error when message is only whitespace", async () => {
    const error = await sendMessage(makeFormData("   ")).catch((e) => e);
    const url = captureRedirectUrl(error);

    expect(url).toContain("error=");
    expect(db.messages.create).not.toHaveBeenCalled();
  });

  it("redirects with error and preserves draft when message exceeds 2000 chars", async () => {
    const longMessage = "a".repeat(2001);
    const error = await sendMessage(makeFormData(longMessage)).catch((e) => e);
    const url = captureRedirectUrl(error);
    const params = new URLSearchParams(url.split("?")[1]);

    expect(params.get("error")).toBeTruthy();
    expect(params.get("draft")).toBe(longMessage);
    expect(db.messages.create).not.toHaveBeenCalled();
  });

  it("accepts message of exactly 2000 chars", async () => {
    const exactMessage = "a".repeat(2000);
    await sendMessage(makeFormData(exactMessage)).catch(() => {
      // success redirect throws too — that's expected
    });

    expect(db.messages.create).toHaveBeenCalled();
  });
});

// ─── sendMessage – auth guard ─────────────────────────────────────────────────

describe("sendMessage – auth guard", () => {
  it("redirects to onboarding when parent record not found", async () => {
    requireAuth.mockResolvedValue({ userId: "user-1" });
    db.parents.findByUserId.mockResolvedValue(null);

    const error = await sendMessage(makeFormData("Hello")).catch((e) => e);
    const url = captureRedirectUrl(error);

    expect(url).toContain("/calendar/wizard");
    expect(url).toContain("onboarding=1");
  });
});

// ─── sendMessage – tone analysis guard ───────────────────────────────────────

describe("sendMessage – tone analysis guard", () => {
  beforeEach(() => {
    requireAuth.mockResolvedValue({ userId: "user-1" });
    db.parents.findByUserId.mockResolvedValue(makeParent());
  });

  it("blocks hostile message and redirects with blocked=1 and draft", async () => {
    analyzeMessageTone.mockResolvedValue({
      isHostile: true,
      indicators: [],
      neutralRewrite: "",
    });

    const error = await sendMessage(makeFormData("You are the worst!")).catch((e) => e);
    const url = captureRedirectUrl(error);
    const params = new URLSearchParams(url.split("?")[1]);

    expect(params.get("blocked")).toBe("1");
    expect(params.get("draft")).toBe("You are the worst!");
    expect(db.messages.create).not.toHaveBeenCalled();
  });

  it("includes pipe-delimited indicators in redirect URL", async () => {
    analyzeMessageTone.mockResolvedValue({
      isHostile: true,
      indicators: ["Threatening language", "Accusatory tone"],
      neutralRewrite: "",
    });

    const error = await sendMessage(makeFormData("This is hostile")).catch((e) => e);
    const url = captureRedirectUrl(error);
    const params = new URLSearchParams(url.split("?")[1]);

    expect(params.get("indicators")).toBe("Threatening language||Accusatory tone");
  });

  it("includes neutral rewrite suggestion in redirect URL", async () => {
    analyzeMessageTone.mockResolvedValue({
      isHostile: true,
      indicators: [],
      neutralRewrite: "I feel frustrated and would like to discuss this calmly.",
    });

    const error = await sendMessage(makeFormData("I hate you!")).catch((e) => e);
    const url = captureRedirectUrl(error);
    const params = new URLSearchParams(url.split("?")[1]);

    expect(params.get("suggestion")).toBe(
      "I feel frustrated and would like to discuss this calmly."
    );
  });

  it("omits indicators param when indicators array is empty", async () => {
    analyzeMessageTone.mockResolvedValue({
      isHostile: true,
      indicators: [],
      neutralRewrite: "",
    });

    const error = await sendMessage(makeFormData("hostile")).catch((e) => e);
    const url = captureRedirectUrl(error);
    const params = new URLSearchParams(url.split("?")[1]);

    expect(params.has("indicators")).toBe(false);
  });

  it("omits suggestion param when neutralRewrite is empty", async () => {
    analyzeMessageTone.mockResolvedValue({
      isHostile: true,
      indicators: ["rude"],
      neutralRewrite: "",
    });

    const error = await sendMessage(makeFormData("hostile")).catch((e) => e);
    const url = captureRedirectUrl(error);
    const params = new URLSearchParams(url.split("?")[1]);

    expect(params.has("suggestion")).toBe(false);
  });
});

// ─── sendMessage – thread management ─────────────────────────────────────────

describe("sendMessage – thread management", () => {
  beforeEach(() => {
    requireAuth.mockResolvedValue({ userId: "user-1" });
    db.parents.findByUserId.mockResolvedValue(makeParent());
    analyzeMessageTone.mockResolvedValue({ isHostile: false, indicators: [], neutralRewrite: "" });
    db.messages.create.mockResolvedValue(makeMessage());
  });

  it("creates a new thread when family has none", async () => {
    db.messageThreads.findByFamilyId.mockResolvedValue([]);
    db.messageThreads.create.mockResolvedValue(makeThread());

    await sendMessage(makeFormData("Hello")).catch(() => {});

    expect(db.messageThreads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: "family-1",
        subject: "Family Messages",
      })
    );
  });

  it("reuses the first existing thread and does not create a new one", async () => {
    db.messageThreads.findByFamilyId.mockResolvedValue([makeThread({ id: "thread-existing" })]);

    await sendMessage(makeFormData("Hello")).catch(() => {});

    expect(db.messageThreads.create).not.toHaveBeenCalled();
    expect(db.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread-existing" })
    );
  });
});

// ─── sendMessage – successful send ───────────────────────────────────────────

describe("sendMessage – successful send", () => {
  beforeEach(() => {
    requireAuth.mockResolvedValue({ userId: "user-1" });
    db.parents.findByUserId.mockResolvedValue(makeParent());
    analyzeMessageTone.mockResolvedValue({ isHostile: false, indicators: [], neutralRewrite: "" });
    db.messageThreads.findByFamilyId.mockResolvedValue([makeThread()]);
    db.messages.create.mockResolvedValue(makeMessage());
  });

  it("creates the message with correct fields", async () => {
    await sendMessage(makeFormData("Can you pick up Tuesday?")).catch(() => {});

    expect(db.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        familyId: "family-1",
        senderId: "parent-1",
        body: "Can you pick up Tuesday?",
        attachmentIds: [],
        toneAnalysis: expect.objectContaining({ isHostile: false }),
      })
    );
  });

  it("stores toneAnalysis indicators from non-hostile analysis", async () => {
    analyzeMessageTone.mockResolvedValue({
      isHostile: false,
      indicators: ["slightly tense"],
      neutralRewrite: "",
    });

    await sendMessage(makeFormData("Hello")).catch(() => {});

    expect(db.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        toneAnalysis: { isHostile: false, indicators: ["slightly tense"] },
      })
    );
  });

  it("redirects to /messages?success=1 after successful send", async () => {
    const error = await sendMessage(makeFormData("Hello there")).catch((e) => e);
    const url = captureRedirectUrl(error);
    const params = new URLSearchParams(url.split("?")[1]);

    expect(url).toContain("/messages");
    expect(params.get("success")).toBe("1");
  });
});
