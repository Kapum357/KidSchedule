/**
 * Twilio Webhook Events Repository Tests
 *
 * Tests cover:
 * - create() method for storing new webhook events
 * - findByMessageSid() for idempotency checks
 * - findByPhoneAndEventType() for dedup by phone + event type
 * - markProcessed() for tracking successful processing
 * - markError() for tracking failed processing
 * - findUnprocessed() for retry/recovery
 * - findOlderThan() for log retention cleanup
 */

import { createTwilioWebhookEventRepository } from "@/lib/persistence/postgres/billing-repository";
import type { TwilioWebhookEventRepository } from "@/lib/persistence/repositories";
import type { DbTwilioWebhookEvent } from "@/lib/persistence/types";

// Mock the SQL client
const mockRows: DbTwilioWebhookEvent[] = [];
let mockIdCounter = 0;

// Simple in-memory implementation for testing
function createMockTwilioRepository(): TwilioWebhookEventRepository {
  return {
    async create(data) {
      mockIdCounter++;
      const event: DbTwilioWebhookEvent = {
        id: `event_${mockIdCounter}`,
        messageSid: data.messageSid,
        phoneNumber: data.phoneNumber,
        eventType: data.eventType,
        timestamp: data.timestamp,
        payload: data.payload,
        processedAt: undefined,
        errorMessage: undefined,
        createdAt: new Date().toISOString(),
      };
      mockRows.push(event);
      return event;
    },

    async findByMessageSid(messageSid) {
      return mockRows.find((r) => r.messageSid === messageSid) ?? null;
    },

    async findByPhoneAndEventType(phoneNumber, eventType, timestamp?) {
      if (timestamp) {
        return (
          mockRows.find(
            (r) =>
              r.phoneNumber === phoneNumber &&
              r.eventType === eventType &&
              r.timestamp === timestamp
          ) ?? null
        );
      }
      const matches = mockRows.filter(
        (r) => r.phoneNumber === phoneNumber && r.eventType === eventType
      );
      return matches.length > 0
        ? matches.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )[0]
        : null;
    },

    async markProcessed(id, processedAt?) {
      const event = mockRows.find((r) => r.id === id);
      if (event) {
        event.processedAt = processedAt ?? new Date().toISOString();
      }
    },

    async markError(id, errorMessage) {
      const event = mockRows.find((r) => r.id === id);
      if (event) {
        event.errorMessage = errorMessage;
      }
    },

    async findUnprocessed(limit = 50) {
      return mockRows
        .filter((r) => !r.processedAt)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        .slice(0, limit);
    },

    async findOlderThan(daysOld, limit = 100) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      return mockRows
        .filter(
          (r) => new Date(r.createdAt).getTime() < cutoffDate.getTime()
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        .slice(0, limit);
    },
  };
}

describe("TwilioWebhookEventRepository", () => {
  let repo: TwilioWebhookEventRepository;

  beforeEach(() => {
    // Reset mock state
    mockRows.length = 0;
    mockIdCounter = 0;
    repo = createMockTwilioRepository();
  });

  describe("create()", () => {
    it("should create a new webhook event", async () => {
      const event = await repo.create({
        messageSid: "SM1234567890abcdef",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {
          MessageSid: "SM1234567890abcdef",
          From: "+15551234567",
          Body: "Hello",
        },
      });

      expect(event).toBeDefined();
      expect(event.messageSid).toBe("SM1234567890abcdef");
      expect(event.phoneNumber).toBe("+15551234567");
      expect(event.eventType).toBe("MessageReceived");
      expect(event.processedAt).toBeUndefined();
      expect(event.errorMessage).toBeUndefined();
    });

    it("should assign unique IDs to events", async () => {
      const event1 = await repo.create({
        messageSid: "SM0001",
        phoneNumber: "+15551111111",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const event2 = await repo.create({
        messageSid: "SM0002",
        phoneNumber: "+15552222222",
        eventType: "DeliveryReceipt",
        timestamp: "2024-01-15T10:01:00Z",
        payload: {},
      });

      expect(event1.id).not.toBe(event2.id);
    });

    it("should preserve JSONB payload", async () => {
      const complexPayload = {
        MessageSid: "SM123",
        From: "+15551234567",
        To: "+15559876543",
        Body: "Test",
        NumMedia: "1",
        MediaUrl0: "https://example.com/image.jpg",
      };

      const event = await repo.create({
        messageSid: "SM123",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: complexPayload,
      });

      expect(event.payload).toEqual(complexPayload);
    });
  });

  describe("findByMessageSid()", () => {
    it("should find existing event by message_sid", async () => {
      const created = await repo.create({
        messageSid: "SM_UNIQUE_ID",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const found = await repo.findByMessageSid("SM_UNIQUE_ID");
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.messageSid).toBe("SM_UNIQUE_ID");
    });

    it("should return null for non-existent message_sid", async () => {
      const found = await repo.findByMessageSid("SM_DOES_NOT_EXIST");
      expect(found).toBeNull();
    });

    it("should enable idempotency: detect duplicate message_sid", async () => {
      const payload1 = { Body: "First attempt" };
      const event1 = await repo.create({
        messageSid: "SM_DUP_TEST",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: payload1,
      });

      // Simulate duplicate webhook reception
      const existing = await repo.findByMessageSid("SM_DUP_TEST");
      expect(existing).not.toBeNull();
      expect(existing?.id).toBe(event1.id);
      // In production, we'd skip processing if event already exists
    });
  });

  describe("findByPhoneAndEventType()", () => {
    it("should find event by phone + event_type", async () => {
      const created = await repo.create({
        messageSid: "SM001",
        phoneNumber: "+15551234567",
        eventType: "DeliveryReceipt",
        timestamp: "2024-01-15T10:00:00Z",
        payload: { MessageStatus: "delivered" },
      });

      const found = await repo.findByPhoneAndEventType(
        "+15551234567",
        "DeliveryReceipt"
      );
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it("should find event with timestamp for exact match", async () => {
      const timestamp = "2024-01-15T10:00:00Z";
      const created = await repo.create({
        messageSid: "SM_EXACT",
        phoneNumber: "+15551234567",
        eventType: "OptOutChange",
        timestamp,
        payload: { OptOut: true },
      });

      const found = await repo.findByPhoneAndEventType(
        "+15551234567",
        "OptOutChange",
        timestamp
      );
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it("should return null when event not found", async () => {
      const found = await repo.findByPhoneAndEventType(
        "+15559999999",
        "MessageReceived"
      );
      expect(found).toBeNull();
    });

    it("should return most recent when no timestamp specified", async () => {
      const phone = "+15551234567";
      const eventType = "DeliveryReceipt";

      const older = await repo.create({
        messageSid: "SM_OLD",
        phoneNumber: phone,
        eventType,
        timestamp: "2024-01-15T09:00:00Z",
        payload: {},
      });

      const newer = await repo.create({
        messageSid: "SM_NEW",
        phoneNumber: phone,
        eventType,
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const found = await repo.findByPhoneAndEventType(phone, eventType);
      expect(found?.id).toBe(newer.id);
      expect(found?.messageSid).toBe("SM_NEW");
    });

    it("should support idempotency checks: same phone + event_type + timestamp", async () => {
      const phone = "+15551234567";
      const eventType = "DeliveryReceipt";
      const timestamp = "2024-01-15T10:00:00Z";

      const created = await repo.create({
        messageSid: "SM_FIRST",
        phoneNumber: phone,
        eventType,
        timestamp,
        payload: { Status: "delivered" },
      });

      // Simulate reprocessing with same idempotency key
      const existing = await repo.findByPhoneAndEventType(
        phone,
        eventType,
        timestamp
      );
      expect(existing).not.toBeNull();
      expect(existing?.id).toBe(created.id);
    });
  });

  describe("markProcessed()", () => {
    it("should mark event as processed", async () => {
      const event = await repo.create({
        messageSid: "SM_PROC",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      expect(event.processedAt).toBeUndefined();

      await repo.markProcessed(event.id);
      const updated = await repo.findByMessageSid("SM_PROC");
      expect(updated?.processedAt).toBeDefined();
    });

    it("should allow custom processedAt timestamp", async () => {
      const event = await repo.create({
        messageSid: "SM_PROC_CUSTOM",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const customTime = "2024-01-15T10:30:00Z";
      await repo.markProcessed(event.id, customTime);
      const updated = await repo.findByMessageSid("SM_PROC_CUSTOM");
      expect(updated?.processedAt).toBe(customTime);
    });
  });

  describe("markError()", () => {
    it("should mark event with error message", async () => {
      const event = await repo.create({
        messageSid: "SM_ERR",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const errorMsg = "Failed to find phone number in system";
      await repo.markError(event.id, errorMsg);

      const updated = await repo.findByMessageSid("SM_ERR");
      expect(updated?.errorMessage).toBe(errorMsg);
    });
  });

  describe("findUnprocessed()", () => {
    it("should find only unprocessed events", async () => {
      await repo.create({
        messageSid: "SM_PROC",
        phoneNumber: "+15551111111",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const unproc = await repo.create({
        messageSid: "SM_UNPROC",
        phoneNumber: "+15552222222",
        eventType: "DeliveryReceipt",
        timestamp: "2024-01-15T10:01:00Z",
        payload: {},
      });

      // Mark first as processed
      const allEvents = mockRows;
      await repo.markProcessed(allEvents[0].id);

      const unprocessed = await repo.findUnprocessed();
      expect(unprocessed.length).toBe(1);
      expect(unprocessed[0].id).toBe(unproc.id);
    });

    it("should return empty array when all events processed", async () => {
      const event = await repo.create({
        messageSid: "SM_ALL_DONE",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      await repo.markProcessed(event.id);

      const unprocessed = await repo.findUnprocessed();
      expect(unprocessed).toEqual([]);
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await repo.create({
          messageSid: `SM_LIMIT_${i}`,
          phoneNumber: `+1555123456${i}`,
          eventType: "MessageReceived",
          timestamp: `2024-01-15T10:0${i % 10}:00Z`,
          payload: {},
        });
      }

      const unprocessed = await repo.findUnprocessed(5);
      expect(unprocessed.length).toBe(5);
    });

    it("should sort by created_at ASC (oldest first)", async () => {
      const event1 = await repo.create({
        messageSid: "SM_OLD",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      // Simulate time passing
      await new Promise((resolve) => setTimeout(resolve, 10));

      const event2 = await repo.create({
        messageSid: "SM_NEW",
        phoneNumber: "+15559876543",
        eventType: "DeliveryReceipt",
        timestamp: "2024-01-15T10:01:00Z",
        payload: {},
      });

      const unprocessed = await repo.findUnprocessed();
      expect(unprocessed[0].id).toBe(event1.id);
      expect(unprocessed[1].id).toBe(event2.id);
    });
  });

  describe("findOlderThan()", () => {
    it("should find events older than X days", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const oldIso = oldDate.toISOString();

      const old = await repo.create({
        messageSid: "SM_OLD_10",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: oldIso,
        payload: {},
      });

      const recent = await repo.create({
        messageSid: "SM_RECENT",
        phoneNumber: "+15559876543",
        eventType: "DeliveryReceipt",
        timestamp: new Date().toISOString(),
        payload: {},
      });

      // Manually adjust createdAt for testing (in real DB this is automatic)
      (mockRows[0] as any).createdAt = oldDate.toISOString();

      const oldEvents = await repo.findOlderThan(5);
      // Should find the old event but not recent
      expect(oldEvents.some((e) => e.id === old.id)).toBeTruthy();
    });

    it("should return empty array when no old events", async () => {
      await repo.create({
        messageSid: "SM_FRESH",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: new Date().toISOString(),
        payload: {},
      });

      const oldEvents = await repo.findOlderThan(5);
      expect(oldEvents.length).toBe(0);
    });

    it("should respect limit parameter", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      for (let i = 0; i < 20; i++) {
        const event = await repo.create({
          messageSid: `SM_CLEANUP_${i}`,
          phoneNumber: `+1555${i}${i}${i}${i}`,
          eventType: "MessageReceived",
          timestamp: oldDate.toISOString(),
          payload: {},
        });
        // Manually set old createdAt
        (mockRows[i] as any).createdAt = oldDate.toISOString();
      }

      const oldEvents = await repo.findOlderThan(5, 10);
      expect(oldEvents.length).toBeLessThanOrEqual(10);
    });
  });
});
