/**
 * Redis Rate Limiter Tests
 *
 * Tests for rate limiting implementation using Redis.
 * Covers all 8+ test scenarios specified in the requirements.
 */

// Mock logger
jest.mock("@/lib/observability/logger", () => ({
  logEvent: jest.fn(),
}));

// Mock Redis client
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
  incr: jest.fn(),
  ttl: jest.fn(),
  del: jest.fn(),
};

jest.mock("@upstash/redis", () => ({
  Redis: jest.fn(() => mockRedisClient),
}));

jest.mock("redis", () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    get: mockRedisClient.get,
    setEx: mockRedisClient.setEx,
    incr: mockRedisClient.incr,
    ttl: mockRedisClient.ttl,
    del: mockRedisClient.del,
  })),
}));

process.env.UPSTASH_REDIS_URL = "https://test-upstash-url.upstash.io";
process.env.UPSTASH_REDIS_TOKEN = "test-token";

// Import after mocks
import { checkRateLimit } from "@/lib/providers/redis-rate-limiter";

describe("Redis Rate Limiter - Twilio Webhooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Request 100 webhooks in minute → all pass
  describe("Test 1: Allow requests within 100/min limit", () => {
    it("should allow 1st request (initializes counter)", async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce(undefined);

      const result = await checkRateLimit("family-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99); // 100 - 1
    });

    it("should allow 50th request", async () => {
      mockRedisClient.get.mockResolvedValueOnce(49);
      mockRedisClient.incr.mockResolvedValueOnce(50);

      const result = await checkRateLimit("family-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(50);
    });

    it("should allow 100th request", async () => {
      mockRedisClient.get.mockResolvedValueOnce(99);
      mockRedisClient.incr.mockResolvedValueOnce(100);

      const result = await checkRateLimit("family-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  // Test 2: Request 101st webhook → 429 Too Many Requests
  describe("Test 2: Reject request at limit (101st+)", () => {
    it("should reject when count >= 100", async () => {
      mockRedisClient.get.mockResolvedValueOnce(100);

      const result = await checkRateLimit("family-2");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.shouldRetry).toBe(false); // 429 not retryable
    });

    it("should reject when count > 100", async () => {
      mockRedisClient.get.mockResolvedValueOnce(150);

      const result = await checkRateLimit("family-2b");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  // Test 3: Rate limit reset after 60 seconds
  describe("Test 3: Reset window 60 seconds", () => {
    it("should provide resetAt ~60 seconds in future", async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce(undefined);

      const timeBefore = Date.now();
      const result = await checkRateLimit("family-3");
      const timeAfter = Date.now();

      const resetTime = result.resetAt.getTime();
      const minExpected = timeBefore + 59000;
      const maxExpected = timeAfter + 61000;

      expect(resetTime).toBeGreaterThanOrEqual(minExpected);
      expect(resetTime).toBeLessThanOrEqual(maxExpected);
    });
  });

  // Test 4: Different families have independent limits
  describe("Test 4: Independent limits per family", () => {
    it("family-A and family-B tracked separately", async () => {
      // Family A at limit
      mockRedisClient.get.mockResolvedValueOnce(100);
      const resultA = await checkRateLimit("family-A");
      expect(resultA.allowed).toBe(false);

      // Family B under limit
      mockRedisClient.get.mockResolvedValueOnce(50);
      mockRedisClient.incr.mockResolvedValueOnce(51);
      const resultB = await checkRateLimit("family-B");

      expect(resultB.allowed).toBe(true);
      expect(resultB.remaining).toBe(49);
    });
  });

  // Test 5: Redis error → request allowed (fail open)
  describe("Test 5: Fail open on Redis error", () => {
    it("should allow if Redis throws error", async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error("Connection failed"));

      const result = await checkRateLimit("family-5");

      expect(result.allowed).toBe(true); // Fail open
      expect(result.remaining).toBe(100); // Full capacity
    });

    it("should allow if Redis returns undefined", async () => {
      mockRedisClient.get.mockResolvedValueOnce(undefined);
      mockRedisClient.set.mockResolvedValueOnce(undefined);

      const result = await checkRateLimit("family-5b");

      expect(result.allowed).toBe(true);
    });
  });

  // Test 6: Multiple concurrent requests handled atomically
  describe("Test 6: Atomic concurrent handling", () => {
    it("should handle concurrent requests", async () => {
      const familyId = "family-6";

      // Setup mocks for 3 concurrent requests
      mockRedisClient.get.mockResolvedValueOnce(97);
      mockRedisClient.incr.mockResolvedValueOnce(98);
      const promise1 = checkRateLimit(familyId);

      mockRedisClient.get.mockResolvedValueOnce(98);
      mockRedisClient.incr.mockResolvedValueOnce(99);
      const promise2 = checkRateLimit(familyId);

      mockRedisClient.get.mockResolvedValueOnce(99);
      mockRedisClient.incr.mockResolvedValueOnce(100);
      const promise3 = checkRateLimit(familyId);

      const [r1, r2, r3] = await Promise.all([promise1, promise2, promise3]);

      // All should be allowed (still below limit)
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);

      // Remaining should decrease
      expect(r1.remaining).toBe(2);
      expect(r2.remaining).toBe(1);
      expect(r3.remaining).toBe(0);
    });
  });

  // Test 7: Rate limit headers present in response
  describe("Test 7: Response includes rate limit metadata", () => {
    it("should return allowed, remaining, resetAt, shouldRetry", async () => {
      mockRedisClient.get.mockResolvedValueOnce(25);
      mockRedisClient.incr.mockResolvedValueOnce(26);

      const result = await checkRateLimit("family-7");

      expect(result).toHaveProperty("allowed");
      expect(result).toHaveProperty("remaining");
      expect(result).toHaveProperty("resetAt");
      expect(result).toHaveProperty("shouldRetry");

      expect(typeof result.allowed).toBe("boolean");
      expect(typeof result.remaining).toBe("number");
      expect(result.resetAt instanceof Date).toBe(true);
      expect(typeof result.shouldRetry).toBe("boolean");
    });

    it("should have remaining >= 0 and <= 100", async () => {
      mockRedisClient.get.mockResolvedValueOnce(50);
      mockRedisClient.incr.mockResolvedValueOnce(51);

      const result = await checkRateLimit("family-7b");

      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.remaining).toBeLessThanOrEqual(100);
    });
  });

  // Test 8: Retry-After header correct for 429 response
  describe("Test 8: Retry-After calculation", () => {
    it("should calculate ~60 seconds until reset on 429", async () => {
      mockRedisClient.get.mockResolvedValueOnce(100);

      const timeBefore = Date.now();
      const result = await checkRateLimit("family-8");

      const retryAfterMs = result.resetAt.getTime() - timeBefore;
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      expect(retryAfterSeconds).toBeGreaterThanOrEqual(59);
      expect(retryAfterSeconds).toBeLessThanOrEqual(61);
      expect(result.allowed).toBe(false);
    });
  });

  // Test 9: First request initializes counter
  describe("Test 9: Initialize counter on first request", () => {
    it("should set key to 1 with 60s TTL", async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce(undefined);

      const result = await checkRateLimit("family-9");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99); // 100 - 1
      expect(mockRedisClient.set).toHaveBeenCalled();
    });
  });

  // Test 10: Boundary conditions
  describe("Test 10: Boundary at exactly 100", () => {
    it("should allow when remaining=1", async () => {
      mockRedisClient.get.mockResolvedValueOnce(99);
      mockRedisClient.incr.mockResolvedValueOnce(100);

      const result = await checkRateLimit("family-10");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it("should reject when at 100", async () => {
      mockRedisClient.get.mockResolvedValueOnce(100);

      const result = await checkRateLimit("family-10b");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  // Test 11: Result type validation
  describe("Test 11: RateLimitResult structure", () => {
    it("should always return valid structure", async () => {
      mockRedisClient.get.mockResolvedValueOnce(50);
      mockRedisClient.incr.mockResolvedValueOnce(51);

      const result = await checkRateLimit("family-11");

      // Type checks
      expect(typeof result.allowed).toBe("boolean");
      expect(typeof result.remaining).toBe("number");
      expect(typeof result.shouldRetry).toBe("boolean");
      expect(result.resetAt).toBeInstanceOf(Date);

      // Value checks
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.remaining).toBeLessThanOrEqual(100);
      expect(result.shouldRetry).toBe(false); // Never retry on rate limit
    });
  });

  // Test 12: Redis timeout handling
  describe("Test 12: Timeout handling", () => {
    it("should fail open on Redis timeout", async () => {
      // Simulate timeout by returning a promise that resolves after timeout
      mockRedisClient.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(null), 5000); // Longer than 1s timeout
          })
      );

      const result = await checkRateLimit("family-12");

      // Should allow and return full capacity
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
    });
  });
});
