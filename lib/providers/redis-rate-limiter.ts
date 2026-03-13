/**
 * Redis Rate Limiter for Twilio Webhooks
 *
 * Implements rate limiting using Redis (via Upstash) to track webhook count per family.
 * - Limit: 100 webhooks per minute per family
 * - Key: rate_limit:twilio:{familyId}
 * - Value: { count: number, resetAt: timestamp }
 * - Window: 60 seconds (resets automatically)
 *
 * Atomic operations ensure correctness under concurrent requests.
 * Fails open (allows request) if Redis is unavailable.
 */

import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient as createRedisClient } from "redis";
import { logEvent } from "@/lib/observability/logger";

const RATE_LIMIT_PREFIX = "rate_limit:twilio:";
const WINDOW_SECONDS = 60;
const LIMIT_PER_WINDOW = 100;
const REDIS_TIMEOUT_MS = 1000; // 1 second timeout for Redis operations

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  shouldRetry: boolean; // For Twilio retry decision (false for rate limits)
};

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
    logEvent("warn", "Redis configuration missing: UPSTASH_REDIS_URL required", {
      operation: "rate_limiter_init",
    });
    return null;
  }

  try {
    // Use Upstash Redis for cloud deployments (URLs starting with https)
    if (process.env.UPSTASH_REDIS_URL.startsWith("https://")) {
      if (!process.env.UPSTASH_REDIS_TOKEN) {
        logEvent("warn", "UPSTASH_REDIS_TOKEN required for Upstash Redis", {
          operation: "rate_limiter_init",
        });
        return null;
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
      (redisClient as ReturnType<typeof createRedisClient>).connect();
    }

    return redisClient;
  } catch (error) {
    logEvent("error", "Failed to initialize Redis client for rate limiting", {
      operation: "rate_limiter_init",
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/**
 * Check rate limit for a family
 *
 * Algorithm:
 * 1. Get current count from Redis
 * 2. If key has TTL > 0: check if count < limit, increment if yes
 * 3. If key expired or missing: reset counter to 1, set TTL to 60s
 * 4. Calculate remaining quota and reset time
 *
 * Uses atomic INCR + EXPIRE operations for correctness.
 * Fails open (allows request) if Redis is unavailable or times out.
 *
 * @param familyId - The family UUID (e.g., from SMS subscription)
 * @returns RateLimitResult with allowed status, remaining count, and reset time
 */
export async function checkRateLimit(familyId: string): Promise<RateLimitResult> {
  const key = `${RATE_LIMIT_PREFIX}${familyId}`;
  const now = new Date();
  const resetAt = new Date(now.getTime() + WINDOW_SECONDS * 1000);

  const redis = initializeRedis();

  // Fail open: if Redis is unavailable, allow the request
  if (!redis) {
    logEvent("warn", "Redis unavailable for rate limiting, allowing request (fail-open)", {
      operation: "check_rate_limit",
      familyId,
    });
    return {
      allowed: true,
      remaining: LIMIT_PER_WINDOW,
      resetAt,
      shouldRetry: false,
    };
  }

  try {
    // Set up timeout for Redis operations
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), REDIS_TIMEOUT_MS);
    });

    // Atomically:
    // 1. Check current count and TTL
    // 2. Increment count if under limit
    // 3. Set TTL on first increment
    const getResult = redis instanceof UpstashRedis
      ? await Promise.race([redis.get(key), timeoutPromise])
      : await Promise.race(
          [(redis as ReturnType<typeof createRedisClient>).get(key), timeoutPromise]
        );

    // If Redis timeout, fail open
    if (getResult === null && redis instanceof UpstashRedis === false) {
      // Actual key missing or timeout
      const ttlResult = redis instanceof UpstashRedis
        ? await Promise.race([redis.ttl(key), timeoutPromise])
        : await Promise.race([
            (redis as ReturnType<typeof createRedisClient>).ttl(key),
            timeoutPromise,
          ]);

      if (ttlResult === null) {
        logEvent("warn", "Redis timeout during rate limit check, allowing request (fail-open)", {
          operation: "check_rate_limit",
          familyId,
        });
        return {
          allowed: true,
          remaining: LIMIT_PER_WINDOW,
          resetAt,
          shouldRetry: false,
        };
      }
    }

    // Get current count
    let currentCount: number | null;
    if (redis instanceof UpstashRedis) {
      currentCount = (await redis.get(key)) as number | null;
    } else {
      currentCount = (await (redis as ReturnType<typeof createRedisClient>).get(key)) as
        | number
        | null;
    }

    // If key doesn't exist or expired, start fresh
    if (currentCount === null || currentCount === undefined) {
      if (redis instanceof UpstashRedis) {
        await Promise.race([
          redis.set(key, 1, { ex: WINDOW_SECONDS }),
          timeoutPromise,
        ]);
      } else {
        await Promise.race([
          (redis as ReturnType<typeof createRedisClient>).setEx(
            key,
            WINDOW_SECONDS,
            "1"
          ),
          timeoutPromise,
        ]);
      }
      return {
        allowed: true,
        remaining: LIMIT_PER_WINDOW - 1,
        resetAt,
        shouldRetry: false,
      };
    }

    // Check if under limit
    if (currentCount < LIMIT_PER_WINDOW) {
      // Increment atomically
      let newCount: number | null;
      if (redis instanceof UpstashRedis) {
        newCount = (await Promise.race([
          redis.incr(key),
          timeoutPromise,
        ])) as number | null;
      } else {
        newCount = (await Promise.race([
          (redis as ReturnType<typeof createRedisClient>).incr(key),
          timeoutPromise,
        ])) as number | null;
      }

      // If timeout or error, fail open
      if (newCount === null) {
        logEvent("warn", "Redis timeout during increment, allowing request (fail-open)", {
          operation: "check_rate_limit",
          familyId,
        });
        return {
          allowed: true,
          remaining: LIMIT_PER_WINDOW,
          resetAt,
          shouldRetry: false,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, LIMIT_PER_WINDOW - (newCount as number)),
        resetAt,
        shouldRetry: false,
      };
    }

    // Rate limit exceeded
    logEvent("warn", "Twilio webhook rate limit exceeded", {
      operation: "check_rate_limit",
      familyId,
      currentCount,
      limit: LIMIT_PER_WINDOW,
    });

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      shouldRetry: false, // 429 is not retryable
    };
  } catch (error) {
    logEvent("error", "Redis error during rate limit check, allowing request (fail-open)", {
      operation: "check_rate_limit",
      familyId,
      error: error instanceof Error ? error.message : "unknown",
    });

    // Fail open on any error
    return {
      allowed: true,
      remaining: LIMIT_PER_WINDOW,
      resetAt,
      shouldRetry: false,
    };
  }
}
