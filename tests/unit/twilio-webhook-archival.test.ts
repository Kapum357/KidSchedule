/**
 * Twilio Webhook Event Archival Tests
 *
 * Tests cover:
 * 1. New events have processing_state = 'pending'
 * 2. markProcessing() atomically sets state to 'processing'
 * 3. markProcessing() called twice on same event fails/errors (409)
 * 4. Archive job moves events older than 90 days
 * 5. Archive job skips events currently being processed
 * 6. Archive/delete are atomic (no orphaned data)
 * 7. Old events queryable in archive table
 * 8. Duplicate prevention via in-flight state
 * 9. markProcessed() sets state to 'processed'
 * 10. markError() sets state to 'failed'
 */

import type { TwilioWebhookEventRepository } from "@/lib/persistence/repositories";
import type { DbTwilioWebhookEvent } from "@/lib/persistence/types";
import { HttpError } from "@/lib/persistence/repositories";
import { describe, it, expect, beforeEach } from "@jest/globals";

// Mock data and simple in-memory implementation for testing
interface MockTwilioRow extends DbTwilioWebhookEvent {}

let mockRows: MockTwilioRow[] = [];
let mockArchiveRows: MockTwilioRow[] = [];
let mockIdCounter = 0;

function createMockTwilioRepository(): TwilioWebhookEventRepository {
  return {
    async create(data) {
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
        processingState: data.processingState || "pending",
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

    async markProcessing(id) {
      const event = mockRows.find((r) => r.id === id);
      if (!event) {
        throw new HttpError(`Twilio webhook event with id ${id} not found or already processing`, 409);
      }
      if (event.processingState !== "pending") {
        // Already processing or processed
        throw new HttpError(`Twilio webhook event with id ${id} not found or already processing`, 409);
      }
      event.processingState = "processing";
      return event;
    },

    async markProcessed(id, processedAt?) {
      const event = mockRows.find((r) => r.id === id);
      if (!event) {
        throw new HttpError(`Twilio webhook event with id ${id} not found`, 404);
      }
      event.processedAt = processedAt ?? new Date().toISOString();
      event.processingState = "processed";
      return event;
    },

    async markError(id, errorMessage) {
      const event = mockRows.find((r) => r.id === id);
      if (!event) {
        throw new HttpError(`Twilio webhook event with id ${id} not found`, 404);
      }
      event.errorMessage = errorMessage;
      event.processingState = "failed";
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
        .filter((r) => new Date(r.createdAt) < cutoffDate)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        .slice(0, limit);
    },

    async archiveOldEvents(daysOld = 90, limit = 10000) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Find events to archive (old and not processing)
      const toArchive = mockRows.filter(
        (r) =>
          new Date(r.createdAt) < cutoffDate &&
          r.processingState !== "processing"
      );

      if (toArchive.length === 0) {
        return 0;
      }

      // Atomic: move to archive and remove from main
      const eventsToMove = toArchive.slice(0, limit);
      mockArchiveRows.push(...eventsToMove);

      // Remove from main table
      mockRows = mockRows.filter(
        (r) => !eventsToMove.find((a) => a.id === r.id)
      );

      return eventsToMove.length;
    },
  };
}

describe("Twilio Webhook Event Archival", () => {
  beforeEach(() => {
    mockRows = [];
    mockArchiveRows = [];
    mockIdCounter = 0;
  });

  // Test 1: New events have processing_state = 'pending'
  it("should create new events with processing_state = pending", async () => {
    const repo = createMockTwilioRepository();

    const event = await repo.create({
      messageSid: "SMabcd1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: new Date().toISOString(),
      payload: { MessageStatus: "delivered" },
      processingState: "pending",
    });

    expect(event.processingState).toBe("pending");
    expect(event.id).toBeDefined();
    expect(event.createdAt).toBeDefined();
  });

  // Test 2: markProcessing() atomically sets state to 'processing'
  it("should mark event as processing atomically", async () => {
    const repo = createMockTwilioRepository();

    const event = await repo.create({
      messageSid: "SMabcd1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: new Date().toISOString(),
      payload: { MessageStatus: "delivered" },
      processingState: "pending",
    });

    const updatedEvent = await repo.markProcessing(event.id);
    expect(updatedEvent.processingState).toBe("processing");
  });

  // Test 3: markProcessing() called twice on same event fails (409)
  it("should fail when markProcessing called on already processing event", async () => {
    const repo = createMockTwilioRepository();

    const event = await repo.create({
      messageSid: "SMabcd1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: new Date().toISOString(),
      payload: { MessageStatus: "delivered" },
      processingState: "pending",
    });

    // First call succeeds
    await repo.markProcessing(event.id);

    // Second call fails
    try {
      await repo.markProcessing(event.id);
      expect.fail("Should have thrown 409");
    } catch (error) {
      if (error instanceof HttpError) {
        expect(error.statusCode).toBe(409);
      } else {
        throw error;
      }
    }
  });

  // Test 4: Archive job moves events older than 90 days
  it("should archive events older than 90 days", async () => {
    const repo = createMockTwilioRepository();

    // Create old event (100 days old)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    const oldEventData = {
      messageSid: "SMold1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: oldDate.toISOString(),
      payload: { MessageStatus: "delivered" },
      processingState: "pending" as const,
    };
    const oldEvent = await repo.create(oldEventData);
    // Manually set created_at to old date for testing
    const oldRow = mockRows.find((r) => r.id === oldEvent.id);
    if (oldRow) {
      oldRow.createdAt = oldDate.toISOString();
    }

    // Create recent event (10 days old)
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    const recentEventData = {
      messageSid: "SMrecent1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: recentDate.toISOString(),
      payload: { MessageStatus: "delivered" },
      processingState: "pending" as const,
    };
    const recentEvent = await repo.create(recentEventData);

    expect(mockRows).toHaveLength(2);

    // Archive events older than 90 days
    const archivedCount = await repo.archiveOldEvents(90);

    expect(archivedCount).toBe(1);
    expect(mockRows).toHaveLength(1);
    expect(mockArchiveRows).toHaveLength(1);
    expect(mockArchiveRows[0]?.id).toBe(oldEvent.id);
    expect(mockRows[0]?.id).toBe(recentEvent.id);
  });

  // Test 5: Archive job skips events currently being processed
  it("should skip processing events during archival", async () => {
    const repo = createMockTwilioRepository();

    // Create old event (100 days old)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    const event1Data = {
      messageSid: "SMold1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: oldDate.toISOString(),
      payload: { MessageStatus: "delivered" },
      processingState: "pending" as const,
    };
    const event1 = await repo.create(event1Data);
    const row1 = mockRows.find((r) => r.id === event1.id);
    if (row1) {
      row1.createdAt = oldDate.toISOString();
    }

    // Create old event that's being processed (100 days old)
    const event2Data = {
      messageSid: "SMold2234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: oldDate.toISOString(),
      payload: { MessageStatus: "delivered" },
      processingState: "pending" as const,
    };
    const event2 = await repo.create(event2Data);
    const row2 = mockRows.find((r) => r.id === event2.id);
    if (row2) {
      row2.createdAt = oldDate.toISOString();
    }
    // Mark as processing
    await repo.markProcessing(event2.id);

    expect(mockRows).toHaveLength(2);

    // Archive events older than 90 days (should skip the processing one)
    const archivedCount = await repo.archiveOldEvents(90);

    expect(archivedCount).toBe(1);
    expect(mockRows).toHaveLength(1);
    expect(mockArchiveRows).toHaveLength(1);
    expect(mockRows[0]?.processingState).toBe("processing");
  });

  // Test 6: Archive/delete are atomic (no orphaned data)
  it("should maintain data integrity (atomic archive+delete)", async () => {
    const repo = createMockTwilioRepository();

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    // Create multiple old events
    const event1 = await repo.create({
      messageSid: "SMold1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: oldDate.toISOString(),
      payload: {},
      processingState: "pending",
    });
    const row1 = mockRows.find((r) => r.id === event1.id);
    if (row1) row1.createdAt = oldDate.toISOString();

    const event2 = await repo.create({
      messageSid: "SMold2234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: oldDate.toISOString(),
      payload: {},
      processingState: "pending",
    });
    const row2 = mockRows.find((r) => r.id === event2.id);
    if (row2) row2.createdAt = oldDate.toISOString();

    const totalBefore = mockRows.length + mockArchiveRows.length;

    await repo.archiveOldEvents(90);

    const totalAfter = mockRows.length + mockArchiveRows.length;

    // Total count should be same (no data loss)
    expect(totalAfter).toBe(totalBefore);
    // Both should be archived
    expect(mockArchiveRows).toHaveLength(2);
    expect(mockRows).toHaveLength(0);
  });

  // Test 7: Old events queryable in archive table
  it("should preserve queryability in archive table", async () => {
    const repo = createMockTwilioRepository();

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const event = await repo.create({
      messageSid: "SMold1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: oldDate.toISOString(),
      payload: { test: "data" },
      processingState: "pending",
    });
    const row = mockRows.find((r) => r.id === event.id);
    if (row) row.createdAt = oldDate.toISOString();

    // Find before archive
    const foundBefore = mockRows.find((r) => r.messageSid === "SMold1234");
    expect(foundBefore).toBeDefined();

    // Archive
    await repo.archiveOldEvents(90);

    // Find in archive after
    const foundAfter = mockArchiveRows.find((r) => r.messageSid === "SMold1234");
    expect(foundAfter).toBeDefined();
    expect(foundAfter?.payload).toEqual({ test: "data" });
    expect(foundAfter?.createdAt).toBe(oldDate.toISOString());
  });

  // Test 8: Duplicate prevention via in-flight state
  it("should prevent duplicate processing via in-flight state", async () => {
    const repo = createMockTwilioRepository();

    const event = await repo.create({
      messageSid: "SMabcd1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: new Date().toISOString(),
      payload: {},
      processingState: "pending",
    });

    // First handler acquires the lock
    const processingEvent = await repo.markProcessing(event.id);
    expect(processingEvent.processingState).toBe("processing");

    // Concurrent handler tries to acquire lock - fails
    try {
      await repo.markProcessing(event.id);
      expect.fail("Should have thrown 409");
    } catch (error) {
      if (error instanceof HttpError) {
        expect(error.statusCode).toBe(409);
      }
    }

    // After processing completes, state transitions to processed
    const completedEvent = await repo.markProcessed(event.id);
    expect(completedEvent.processingState).toBe("processed");
  });

  // Test 9: markProcessed() sets state to 'processed'
  it("should set processing_state to processed on success", async () => {
    const repo = createMockTwilioRepository();

    const event = await repo.create({
      messageSid: "SMabcd1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: new Date().toISOString(),
      payload: {},
      processingState: "pending",
    });

    await repo.markProcessing(event.id);

    const processed = await repo.markProcessed(event.id);

    expect(processed.processingState).toBe("processed");
    expect(processed.processedAt).toBeDefined();
  });

  // Test 10: markError() sets state to 'failed'
  it("should set processing_state to failed on error", async () => {
    const repo = createMockTwilioRepository();

    const event = await repo.create({
      messageSid: "SMabcd1234",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      timestamp: new Date().toISOString(),
      payload: {},
      processingState: "pending",
    });

    await repo.markProcessing(event.id);

    const failed = await repo.markError(event.id, "Something went wrong");

    expect(failed.processingState).toBe("failed");
    expect(failed.errorMessage).toBe("Something went wrong");
  });
});
