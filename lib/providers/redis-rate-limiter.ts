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

/**
 * TESTING ONLY: Reset the redis client singleton
 * This allows tests to get a fresh client instance
 */
export function __resetRedisClient() {
  redisClient = null;
}

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
 * Algorithm (atomic INCR-first pattern to prevent race conditions):
 * 1. INCR the counter (atomic)
 * 2. If result > 100: DECR (rollback) and reject
 * 3. If result <= 100: Allow and optionally SET TTL on first request
 * 4. Calculate remaining quota and reset time
 *
 * This pattern is atomic and prevents race conditions where concurrent requests
 * at count=99 could both see 99 and both increment.
 *
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

    // ATOMIC INCR-FIRST PATTERN:
    // 1. Increment counter atomically (this is the key operation)
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

    // If timeout or error during INCR, fail open
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

    // 2. Check if we exceeded the limit
    if (newCount > LIMIT_PER_WINDOW) {
      // Rate limit exceeded - rollback the increment
      if (redis instanceof UpstashRedis) {
        await Promise.race([redis.decr(key), timeoutPromise]);
      } else {
        await Promise.race([
          (redis as ReturnType<typeof createRedisClient>).decr(key),
          timeoutPromise,
        ]);
      }

      logEvent("warn", "Twilio webhook rate limit exceeded", {
        operation: "check_rate_limit",
        familyId,
        newCount,
        limit: LIMIT_PER_WINDOW,
      });

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        shouldRetry: false, // 429 is not retryable
      };
    }

    // 3. Request is allowed. Set TTL on first request (when count == 1)
    if (newCount === 1) {
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
    }

    return {
      allowed: true,
      remaining: Math.max(0, LIMIT_PER_WINDOW - newCount),
      resetAt,
      shouldRetry: false,
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
