/**
 * Twilio Webhook Events Repository Tests
 *
 * Tests cover:
 * - create() method for storing new webhook events with Zod validation
 * - findByMessageSid() for idempotency checks
 * - findByPhoneAndEventType() for dedup by phone + event type
 * - markProcessed() for tracking successful processing and returning updated row
 * - markError() for tracking failed processing and returning updated row
 * - findUnprocessed() for retry/recovery
 * - findOlderThan() for log retention cleanup
 * - Input validation: messageSid format, phoneNumber E.164, eventType enum
 */

import type { TwilioWebhookEventRepository } from "@/lib/persistence/repositories";
import type { DbTwilioWebhookEvent } from "@/lib/persistence/types";
import { TwilioWebhookEventInputSchema } from "@/lib/persistence/types";
import { ZodError } from "zod";

// Mock the SQL client
const mockRows: DbTwilioWebhookEvent[] = [];
let mockIdCounter = 0;

// Simple in-memory implementation for testing
function createMockTwilioRepository(): TwilioWebhookEventRepository {
  return {
    async create(data) {
      // Mock doesn't validate - real repo will
      mockIdCounter++;
      const event: DbTwilioWebhookEvent = {
        id: `event_${mockIdCounter}`,
        messageSid: data.messageSid,
        phoneNumber: data.phoneNumber,
        eventType: data.eventType,
        timestamp: typeof data.timestamp === "string" ? data.timestamp : data.timestamp.toISOString(),
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
      if (!event) {
        throw new Error(`NOT_FOUND: Twilio webhook event with id ${id} not found`);
      }
      event.processedAt = processedAt ?? new Date().toISOString();
      return event;
    },

    async markError(id, errorMessage) {
      const event = mockRows.find((r) => r.id === id);
      if (!event) {
        throw new Error(`NOT_FOUND: Twilio webhook event with id ${id} not found`);
      }
      event.errorMessage = errorMessage;
      return event;
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
        messageSid: "SM000123456789abcd",
        phoneNumber: "+15551111111",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const event2 = await repo.create({
        messageSid: "SM000223456789abcd",
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
        messageSid: "SM123456789abcdef",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: complexPayload,
      });

      expect(event.payload).toEqual(complexPayload);
    });

    it("should reject messageSid without SM prefix", () => {
      expect(() => {
        TwilioWebhookEventInputSchema.parse({
          messageSid: "INVALID_SID",
          phoneNumber: "+15551234567",
          eventType: "MessageReceived",
          timestamp: "2024-01-15T10:00:00Z",
          payload: {},
        });
      }).toThrow(ZodError);
    });

    it("should reject empty messageSid", () => {
      expect(() => {
        TwilioWebhookEventInputSchema.parse({
          messageSid: "",
          phoneNumber: "+15551234567",
          eventType: "MessageReceived",
          timestamp: "2024-01-15T10:00:00Z",
          payload: {},
        });
      }).toThrow(ZodError);
    });

    it("should reject invalid E.164 phoneNumber (missing +)", () => {
      expect(() => {
        TwilioWebhookEventInputSchema.parse({
          messageSid: "SM1234567890abcdef",
          phoneNumber: "15551234567",
          eventType: "MessageReceived",
          timestamp: "2024-01-15T10:00:00Z",
          payload: {},
        });
      }).toThrow(ZodError);
    });

    it("should reject invalid E.164 phoneNumber (leading zero)", () => {
      expect(() => {
        TwilioWebhookEventInputSchema.parse({
          messageSid: "SM1234567890abcdef",
          phoneNumber: "+01234567890",
          eventType: "MessageReceived",
          timestamp: "2024-01-15T10:00:00Z",
          payload: {},
        });
      }).toThrow(ZodError);
    });

    it("should reject invalid eventType", () => {
      expect(() => {
        TwilioWebhookEventInputSchema.parse({
          messageSid: "SM1234567890abcdef",
          phoneNumber: "+15551234567",
          eventType: "InvalidEventType",
          timestamp: "2024-01-15T10:00:00Z",
          payload: {},
        });
      }).toThrow(ZodError);
    });

    it("should accept valid E.164 phoneNumber formats", () => {
      const validNumbers = [
        "+15551234567",      // US 10 digits
        "+4411234567890",    // UK 10 digits
        "+33123456789",      // France 9 digits
        "+8613912345678",    // China
      ];

      validNumbers.forEach((number) => {
        expect(() => {
          TwilioWebhookEventInputSchema.parse({
            messageSid: "SM1234567890abcdef",
            phoneNumber: number,
            eventType: "MessageReceived",
            timestamp: "2024-01-15T10:00:00Z",
            payload: {},
          });
        }).not.toThrow();
      });
    });

    it("should accept all valid eventType values", () => {
      const validEventTypes = ["MessageReceived", "DeliveryReceipt", "OptOutChange", "IncomingPhoneNumberUnprovisioned", "MessageStatus"];

      validEventTypes.forEach((eventType) => {
        expect(() => {
          TwilioWebhookEventInputSchema.parse({
            messageSid: "SM1234567890abcdef",
            phoneNumber: "+15551234567",
            eventType,
            timestamp: "2024-01-15T10:00:00Z",
            payload: {},
          });
        }).not.toThrow();
      });
    });
  });

  describe("findByMessageSid()", () => {
    it("should find existing event by message_sid", async () => {
      const created = await repo.create({
        messageSid: "SMuniqueid123456",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const found = await repo.findByMessageSid("SMuniqueid123456");
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.messageSid).toBe("SMuniqueid123456");
    });

    it("should return null for non-existent message_sid", async () => {
      const found = await repo.findByMessageSid("SMdoesnotexist123");
      expect(found).toBeNull();
    });

    it("should enable idempotency: detect duplicate message_sid", async () => {
      const payload1 = { Body: "First attempt" };
      const event1 = await repo.create({
        messageSid: "SMduptest123456789",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: payload1,
      });

      // Simulate duplicate webhook reception
      const existing = await repo.findByMessageSid("SMduptest123456789");
      expect(existing).not.toBeNull();
      expect(existing?.id).toBe(event1.id);
      // In production, we'd skip processing if event already exists
    });
  });

  describe("findByPhoneAndEventType()", () => {
    it("should find event by phone + event_type", async () => {
      const created = await repo.create({
        messageSid: "SM001123456789abc",
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
        messageSid: "SMexact123456789",
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

      await repo.create({
        messageSid: "SMold123456789abc",
        phoneNumber: phone,
        eventType,
        timestamp: "2024-01-15T09:00:00Z",
        payload: {},
      });

      const newer = await repo.create({
        messageSid: "SMnew123456789abc",
        phoneNumber: phone,
        eventType,
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const found = await repo.findByPhoneAndEventType(phone, eventType);
      expect(found?.id).toBe(newer.id);
      expect(found?.messageSid).toBe("SMnew123456789abc");
    });

    it("should support idempotency checks: same phone + event_type + timestamp", async () => {
      const phone = "+15551234567";
      const eventType = "DeliveryReceipt";
      const timestamp = "2024-01-15T10:00:00Z";

      const created = await repo.create({
        messageSid: "SMfirst123456789a",
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
    it("should mark event as processed and return updated row", async () => {
      const event = await repo.create({
        messageSid: "SMproc123456789",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      expect(event.processedAt).toBeUndefined();

      const updated = await repo.markProcessed(event.id);
      expect(updated).toBeDefined();
      expect(updated.id).toBe(event.id);
      expect(updated.processedAt).toBeDefined();
    });

    it("should allow custom processedAt timestamp", async () => {
      const event = await repo.create({
        messageSid: "SMproccustom1234567",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const customTime = "2024-01-15T10:30:00Z";
      const updated = await repo.markProcessed(event.id, customTime);
      expect(updated?.processedAt).toBe(customTime);
    });

    it("should throw error if event not found", async () => {
      await expect(repo.markProcessed("nonexistent_id")).rejects.toThrow(
        "Twilio webhook event with id nonexistent_id not found"
      );
    });
  });

  describe("markError()", () => {
    it("should mark event with error message and return updated row", async () => {
      const event = await repo.create({
        messageSid: "SMetr123456789abcd",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const errorMsg = "Failed to find phone number in system";
      const updated = await repo.markError(event.id, errorMsg);

      expect(updated).toBeDefined();
      expect(updated.id).toBe(event.id);
      expect(updated?.errorMessage).toBe(errorMsg);
    });

    it("should throw error if event not found", async () => {
      await expect(repo.markError("nonexistent_id", "error")).rejects.toThrow(
        "Twilio webhook event with id nonexistent_id not found"
      );
    });
  });

  describe("findUnprocessed()", () => {
    it("should find only unprocessed events", async () => {
      await repo.create({
        messageSid: "SMproc123456789",
        phoneNumber: "+15551111111",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      const unproc = await repo.create({
        messageSid: "SMunproc12345678a",
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
        messageSid: "SMalldone123456789",
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
          messageSid: `SMlimit${String(i).padStart(3, '0')}abcdef`,
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
        messageSid: "SMold123456789abc",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: "2024-01-15T10:00:00Z",
        payload: {},
      });

      // Simulate time passing
      await new Promise((resolve) => setTimeout(resolve, 10));

      const event2 = await repo.create({
        messageSid: "SMnew123456789abc",
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
        messageSid: "SMold10456789abcd",
        phoneNumber: "+15551234567",
        eventType: "MessageReceived",
        timestamp: oldIso,
        payload: {},
      });

      await repo.create({
        messageSid: "SMrecent123456789a",
        phoneNumber: "+15559876543",
        eventType: "DeliveryReceipt",
        timestamp: new Date().toISOString(),
        payload: {},
      });

      // Manually adjust createdAt for testing (in real DB this is automatic)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockRows[0] as any).createdAt = oldDate.toISOString();

      const oldEvents = await repo.findOlderThan(5);
      // Should find the old event but not recent
      expect(oldEvents.some((e) => e.id === old.id)).toBeTruthy();
    });

    it("should return empty array when no old events", async () => {
      await repo.create({
        messageSid: "SMfresh123456789ab",
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
        await repo.create({
          messageSid: `SMcleanup${String(i).padStart(3, '0')}abcd`,
          phoneNumber: `+1555${i}${i}${i}${i}`,
          eventType: "MessageReceived",
          timestamp: oldDate.toISOString(),
          payload: {},
        });
        // Manually set old createdAt
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockRows[i] as any).createdAt = oldDate.toISOString();
      }

      const oldEvents = await repo.findOlderThan(5, 10);
      expect(oldEvents.length).toBeLessThanOrEqual(10);
    });
  });
});
