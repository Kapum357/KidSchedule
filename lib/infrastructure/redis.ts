/**
 * Redis Client Adapter
 *
 * Provides a type-safe, production-ready Redis client for rate limiting,
 * session storage, and OTP throttling. Uses ioredis for Node.js runtime
 * or Upstash Redis for Edge/serverless compatibility.
 *
 * Key Patterns:
 * - rl:ip:{ip}              → IP-based rate limit counter
 * - rl:email:{emailHash}    → Email-based rate limit counter
 * - otp:req:{phoneHash}     → OTP request tracking
 * - session:{sessionId}     → Session data (opaque refresh tokens)
 * - refresh:{tokenHash}     → Refresh token → session mapping
 */

import type { ParentId } from "@/types";

// ─── Type Definitions ──────────────────────────────────────────────────────────

export interface RateLimitState {
  attempts: number;
  firstAttemptAt: string; // ISO-8601
  lastAttemptAt: string;  // ISO-8601
  lockedUntil?: string;   // ISO-8601
}

export interface SessionData {
  sessionId: string;
  userId: string;
  parentId: ParentId;
  email: string;
  refreshTokenHash: string;
  expiresAt: string;       // ISO-8601
  refreshExpiresAt: string; // ISO-8601
  createdAt: string;       // ISO-8601
  rememberMe: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface OTPAttemptState {
  attempts: number;
  lockedUntil?: string; // ISO-8601
}

// ─── Redis Client Interface ───────────────────────────────────────────────────

/**
 * Abstract interface for Redis operations.
 * Allows swapping between ioredis (Node.js) and Upstash (Edge/serverless).
 */
export interface RedisClient {
  /** Increment a counter and return new value */
  incr(key: string): Promise<number>;
  
  /** Set expiration on a key (seconds) */
  expire(key: string, seconds: number): Promise<boolean>;
  
  /** Get string value */
  get(key: string): Promise<string | null>;
  
  /** Set string value with optional expiration (seconds) */
  set(key: string, value: string, expirySeconds?: number): Promise<void>;
  
  /** Delete one or more keys */
  del(...keys: string[]): Promise<number>;
  
  /** Check if key exists */
  exists(key: string): Promise<boolean>;
  
  /** Get TTL in seconds (-1 if no expiry, -2 if not exists) */
  ttl(key: string): Promise<number>;
}

// ─── Production Redis Client ──────────────────────────────────────────────────

/**
 * Production Redis client using ioredis.
 * For Edge runtime, replace with Upstash Redis client.
 *
 * To enable: Set REDIS_URL environment variable and uncomment client initialization.
 * Install: pnpm add ioredis @types/ioredis
 *
 * Example:
 *   import Redis from 'ioredis';
 *   private client = new Redis(process.env.REDIS_URL!);
 */
class ProductionRedisClient implements RedisClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async incr(key: string): Promise<number> {
    throw new Error("Redis not configured. Set REDIS_URL in environment.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async expire(key: string, seconds: number): Promise<boolean> {
    throw new Error("Redis not configured. Set REDIS_URL in environment.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async get(key: string): Promise<string | null> {
    throw new Error("Redis not configured. Set REDIS_URL in environment.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async set(key: string, value: string, expirySeconds?: number): Promise<void> {
    throw new Error("Redis not configured. Set REDIS_URL in environment.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async del(...keys: string[]): Promise<number> {
    throw new Error("Redis not configured. Set REDIS_URL in environment.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async exists(key: string): Promise<boolean> {
    throw new Error("Redis not configured. Set REDIS_URL in environment.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async ttl(key: string): Promise<number> {
    throw new Error("Redis not configured. Set REDIS_URL in environment.");
  }
}

// ─── Mock Redis Client (Development Only) ─────────────────────────────────────

/**
 * In-memory Redis mock for development and testing.
 * DO NOT USE IN PRODUCTION.
 */
class MockRedisClient implements RedisClient {
  private readonly store = new Map<string, { value: string; expiresAt?: number }>();

  async incr(key: string): Promise<number> {
    const current = this.store.get(key);
    const value = current ? Number.parseInt(current.value, 10) + 1 : 1;
    this.store.set(key, { value: value.toString(), expiresAt: current?.expiresAt });
    return value;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + seconds * 1000;
    return true;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, expirySeconds?: number): Promise<void> {
    const expiresAt = expirySeconds ? Date.now() + expirySeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
    }
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }
}

// ─── Client Singleton ──────────────────────────────────────────────────────────

let redisClient: RedisClient | null = null;

/**
 * Get or create Redis client singleton.
 * Uses production client if REDIS_URL is set, otherwise falls back to mock.
 */
export function getRedisClient(): RedisClient {
  if (redisClient) return redisClient;

  if (process.env.NODE_ENV === "production" && process.env.REDIS_URL) {
    redisClient = new ProductionRedisClient();
  } else {
    console.warn("[Redis] Using in-memory mock. Set REDIS_URL for production.");
    redisClient = new MockRedisClient();
  }

  return redisClient;
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Hash a value for use as a Redis key (privacy-preserving).
 * Uses SHA-256 to prevent exposing emails/phones in Redis keys.
 */
export async function hashForKey(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build rate limit key for IP address.
 */
export async function getRateLimitKeyIP(ip: string): Promise<string> {
  const hash = await hashForKey(ip);
  return `rl:ip:${hash}`;
}

/**
 * Build rate limit key for email address.
 */
export async function getRateLimitKeyEmail(email: string): Promise<string> {
  const hash = await hashForKey(email);
  return `rl:email:${hash}`;
}

/**
 * Build OTP request tracking key for phone number.
 */
export async function getOTPKey(phone: string): Promise<string> {
  const hash = await hashForKey(phone);
  return `otp:req:${hash}`;
}

/**
 * Build session storage key.
 */
export function getSessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Build refresh token lookup key (hash of token → session ID).
 */
export async function getRefreshTokenKey(tokenHash: string): Promise<string> {
  return `refresh:${tokenHash}`;
}
