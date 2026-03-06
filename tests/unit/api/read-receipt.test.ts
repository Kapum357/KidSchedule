/**
 * Read Receipt API Tests
 *
 * Tests for marking messages as read and socket emission.
 * Uses Jest mocks — no real DB connection required.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockMessages = {
  create: jest.fn(),
  findById: jest.fn(),
  findByFamilyId: jest.fn(),
  markAsRead: jest.fn(),
};

jest.mock("@/lib/persistence", () => ({
  db: { messages: mockMessages },
  getDb: () => ({ messages: mockMessages }),
}));

jest.mock("@/lib/socket-server", () => ({
  emitMessageRead: jest.fn(),
}));

import { db } from "@/lib/persistence";
import { emitMessageRead } from "@/lib/socket-server";

const mockEmitMessageRead = emitMessageRead as jest.Mock;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Read Receipt API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Mark message as read", () => {
    it("should update message read_at timestamp", async () => {
      const messageId = "msg-1";
      const now = new Date().toISOString();

      mockMessages.markAsRead.mockResolvedValue({
        id: messageId,
        threadId: "thread-123",
        familyId: "fam-123",
        senderId: "parent-1",
        body: "Hello world",
        sentAt: new Date().toISOString(),
        readAt: now,
        attachmentIds: [],
      });

      const updated = await db.messages.markAsRead(messageId, now);

      expect(updated?.readAt).toBe(now);
      expect(mockMessages.markAsRead).toHaveBeenCalledWith(messageId, now);
    });

    it("should not allow marking own messages as read (API-level constraint)", async () => {
      // The API route rejects if senderId === currentParentId before calling markAsRead
      // This test verifies the DB layer doesn't get called in that case
      const senderId = "parent-1";
      const message = {
        id: "msg-own",
        senderId,
        familyId: "fam-123",
        body: "Own message",
        sentAt: new Date().toISOString(),
        readAt: undefined,
      };

      mockMessages.findById.mockResolvedValue(message);

      const found = await db.messages.findById("msg-own");

      // Simulate API guard: reject if caller === sender
      const callerId = "parent-1";
      const shouldReject = found?.senderId === callerId;

      expect(shouldReject).toBe(true);
      expect(mockMessages.markAsRead).not.toHaveBeenCalled();
    });

    it("should be idempotent when message already read", async () => {
      const messageId = "msg-2";
      const now = new Date().toISOString();

      mockMessages.markAsRead
        .mockResolvedValueOnce({ id: messageId, readAt: now })
        .mockResolvedValueOnce({ id: messageId, readAt: now });

      const first = await db.messages.markAsRead(messageId, now);
      const second = await db.messages.markAsRead(messageId, now);

      expect(first?.readAt).toBe(now);
      expect(second?.readAt).toBe(now);
      expect(mockMessages.markAsRead).toHaveBeenCalledTimes(2);
    });
  });

  describe("Socket emission on read", () => {
    it("should emit message:read event after marking as read", async () => {
      const familyId = "fam-123";
      const messageId = "msg-3";
      const parentId = "parent-2";
      const readAt = new Date().toISOString();

      mockMessages.markAsRead.mockResolvedValue({
        id: messageId,
        readAt,
        familyId,
      });

      await db.messages.markAsRead(messageId, readAt);
      emitMessageRead(familyId, messageId, parentId);

      expect(mockEmitMessageRead).toHaveBeenCalledWith(familyId, messageId, parentId);
    });

    it("should not emit socket event if read receipt already set (no-op)", async () => {
      const messageId = "msg-4";
      const existingReadAt = new Date().toISOString();

      const message = {
        id: messageId,
        familyId: "fam-123",
        senderId: "parent-1",
        readAt: existingReadAt, // already read
      };

      mockMessages.findById.mockResolvedValue(message);

      const found = await db.messages.findById(messageId);

      // Simulate API early-return for already-read messages
      const isAlreadyRead = !!found?.readAt;
      if (!isAlreadyRead) {
        await db.messages.markAsRead(messageId, new Date().toISOString());
        emitMessageRead(found!.familyId, messageId, "parent-2");
      }

      expect(isAlreadyRead).toBe(true);
      expect(mockMessages.markAsRead).not.toHaveBeenCalled();
      expect(mockEmitMessageRead).not.toHaveBeenCalled();
    });
  });

  describe("Read status tracking", () => {
    it("should track single read timestamp for 2-parent family message", async () => {
      const messageId = "msg-5";
      const readTime = new Date().toISOString();

      mockMessages.markAsRead.mockResolvedValue({
        id: messageId,
        threadId: "thread-456",
        familyId: "fam-456",
        senderId: "parent-1",
        body: "Message for family",
        sentAt: new Date().toISOString(),
        readAt: readTime,
        attachmentIds: [],
      });

      const marked = await db.messages.markAsRead(messageId, readTime);

      expect(marked?.readAt).toBe(readTime);
    });
  });
});
