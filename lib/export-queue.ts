/**
 * Export Queue Module
 *
 * Redis-backed job queue for async export processing.
 * Provides enqueue and dequeue operations using Redis LPUSH/BRPOP pattern.
 */

import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient as createRedisClient } from "redis";
import type { ExportJobRecord } from "@/types";

const QUEUE_KEY = "export:queue";
const QUEUE_TIMEOUT_SECONDS = 30; // Block for up to 30 seconds waiting for jobs

/**
 * Initialize Redis connection
 * Reuses connection if already initialized
 */
let redisClient: UpstashRedis | ReturnType<typeof createRedisClient> | null = null;

function initializeRedis() {
  if (redisClient) {
    return redisClient;
  }

  if (!process.env.UPSTASH_REDIS_URL) {
    throw new Error(
      "Redis configuration missing: UPSTASH_REDIS_URL required"
    );
  }

  // Use Upstash Redis for cloud deployments (URLs starting with https)
  if (process.env.UPSTASH_REDIS_URL.startsWith("https://")) {
    if (!process.env.UPSTASH_REDIS_TOKEN) {
      throw new Error("UPSTASH_REDIS_TOKEN required for Upstash Redis");
    }
    redisClient = new UpstashRedis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN,
    });
  } else {
    // Use standard Redis client for local development
    redisClient = createRedisClient({
      url: process.env.UPSTASH_REDIS_URL,
    });
    redisClient.connect();
  }

  return redisClient;
}

/**
 * Enqueue an export job
 *
 * Pushes a job ID to the queue so the worker can pick it up
 *
 * @param jobId - The export job ID to enqueue
 */
export async function enqueueExport(jobId: string): Promise<void> {
  const redis = initializeRedis();

  try {
    // Push to the left of the list (LPUSH)
    // Worker will pop from the right (BRPOP) for FIFO order
    if (redis instanceof UpstashRedis) {
      await redis.lpush(QUEUE_KEY, jobId);
    } else {
      await (redis as ReturnType<typeof createRedisClient>).lPush(QUEUE_KEY, jobId);
    }
    console.log(`[Queue] Enqueued job: ${jobId}`);
  } catch (error) {
    console.error(`[Queue] Failed to enqueue job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Dequeue an export job
 *
 * Polls the queue for available jobs.
 * Returns null if no jobs available.
 *
 * @returns Job ID to process, or null if no jobs available
 */
export async function dequeueExport(): Promise<string | null> {
  const redis = initializeRedis();

  try {
    // RPop from the right of the list (FIFO)
    // Returns null if queue is empty
    let jobId;
    if (redis instanceof UpstashRedis) {
      jobId = await redis.rpop(QUEUE_KEY);
    } else {
      jobId = await (redis as ReturnType<typeof createRedisClient>).rPop(QUEUE_KEY);
    }

    if (!jobId) {
      return null; // No jobs available
    }

    console.log(`[Queue] Dequeued job: ${jobId}`);
    return jobId as string;
  } catch (error) {
    console.error("[Queue] Failed to dequeue job:", error);
    throw error;
  }
}

/**
 * Get current queue length
 *
 * Used for monitoring and observability
 */
export async function getQueueLength(): Promise<number> {
  const redis = initializeRedis();

  try {
    let length;
    if (redis instanceof UpstashRedis) {
      length = await redis.llen(QUEUE_KEY);
    } else {
      length = await (redis as ReturnType<typeof createRedisClient>).lLen(QUEUE_KEY);
    }
    return length as number;
  } catch (error) {
    console.error("[Queue] Failed to get queue length:", error);
    return 0;
  }
}

/**
 * Clear the entire queue
 *
 * Use with caution - this discards all pending jobs
 */
export async function clearQueue(): Promise<void> {
  const redis = initializeRedis();

  try {
    if (redis instanceof UpstashRedis) {
      await redis.del(QUEUE_KEY);
    } else {
      await (redis as ReturnType<typeof createRedisClient>).del(QUEUE_KEY);
    }
    console.log("[Queue] Cleared all jobs");
  } catch (error) {
    console.error("[Queue] Failed to clear queue:", error);
    throw error;
  }
}
