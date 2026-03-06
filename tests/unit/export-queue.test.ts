/**
 * Export Queue Unit Tests
 *
 * Tests for FIFO queue operations with Redis
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { enqueueExport, dequeueExport, getQueueLength, clearQueue } from "@/lib/export-queue";

describe("Export Queue (Redis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up queue after each test
    try {
      await clearQueue();
    } catch (err) {
      // Ignore cleanup errors in tests
    }
  });

  describe("Enqueue operations", () => {
    it("should enqueue a job ID", async () => {
      const jobId = "job-123";
      await enqueueExport(jobId);

      const length = await getQueueLength();
      expect(length).toBe(1);
    });

    it("should maintain FIFO order", async () => {
      const jobIds = ["job-1", "job-2", "job-3"];

      // Enqueue in order
      for (const jobId of jobIds) {
        await enqueueExport(jobId);
      }

      // Dequeue should return in same order (FIFO)
      for (const expectedId of jobIds) {
        const jobId = await dequeueExport();
        expect(jobId).toBe(expectedId);
      }
    });

    it("should handle multiple concurrent enqueues", async () => {
      const jobIds = Array.from({ length: 10 }, (_, i) => `job-${i}`);

      // Enqueue all in parallel
      await Promise.all(jobIds.map((id) => enqueueExport(id)));

      const length = await getQueueLength();
      expect(length).toBe(10);
    });
  });

  describe("Dequeue operations", () => {
    it("should dequeue in FIFO order", async () => {
      await enqueueExport("first");
      await enqueueExport("second");

      const first = await dequeueExport();
      const second = await dequeueExport();

      expect(first).toBe("first");
      expect(second).toBe("second");
    });

    it("should return null for empty queue", async () => {
      const jobId = await dequeueExport();
      expect(jobId).toBeNull();
    });

    it("should remove dequeued item from queue", async () => {
      await enqueueExport("job-1");
      expect(await getQueueLength()).toBe(1);

      await dequeueExport();
      expect(await getQueueLength()).toBe(0);
    });
  });

  describe("Queue length", () => {
    it("should return accurate queue length", async () => {
      expect(await getQueueLength()).toBe(0);

      await enqueueExport("job-1");
      expect(await getQueueLength()).toBe(1);

      await enqueueExport("job-2");
      expect(await getQueueLength()).toBe(2);

      await dequeueExport();
      expect(await getQueueLength()).toBe(1);
    });
  });

  describe("Clear queue", () => {
    it("should clear all jobs from queue", async () => {
      await enqueueExport("job-1");
      await enqueueExport("job-2");
      expect(await getQueueLength()).toBe(2);

      await clearQueue();
      expect(await getQueueLength()).toBe(0);
    });

    it("should handle clearing empty queue", async () => {
      // Should not throw
      await expect(clearQueue()).resolves.not.toThrow();
    });
  });
});
