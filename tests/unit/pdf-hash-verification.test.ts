/**
 * Unit tests: PDF generator hash chain and verification logic
 */

import crypto from "crypto";

// ---------------------------------------------------------------------------
// Test helpers (lightweight — don't import pdfkit in unit tests)
// ---------------------------------------------------------------------------

interface HashedMessage {
  index: number;
  messageHash: string;
  previousHash: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: string;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Build a valid hash chain from plain messages.
 * Mirrors the logic that pdf-generator and export-engine use.
 */
function buildHashChain(
  messages: { senderId: string; body: string; sentAt: string }[]
): HashedMessage[] {
  let previousHash = "";
  return messages.map((msg, idx) => {
    const payload = `${msg.senderId}|${msg.body}|${msg.sentAt}|${previousHash}`;
    const messageHash = sha256(payload);
    const hm: HashedMessage = {
      index: idx,
      messageHash,
      previousHash,
      senderId: msg.senderId,
      senderName: "Test",
      body: msg.body,
      sentAt: msg.sentAt,
    };
    previousHash = messageHash;
    return hm;
  });
}

/**
 * Validate chain continuity — matches the logic in the verification endpoint.
 */
function validateChain(messages: HashedMessage[]): {
  isValid: boolean;
  tamperDetectedAtIndex?: number;
  errors: string[];
} {
  const errors: string[] = [];

  if (messages.length === 0) return { isValid: true, errors };

  for (let i = 0; i < messages.length; i++) {
    const current = messages[i];

    if (current.index !== i) {
      errors.push(`Index mismatch at position ${i}`);
    }

    if (i > 0) {
      const previous = messages[i - 1];
      if (current.previousHash !== previous.messageHash) {
        return { isValid: false, tamperDetectedAtIndex: i, errors: [...errors, `Chain broken at ${i}`] };
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("hash chain building", () => {
  const rawMessages = [
    { senderId: "parent-a", body: "Hello", sentAt: "2025-01-01T10:00:00Z" },
    { senderId: "parent-b", body: "Hi back", sentAt: "2025-01-01T10:05:00Z" },
    { senderId: "parent-a", body: "Meeting at 3?", sentAt: "2025-01-01T10:10:00Z" },
  ];

  test("first message has empty previousHash", () => {
    const chain = buildHashChain(rawMessages);
    expect(chain[0].previousHash).toBe("");
  });

  test("each message links to the previous message hash", () => {
    const chain = buildHashChain(rawMessages);
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].previousHash).toBe(chain[i - 1].messageHash);
    }
  });

  test("message hashes are deterministic", () => {
    const chain1 = buildHashChain(rawMessages);
    const chain2 = buildHashChain(rawMessages);
    expect(chain1.map((m) => m.messageHash)).toEqual(chain2.map((m) => m.messageHash));
  });

  test("different body produces different hash", () => {
    const chain = buildHashChain(rawMessages);
    const modified = buildHashChain([
      { ...rawMessages[0], body: "TAMPERED" },
      rawMessages[1],
      rawMessages[2],
    ]);
    expect(chain[0].messageHash).not.toBe(modified[0].messageHash);
  });
});

describe("chain validation", () => {
  test("valid chain passes", () => {
    const raw = [
      { senderId: "a", body: "msg1", sentAt: "2025-01-01T10:00:00Z" },
      { senderId: "b", body: "msg2", sentAt: "2025-01-01T10:01:00Z" },
    ];
    const chain = buildHashChain(raw);
    const result = validateChain(chain);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("empty chain is valid", () => {
    const result = validateChain([]);
    expect(result.isValid).toBe(true);
  });

  test("tampered message body breaks chain at next link", () => {
    const raw = [
      { senderId: "a", body: "original", sentAt: "2025-01-01T10:00:00Z" },
      { senderId: "b", body: "response", sentAt: "2025-01-01T10:01:00Z" },
      { senderId: "a", body: "followup", sentAt: "2025-01-01T10:02:00Z" },
    ];
    const chain = buildHashChain(raw);

    // Tamper: change body of first message but keep hash the same (simulates DB manipulation)
    const tampered = [...chain];
    tampered[0] = { ...tampered[0], body: "TAMPERED" };
    // The second message's previousHash no longer matches the tampered[0].messageHash
    // because tampered[0].messageHash was computed from the ORIGINAL body,
    // but we changed the body without recomputing. This means the hash doesn't
    // match what would be computed from the tampered body — catches it in application.

    // For direct chain validation (previousHash links), the break appears at index 1
    // if we also change the hash of message 0:
    const reHashedTampered = [...chain];
    const newHash = sha256(`a|TAMPERED|2025-01-01T10:00:00Z|`);
    reHashedTampered[0] = { ...reHashedTampered[0], body: "TAMPERED", messageHash: newHash };
    // Now message[1].previousHash still points to the ORIGINAL hash, mismatch detected

    const result = validateChain(reHashedTampered);
    expect(result.isValid).toBe(false);
    expect(result.tamperDetectedAtIndex).toBe(1);
  });

  test("inserted message breaks subsequent chain links", () => {
    const raw = [
      { senderId: "a", body: "first", sentAt: "2025-01-01T10:00:00Z" },
      { senderId: "b", body: "second", sentAt: "2025-01-01T10:01:00Z" },
    ];
    const chain = buildHashChain(raw);

    // Inject a fake message between index 0 and 1, shifting indices
    const fakeMsg: HashedMessage = {
      index: 1,
      messageHash: sha256("injected"),
      previousHash: chain[0].messageHash,
      senderId: "attacker",
      senderName: "Attacker",
      body: "injected message",
      sentAt: "2025-01-01T10:00:30Z",
    };
    // Original chain[1] now has wrong previousHash (points to chain[0] hash,
    // but injected message is now at index 1)
    const manipulated: HashedMessage[] = [chain[0], fakeMsg, { ...chain[1], index: 2 }];

    const result = validateChain(manipulated);
    expect(result.isValid).toBe(false);
    expect(result.tamperDetectedAtIndex).toBe(2);
  });

  test("index mismatch is detected", () => {
    const raw = [
      { senderId: "a", body: "msg", sentAt: "2025-01-01T10:00:00Z" },
    ];
    const chain = buildHashChain(raw);
    const badIndex = [{ ...chain[0], index: 99 }];
    const result = validateChain(badIndex);
    expect(result.isValid).toBe(false);
  });
});

describe("SHA-256 hash properties", () => {
  test("produces 64-char hex string", () => {
    const h = sha256("test data");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic", () => {
    expect(sha256("same input")).toBe(sha256("same input"));
  });

  test("avalanche effect: small change produces completely different hash", () => {
    const h1 = sha256("Hello world");
    const h2 = sha256("Hello World"); // capital W
    expect(h1).not.toBe(h2);
    // Count differing characters — should be many (avalanche)
    const diff = [...h1].filter((c, i) => c !== h2[i]).length;
    expect(diff).toBeGreaterThan(20);
  });
});
