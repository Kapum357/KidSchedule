/**
 * KidSchedule – Calendar API Utilities
 *
 * Helper functions for authentication, validation, and error responses
 * used across calendar API endpoints.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/persistence";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCESS_TOKEN_COOKIE = "access_token";

// ─── JWT Utilities ────────────────────────────────────────────────────────────

interface JWTPayload {
  sub: string;
  email: string;
  sid: string;
  iat: number;
  exp: number;
}

/**
 * Decode JWT without verification (edge-safe).
 * Signature verification happens server-side via session lookup.
 */
function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Check if JWT is expired.
 */
function isJWTExpired(payload: JWTPayload): boolean {
  return payload.exp < Math.floor(Date.now() / 1000);
}

// ─── Authentication ───────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  userId: string;
  email: string;
  sessionId: string;
}

/**
 * Extract authenticated user from request cookies.
 * Returns user or null if not authenticated.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  
  if (!accessToken) return null;
  
  const payload = decodeJWT(accessToken);
  if (!payload) return null;
  
  // Check expiration
  if (isJWTExpired(payload)) {
    return null;
  }
  
  return {
    userId: payload.sub,
    email: payload.email,
    sessionId: payload.sid,
  };
}

// ─── Authorization ────────────────────────────────────────────────────────────

/**
 * Check if user belongs to family.
 * Returns true if user is a parent in the family, false otherwise.
 */
export async function userBelongsToFamily(
  userId: string,
  familyId: string
): Promise<boolean> {
  // During E2E tests we may craft JWTs that don't correspond to a real
  // parent record; bypass the check only when explicitly requested by
  // the TEST_SKIP_AUTH flag, otherwise respect real data.
  if (process.env.NODE_ENV === "test" && process.env.TEST_SKIP_AUTH === "true") {
    return true;
  }

  const parent = await db.parents.findByUserId(userId);
  if (!parent) return false;
  return parent.familyId === familyId;
}

/**
 * Get family for parent user.
 * Returns family or null if user doesn't belong to any family.
 */
export async function getFamilyForUser(userId: string) {
  const parent = await db.parents.findByUserId(userId);
  if (!parent) return null;
  
  const family = await db.families.findById(parent.familyId);
  return family;
}

// ─── Error Responses ──────────────────────────────────────────────────────────

export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Create 400 Bad Request response.
 */
export function badRequest(
  error: string,
  message: string,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { error, message, details },
    { status: 400 }
  );
}

/**
 * Create 429 Too Many Requests response.
 */
export function tooManyRequests(
  error: string = "rate_limited",
  message: string = "Too many requests, please try again later",
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { error, message, details },
    { status: 429 }
  );
}

/**
 * Create 401 Unauthorized response.
 */
export function unauthorized(
  error: string = "unauthorized",
  message: string = "Authentication required"
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { error, message },
    { status: 401 }
  );
}

/**
 * Create 403 Forbidden response.
 */
export function forbidden(
  error: string = "forbidden",
  message: string = "Access denied"
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { error, message },
    { status: 403 }
  );
}

/**
 * Create 404 Not Found response.
 */
export function notFound(
  error: string = "not_found",
  message: string = "Resource not found"
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { error, message },
    { status: 404 }
  );
}

/**
 * Create 409 Conflict response.
 */
export function conflict(
  error: string = "conflict",
  message: string = "Request conflicts with current state"
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { error, message },
    { status: 409 }
  );
}

/**
 * Create 500 Internal Server Error response.
 */
export function internalError(
  error: string = "internal_error",
  message: string = "An unexpected error occurred"
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { error, message },
    { status: 500 }
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate date string is valid ISO 8601.
 */
export function isValidISODate(dateString: string): boolean {
  try {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && date.toISOString().startsWith(dateString.slice(0, 10));
  } catch {
    return false;
  }
}

/**
 * Validate event category.
 */
export function isValidEventCategory(category: string): category is "custody" | "school" | "medical" | "activity" | "holiday" | "other" {
  return ["custody", "school", "medical", "activity", "holiday", "other"].includes(category);
}

/**
 * Validate confirmation status.
 */
export function isValidConfirmationStatus(status: string): status is "confirmed" | "pending" | "declined" {
  return ["confirmed", "pending", "declined"].includes(status);
}

/**
 * Parse JSON body with error handling.
 */
export async function parseJson<T>(request: Request): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await request.json();
    return { success: true, data };
  } catch {
    return { success: false, error: "Invalid JSON in request body" };
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Generate request ID for logging.
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Extract query parameter safely.
 */
export function getQueryParam(url: URL, param: string): string | null {
  const value = url.searchParams.get(param);
  return value ? String(value).trim() : null;
}

// ─── Rate Limiting Helper (generic) ───────────────────────────────────────────

/**
 * Basic rate limit implementation backed by persistence. Accepts a key string that
 * uniquely identifies the entity being rate limited (e.g. `holidays:${userId}:read`)
 * and the maximum number of requests allowed within a sliding window (in seconds).
 *
 * Returns whether further requests are allowed and the current count. This mirrors
 * the logic originally lived in `lib/auth/index.ts` but is pulled into a shared
 * API helper so that multiple endpoints can use it without importing the entire
 * auth service.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; count: number; lockedUntil?: string }> {
  // the database repository uses milliseconds internally
  const existing = await db.rateLimits.get(key);
  if (existing?.lockedUntil) {
    if (new Date(existing.lockedUntil) > new Date()) {
      return { allowed: false, count: existing.count, lockedUntil: existing.lockedUntil };
    }
    // lockout expired, clear it
    await db.rateLimits.clear(key);
  }

  const current = await db.rateLimits.increment(key, windowSeconds * 1000);
  return { allowed: current.count <= maxRequests, count: current.count };
}
