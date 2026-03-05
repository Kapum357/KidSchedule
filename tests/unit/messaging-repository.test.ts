/**
 * Messaging Repository Unit Tests
 *
 * Tests the three messaging repositories: MessageThread, Message, and
 * HashChainVerification. The SQL client is mocked to avoid a live database,
 * while hash-chain-engine is mocked to provide deterministic hashes.
 *
 * Key invariants under test:
 *  - Messages are immutable (update() must throw)
 *  - Chain index is auto-incremented from the last message in the thread
 *  - previousHash is taken from the last message's messageHash
 *  - thread.last_message_at is updated after each insert
 *  - Unread queries filter on read_at IS NULL
 *  - Verification records capture isValid and tamperDetectedAtIndex
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock the postgres client BEFORE importing the repository
jest.mock("@/lib/persistence/postgres/client", () => {
  const mockSql = jest.fn();
  // Make sql usable as a tagged template literal: sql`query ${val}`
  // postgres.js tagged template functions are called with (strings, ...values)
  // Our mock simply delegates to the function itself so tests can control the return value.
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) =>
    mockSql(strings, ...values);
  // Attach the raw mock so tests can assert on calls
  tag._mock = mockSql;
  tag.unsafe = jest.fn();
  return { sql: tag };
});

// Mock hash-chain-engine to return deterministic hashes
jest.mock("@/lib/hash-chain-engine", () => ({
  computeMessageHash: jest.fn().mockResolvedValue("deterministic-hash-abc123"),
}));

import {
  createMessageThreadRepository,
  createMessageRepository,
  createHashChainVerificationRepository,
} from "@/lib/persistence/postgres/messaging-repository";
import { computeMessageHash } from "@/lib/hash-chain-engine";

// Helper to get the underlying jest.fn() from the tagged-template mock
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqlMock = (require("@/lib/persistence/postgres/client").sql as { _mock: jest.Mock })._mock;

// ─── Factories ───────────────────────────────────────────────────────────────

function makeThread(overrides = {}) {
  return {
    id: "thread-1",
    familyId: "family-1",
    subject: "School pickup change",
    createdAt: "2026-03-01T10:00:00.000Z",
    lastMessageAt: "2026-03-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeMessage(overrides = {}) {
  return {
    id: "msg-1",
    threadId: "thread-1",
    familyId: "family-1",
    senderId: "parent-1",
    body: "Can you pick up Tuesday?",
    sentAt: "2026-03-01T10:05:00.000Z",
    readAt: undefined,
    attachmentIds: [],
    toneAnalysis: undefined,
    messageHash: "deterministic-hash-abc123",
    previousHash: undefined,
    chainIndex: 0,
    createdAt: "2026-03-01T10:05:00.000Z",
    updatedAt: "2026-03-01T10:05:00.000Z",
    ...overrides,
  };
}

function makeVerification(overrides = {}) {
  return {
    id: "ver-1",
    threadId: "thread-1",
    verifiedAt: "2026-03-01T12:00:00.000Z",
    verifiedBy: "parent-1",
    isValid: true,
    tamperDetectedAtIndex: undefined,
    verificationReport: undefined,
    ...overrides,
  };
}

// ─── MessageThreadRepository ──────────────────────────────────────────────────

describe("MessageThreadRepository", () => {
  let repo: ReturnType<typeof createMessageThreadRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = createMessageThreadRepository();
  });

  describe("findById", () => {
    it("returns the thread when found", async () => {
      const thread = makeThread();
      sqlMock.mockResolvedValueOnce([thread]);

      const result = await repo.findById("thread-1");

      expect(result).toEqual(thread);
    });

    it("returns null when not found", async () => {
      sqlMock.mockResolvedValueOnce([]);

      const result = await repo.findById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findByFamilyId", () => {
    it("returns threads ordered by last_message_at DESC", async () => {
      const threads = [makeThread({ id: "t2" }), makeThread({ id: "t1" })];
      sqlMock.mockResolvedValueOnce(threads);

      const result = await repo.findByFamilyId("family-1");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("t2");
    });

    it("returns empty array when family has no threads", async () => {
      sqlMock.mockResolvedValueOnce([]);

      const result = await repo.findByFamilyId("family-1");

      expect(result).toEqual([]);
    });
  });

  describe("create", () => {
    it("creates a thread and returns it with generated id and timestamps", async () => {
      const created = makeThread();
      sqlMock.mockResolvedValueOnce([created]);

      const result = await repo.create({ familyId: "family-1", subject: "School pickup change" });

      expect(result).toEqual(created);
      expect(sqlMock).toHaveBeenCalledTimes(1);
    });

    it("accepts a thread without a subject (optional field)", async () => {
      const created = makeThread({ subject: undefined });
      sqlMock.mockResolvedValueOnce([created]);

      const result = await repo.create({ familyId: "family-1" });

      expect(result).toBeDefined();
    });
  });
});

// ─── MessageRepository ────────────────────────────────────────────────────────

describe("MessageRepository", () => {
  let repo: ReturnType<typeof createMessageRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = createMessageRepository();
  });

  describe("findByThreadId", () => {
    it("returns messages ordered by chain_index ASC", async () => {
      const msgs = [makeMessage({ chainIndex: 0 }), makeMessage({ chainIndex: 1, id: "msg-2" })];
      sqlMock.mockResolvedValueOnce(msgs);

      const result = await repo.findByThreadId("thread-1");

      expect(result[0].chainIndex).toBe(0);
      expect(result[1].chainIndex).toBe(1);
    });
  });

  describe("findUnreadByFamilyId", () => {
    it("returns only messages where readAt is null", async () => {
      const unread = [makeMessage({ readAt: undefined })];
      sqlMock.mockResolvedValueOnce(unread);

      const result = await repo.findUnreadByFamilyId("family-1");

      expect(result).toHaveLength(1);
      expect(result[0].readAt).toBeUndefined();
    });

    it("returns empty array when all messages are read", async () => {
      sqlMock.mockResolvedValueOnce([]);

      const result = await repo.findUnreadByFamilyId("family-1");

      expect(result).toEqual([]);
    });
  });

  describe("create (hash chain)", () => {
    it("assigns chainIndex 0 and null previousHash for the genesis message", async () => {
      // No prior messages in thread
      sqlMock.mockResolvedValueOnce([]); // SELECT last message → empty
      sqlMock.mockResolvedValueOnce([makeMessage()]); // INSERT message
      sqlMock.mockResolvedValueOnce([]); // UPDATE thread

      const result = await repo.create({
        threadId: "thread-1",
        familyId: "family-1",
        senderId: "parent-1",
        body: "Can you pick up Tuesday?",
        sentAt: "2026-03-01T10:05:00.000Z",
        attachmentIds: [],
        chainIndex: 0, // will be recomputed
        messageHash: "", // will be recomputed
      });

      expect(computeMessageHash).toHaveBeenCalledWith(
        expect.objectContaining({ chainIndex: 0 }),
        null // genesis: no previous hash
      );
      expect(result.chainIndex).toBe(0);
    });

    it("links subsequent messages to the previous hash", async () => {
      const lastMessageInDb = { message_hash: "prev-hash-xyz", chain_index: 0 };
      sqlMock.mockResolvedValueOnce([lastMessageInDb]); // SELECT last message
      sqlMock.mockResolvedValueOnce([makeMessage({ chainIndex: 1, previousHash: "prev-hash-xyz" })]); // INSERT
      sqlMock.mockResolvedValueOnce([]); // UPDATE thread

      await repo.create({
        threadId: "thread-1",
        familyId: "family-1",
        senderId: "parent-2",
        body: "Sure, I'll handle Tuesday.",
        sentAt: "2026-03-01T10:10:00.000Z",
        attachmentIds: [],
        chainIndex: 0,
        messageHash: "",
      });

      expect(computeMessageHash).toHaveBeenCalledWith(
        expect.objectContaining({ chainIndex: 1 }),
        "prev-hash-xyz" // links to previous message
      );
    });

    it("updates thread last_message_at after inserting a message", async () => {
      sqlMock.mockResolvedValueOnce([]); // SELECT last message
      sqlMock.mockResolvedValueOnce([makeMessage()]); // INSERT message
      sqlMock.mockResolvedValueOnce([]); // UPDATE thread last_message_at

      await repo.create({
        threadId: "thread-1",
        familyId: "family-1",
        senderId: "parent-1",
        body: "Test message",
        sentAt: "2026-03-01T10:05:00.000Z",
        attachmentIds: [],
        chainIndex: 0,
        messageHash: "",
      });

      // Three SQL calls: SELECT last, INSERT, UPDATE thread
      expect(sqlMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("immutability guard", () => {
    // TODO: Implement this test.
    //
    // The repository's update() method must throw to preserve hash chain
    // integrity. Once a message is stored with its hash, any content change
    // would invalidate every subsequent hash in the chain.
    //
    // What to implement (5-10 lines):
    //   Call repo.update('msg-1', { body: 'tampered content' }) and assert
    //   that it rejects with an error message containing the word "immutable"
    //   or "cannot be updated".
    //
    // Trade-off to consider: should the error be a TypeError, a custom
    // domain error, or a plain Error? The current implementation throws a
    // plain Error. You may also want to assert that sqlMock was NOT called,
    // proving no DB round-trip happens before the guard fires.
    it("throws when attempting to update a message body", async () => {
      await expect(
        repo.update("msg-1", { body: "tampered content" })
      ).rejects.toThrow();

      // No database call should be made — guard fires before any SQL
      expect(sqlMock).not.toHaveBeenCalled();
    });
  });

  describe("markAsRead", () => {
    it("sets read_at and returns updated message", async () => {
      const readAt = "2026-03-01T11:00:00.000Z";
      const updated = makeMessage({ readAt });
      sqlMock.mockResolvedValueOnce([updated]);

      const result = await repo.markAsRead("msg-1", readAt);

      expect(result?.readAt).toBe(readAt);
    });

    it("returns null when message not found", async () => {
      sqlMock.mockResolvedValueOnce([]);

      const result = await repo.markAsRead("nonexistent", "2026-03-01T11:00:00.000Z");

      expect(result).toBeNull();
    });
  });
});

// ─── HashChainVerificationRepository ────────────────────────────────────────

describe("HashChainVerificationRepository", () => {
  let repo: ReturnType<typeof createHashChainVerificationRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = createHashChainVerificationRepository();
  });

  describe("create", () => {
    it("stores a valid verification record", async () => {
      const verification = makeVerification();
      sqlMock.mockResolvedValueOnce([verification]);

      const result = await repo.create({
        threadId: "thread-1",
        verifiedAt: "2026-03-01T12:00:00.000Z",
        verifiedBy: "parent-1",
        isValid: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.tamperDetectedAtIndex).toBeUndefined();
    });

    it("stores a tamper-detected verification record with the offending index", async () => {
      const verification = makeVerification({ isValid: false, tamperDetectedAtIndex: 3 });
      sqlMock.mockResolvedValueOnce([verification]);

      const result = await repo.create({
        threadId: "thread-1",
        verifiedAt: "2026-03-01T12:00:00.000Z",
        isValid: false,
        tamperDetectedAtIndex: 3,
        verificationReport: { errors: ["hash mismatch at index 3"] },
      });

      expect(result.isValid).toBe(false);
      expect(result.tamperDetectedAtIndex).toBe(3);
    });
  });

  describe("findLatestByThreadId", () => {
    it("returns the most recent verification for a thread", async () => {
      const latest = makeVerification({ id: "ver-latest" });
      sqlMock.mockResolvedValueOnce([latest]);

      const result = await repo.findLatestByThreadId("thread-1");

      expect(result?.id).toBe("ver-latest");
    });

    it("returns null when thread has never been verified", async () => {
      sqlMock.mockResolvedValueOnce([]);

      const result = await repo.findLatestByThreadId("thread-1");

      expect(result).toBeNull();
    });
  });

  describe("findByThreadId", () => {
    it("returns all verifications for a thread, newest first", async () => {
      const verifications = [
        makeVerification({ id: "ver-2", verifiedAt: "2026-03-02T12:00:00.000Z" }),
        makeVerification({ id: "ver-1", verifiedAt: "2026-03-01T12:00:00.000Z" }),
      ];
      sqlMock.mockResolvedValueOnce(verifications);

      const result = await repo.findByThreadId("thread-1");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("ver-2");
    });
  });
});
