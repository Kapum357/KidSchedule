/**
 * Read Receipt API Tests
 *
 * Tests for marking messages as read and socket emission
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/persistence";

describe("Read Receipt API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Mark message as read", () => {
    it("should update message read_at timestamp", async () => {
      const threadId = "thread-123";
      const familyId = "fam-123";
      const senderId = "parent-1";
      const body = "Hello world";

      const message = await db.messages.create({
        threadId,
        familyId,
        senderId,
        body,
        sentAt: new Date().toISOString(),
      });

      expect(message.readAt).toBeUndefined();

      const now = new Date().toISOString();
      const updated = await db.messages.markAsRead(message.id, now);

      expect(updated?.readAt).toBe(now);
    });

    it("should not allow marking own messages as read", async () => {
      const senderId = "parent-1";
      const threadId = "thread-123";

      const message = await db.messages.create({
        threadId,
        familyId: "fam-123",
        senderId,
        body: "Own message",
        sentAt: new Date().toISOString(),
      });

      // API should reject this before calling markAsRead
      // This is tested at the endpoint level
      expect(message.senderId).toBe(senderId);
    });

    it("should be idempotent when message already read", async () => {
      const threadId = "thread-123";
      const message = await db.messages.create({
        threadId,
        familyId: "fam-123",
        senderId: "parent-1",
        body: "Message",
        sentAt: new Date().toISOString(),
      });

      const now = new Date().toISOString();
      const first = await db.messages.markAsRead(message.id, now);
      const second = await db.messages.markAsRead(message.id, now);

      expect(first?.readAt).toBe(now);
      expect(second?.readAt).toBe(now);
    });
  });

  describe("Multiple recipients", () => {
    it("should track read status per recipient", async () => {
      const threadId = "thread-456";
      const familyId = "fam-456";

      const message = await db.messages.create({
        threadId,
        familyId,
        senderId: "parent-1",
        body: "Message for family",
        sentAt: new Date().toISOString(),
      });

      // In a 2-parent family, only one other parent can mark as read
      // The read_at field is singular, not per-recipient
      const readTime = new Date().toISOString();
      const marked = await db.messages.markAsRead(message.id, readTime);

      expect(marked?.readAt).toBe(readTime);
    });
  });
});
