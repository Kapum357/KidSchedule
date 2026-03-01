/**
 * Hash Chain Engine Unit Tests
 *
 * Tests for the cryptographic hash chain implementation used for
 * message integrity verification in co-parenting communications.
 */

import {
  sha256,
  computeMessageHash,
  hashMessage,
  hashMessageBatch,
  verifyChain,
  verifyChainExtension,
  getNextChainIndex,
  getLastMessageHash,
  type MessageForHashing,
  type HashedMessage,
} from "@/lib/hash-chain-engine";

describe("Hash Chain Engine", () => {
  // ─── SHA-256 Tests ──────────────────────────────────────────────────────────

  describe("sha256", () => {
    it("should produce consistent hashes for the same input", async () => {
      const input = "test message";
      const hash1 = await sha256(input);
      const hash2 = await sha256(input);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", async () => {
      const hash1 = await sha256("message 1");
      const hash2 = await sha256("message 2");
      expect(hash1).not.toBe(hash2);
    });

    it("should produce 64-character hex string", async () => {
      const hash = await sha256("test");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should match known SHA-256 output", async () => {
      // Known SHA-256 hash for "hello"
      const hash = await sha256("hello");
      expect(hash).toBe(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
      );
    });
  });

  // ─── computeMessageHash Tests ───────────────────────────────────────────────

  describe("computeMessageHash", () => {
    const baseMessage: MessageForHashing = {
      threadId: "thread-123",
      senderId: "user-456",
      body: "Test message content",
      sentAt: "2026-03-01T10:00:00.000Z",
      chainIndex: 0,
    };

    it("should compute hash for genesis message (null previousHash)", async () => {
      const hash = await computeMessageHash(baseMessage, null);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should compute hash with previous hash", async () => {
      const previousHash = "a".repeat(64);
      const hash = await computeMessageHash(baseMessage, previousHash);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should produce different hash when body changes", async () => {
      const hash1 = await computeMessageHash(baseMessage, null);
      const modified = { ...baseMessage, body: "Different content" };
      const hash2 = await computeMessageHash(modified, null);
      expect(hash1).not.toBe(hash2);
    });

    it("should produce different hash when senderId changes", async () => {
      const hash1 = await computeMessageHash(baseMessage, null);
      const modified = { ...baseMessage, senderId: "different-user" };
      const hash2 = await computeMessageHash(modified, null);
      expect(hash1).not.toBe(hash2);
    });

    it("should produce different hash when previousHash changes", async () => {
      const hash1 = await computeMessageHash(baseMessage, "a".repeat(64));
      const hash2 = await computeMessageHash(baseMessage, "b".repeat(64));
      expect(hash1).not.toBe(hash2);
    });

    it("should be deterministic", async () => {
      const hash1 = await computeMessageHash(baseMessage, null);
      const hash2 = await computeMessageHash(baseMessage, null);
      expect(hash1).toBe(hash2);
    });
  });

  // ─── hashMessage Tests ──────────────────────────────────────────────────────

  describe("hashMessage", () => {
    const testMessage: MessageForHashing = {
      threadId: "thread-1",
      senderId: "sender-1",
      body: "Hello world",
      sentAt: "2026-03-01T12:00:00.000Z",
      chainIndex: 0,
    };

    it("should return HashedMessage with all original fields", async () => {
      const hashed = await hashMessage(testMessage, null);
      expect(hashed.threadId).toBe(testMessage.threadId);
      expect(hashed.senderId).toBe(testMessage.senderId);
      expect(hashed.body).toBe(testMessage.body);
      expect(hashed.sentAt).toBe(testMessage.sentAt);
      expect(hashed.chainIndex).toBe(testMessage.chainIndex);
    });

    it("should include computed messageHash", async () => {
      const hashed = await hashMessage(testMessage, null);
      expect(hashed.messageHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should include previousHash in result", async () => {
      const prevHash = "abc123".repeat(10) + "abc1";
      const hashed = await hashMessage(testMessage, prevHash);
      expect(hashed.previousHash).toBe(prevHash);
    });

    it("should set previousHash to null for genesis", async () => {
      const hashed = await hashMessage(testMessage, null);
      expect(hashed.previousHash).toBeNull();
    });
  });

  // ─── hashMessageBatch Tests ─────────────────────────────────────────────────

  describe("hashMessageBatch", () => {
    const messages: MessageForHashing[] = [
      {
        threadId: "thread-1",
        senderId: "user-A",
        body: "First message",
        sentAt: "2026-03-01T10:00:00.000Z",
        chainIndex: 0,
      },
      {
        threadId: "thread-1",
        senderId: "user-B",
        body: "Second message",
        sentAt: "2026-03-01T10:01:00.000Z",
        chainIndex: 1,
      },
      {
        threadId: "thread-1",
        senderId: "user-A",
        body: "Third message",
        sentAt: "2026-03-01T10:02:00.000Z",
        chainIndex: 2,
      },
    ];

    it("should hash all messages in batch", async () => {
      const hashed = await hashMessageBatch(messages);
      expect(hashed).toHaveLength(3);
    });

    it("should chain messages correctly", async () => {
      const hashed = await hashMessageBatch(messages);
      
      // First message has null previousHash
      expect(hashed[0].previousHash).toBeNull();
      
      // Second message links to first
      expect(hashed[1].previousHash).toBe(hashed[0].messageHash);
      
      // Third message links to second
      expect(hashed[2].previousHash).toBe(hashed[1].messageHash);
    });

    it("should sort by chainIndex before hashing", async () => {
      // Provide messages in wrong order
      const unordered = [messages[2], messages[0], messages[1]];
      const hashed = await hashMessageBatch(unordered);
      
      expect(hashed[0].chainIndex).toBe(0);
      expect(hashed[1].chainIndex).toBe(1);
      expect(hashed[2].chainIndex).toBe(2);
    });

    it("should handle empty array", async () => {
      const hashed = await hashMessageBatch([]);
      expect(hashed).toHaveLength(0);
    });

    it("should handle single message", async () => {
      const hashed = await hashMessageBatch([messages[0]]);
      expect(hashed).toHaveLength(1);
      expect(hashed[0].previousHash).toBeNull();
    });
  });

  // ─── verifyChain Tests ──────────────────────────────────────────────────────

  describe("verifyChain", () => {
    it("should verify valid chain", async () => {
      const messages: MessageForHashing[] = [
        {
          threadId: "thread-1",
          senderId: "user-A",
          body: "Message 1",
          sentAt: "2026-03-01T10:00:00.000Z",
          chainIndex: 0,
        },
        {
          threadId: "thread-1",
          senderId: "user-B",
          body: "Message 2",
          sentAt: "2026-03-01T10:01:00.000Z",
          chainIndex: 1,
        },
      ];

      const hashed = await hashMessageBatch(messages);
      const result = await verifyChain(hashed);

      expect(result.isValid).toBe(true);
      expect(result.verifiedCount).toBe(2);
      expect(result.tamperDetectedAtIndex).toBeNull();
      expect(result.report.errors).toHaveLength(0);
    });

    it("should detect tampered message body", async () => {
      const messages: MessageForHashing[] = [
        {
          threadId: "thread-1",
          senderId: "user-A",
          body: "Original message",
          sentAt: "2026-03-01T10:00:00.000Z",
          chainIndex: 0,
        },
      ];

      const hashed = await hashMessageBatch(messages);
      
      // Tamper with the message body after hashing
      const tampered: HashedMessage[] = [
        {
          ...hashed[0],
          body: "Tampered message",
        },
      ];

      const result = await verifyChain(tampered);

      expect(result.isValid).toBe(false);
      expect(result.tamperDetectedAtIndex).toBe(0);
      expect(result.report.errors).toHaveLength(1);
      expect(result.report.errors[0].error).toContain("tampered");
    });

    it("should detect broken chain link", async () => {
      const messages: MessageForHashing[] = [
        {
          threadId: "thread-1",
          senderId: "user-A",
          body: "Message 1",
          sentAt: "2026-03-01T10:00:00.000Z",
          chainIndex: 0,
        },
        {
          threadId: "thread-1",
          senderId: "user-B",
          body: "Message 2",
          sentAt: "2026-03-01T10:01:00.000Z",
          chainIndex: 1,
        },
      ];

      const hashed = await hashMessageBatch(messages);
      
      // Break the chain by modifying previousHash
      const broken: HashedMessage[] = [
        hashed[0],
        {
          ...hashed[1],
          previousHash: "wrong-hash-".repeat(6) + "wrong", // 64 chars
        },
      ];

      const result = await verifyChain(broken);

      expect(result.isValid).toBe(false);
      expect(result.report.errors.length).toBeGreaterThan(0);
    });

    it("should handle empty chain", async () => {
      const result = await verifyChain([]);

      expect(result.isValid).toBe(true);
      expect(result.verifiedCount).toBe(0);
    });

    it("should provide detailed verification report", async () => {
      const messages: MessageForHashing[] = [
        {
          threadId: "thread-99",
          senderId: "user-A",
          body: "Test",
          sentAt: "2026-03-01T10:00:00.000Z",
          chainIndex: 0,
        },
      ];

      const hashed = await hashMessageBatch(messages);
      const result = await verifyChain(hashed);

      expect(result.report.threadId).toBe("thread-99");
      expect(result.report.totalMessages).toBe(1);
      expect(result.report.validMessages).toBe(1);
      expect(result.report.invalidMessages).toBe(0);
    });
  });

  // ─── verifyChainExtension Tests ─────────────────────────────────────────────

  describe("verifyChainExtension", () => {
    it("should validate genesis message", async () => {
      const genesis: MessageForHashing = {
        threadId: "thread-1",
        senderId: "user-A",
        body: "First message",
        sentAt: "2026-03-01T10:00:00.000Z",
        chainIndex: 0,
      };

      const hashed = await hashMessage(genesis, null);
      const result = await verifyChainExtension(hashed, null);

      expect(result.valid).toBe(true);
    });

    it("should validate valid chain extension", async () => {
      const messages: MessageForHashing[] = [
        {
          threadId: "thread-1",
          senderId: "user-A",
          body: "First",
          sentAt: "2026-03-01T10:00:00.000Z",
          chainIndex: 0,
        },
        {
          threadId: "thread-1",
          senderId: "user-B",
          body: "Second",
          sentAt: "2026-03-01T10:01:00.000Z",
          chainIndex: 1,
        },
      ];

      const [first] = await hashMessageBatch([messages[0]]);
      const second = await hashMessage(messages[1], first.messageHash);

      const result = await verifyChainExtension(second, first);

      expect(result.valid).toBe(true);
    });

    it("should reject wrong chainIndex", async () => {
      const first = await hashMessage(
        {
          threadId: "thread-1",
          senderId: "user-A",
          body: "First",
          sentAt: "2026-03-01T10:00:00.000Z",
          chainIndex: 0,
        },
        null
      );

      const wrongIndex: HashedMessage = {
        threadId: "thread-1",
        senderId: "user-B",
        body: "Second",
        sentAt: "2026-03-01T10:01:00.000Z",
        chainIndex: 5, // Wrong! Should be 1
        messageHash: "doesntmatter".repeat(5) + "xxxx",
        previousHash: first.messageHash,
      };

      const result = await verifyChainExtension(wrongIndex, first);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("chainIndex");
    });

    it("should reject wrong previousHash", async () => {
      const first = await hashMessage(
        {
          threadId: "thread-1",
          senderId: "user-A",
          body: "First",
          sentAt: "2026-03-01T10:00:00.000Z",
          chainIndex: 0,
        },
        null
      );

      const wrongPrevHash: HashedMessage = {
        threadId: "thread-1",
        senderId: "user-B",
        body: "Second",
        sentAt: "2026-03-01T10:01:00.000Z",
        chainIndex: 1,
        messageHash: "doesntmatter".repeat(5) + "xxxx",
        previousHash: "wrong-hash-".repeat(6) + "wrong",
      };

      const result = await verifyChainExtension(wrongPrevHash, first);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Previous hash");
    });
  });

  // ─── Utility Function Tests ─────────────────────────────────────────────────

  describe("getNextChainIndex", () => {
    it("should return 0 for empty array", () => {
      expect(getNextChainIndex([])).toBe(0);
    });

    it("should return max + 1 for existing messages", () => {
      const messages = [{ chainIndex: 0 }, { chainIndex: 1 }, { chainIndex: 2 }];
      expect(getNextChainIndex(messages)).toBe(3);
    });

    it("should handle non-sequential indices", () => {
      const messages = [{ chainIndex: 0 }, { chainIndex: 5 }];
      expect(getNextChainIndex(messages)).toBe(6);
    });
  });

  describe("getLastMessageHash", () => {
    it("should return null for empty array", () => {
      expect(getLastMessageHash([])).toBeNull();
    });

    it("should return hash of message with highest chainIndex", async () => {
      const messages: MessageForHashing[] = [
        {
          threadId: "t1",
          senderId: "u1",
          body: "First",
          sentAt: "2026-03-01T10:00:00.000Z",
          chainIndex: 0,
        },
        {
          threadId: "t1",
          senderId: "u2",
          body: "Second",
          sentAt: "2026-03-01T10:01:00.000Z",
          chainIndex: 1,
        },
      ];

      const hashed = await hashMessageBatch(messages);
      const lastHash = getLastMessageHash(hashed);

      expect(lastHash).toBe(hashed[1].messageHash);
    });
  });
});
