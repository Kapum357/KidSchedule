/**
 * KidSchedule – CSRF Protection
 *
 * Next.js 14+ Server Actions have built-in CSRF protection via:
 *   - Origin header verification
 *   - Content-Type checking
 *   - Action ID binding
 *
 * This module provides additional CSRF utilities for edge cases.
 */

import { headers } from "next/headers";

// ─── Origin Verification ──────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  // Production
  "https://v1.kidschedule.com",
  "https://kidschedule.com",
  "https://www.kidschedule.com",
  // Development
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://127.0.0.1:3000"]
    : []),
]);

// Add APP_URL if configured
if (process.env.APP_URL) {
  ALLOWED_ORIGINS.add(process.env.APP_URL);
  // Also add without trailing slash
  ALLOWED_ORIGINS.add(process.env.APP_URL.replace(/\/$/, ""));
}

/**
 * Verifies the request origin matches allowed origins.
 * Used for additional CSRF protection on sensitive actions.
 *
 * Note: Next.js Server Actions already verify Origin header,
 * but this provides explicit logging and customization.
 */
export async function verifyOrigin(): Promise<{
  valid: boolean;
  origin: string | null;
}> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  const referer = headerList.get("referer");

  // Check origin header first
  if (origin) {
    return {
      valid: ALLOWED_ORIGINS.has(origin),
      origin,
    };
  }

  // Fall back to referer if origin is missing
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      return {
        valid: ALLOWED_ORIGINS.has(refererOrigin),
        origin: refererOrigin,
      };
    } catch {
      return { valid: false, origin: null };
    }
  }

  // No origin or referer – likely a direct request
  // In production, this should be rejected for mutations
  return { valid: process.env.NODE_ENV === "development", origin: null };
}

// ─── Request Context ──────────────────────────────────────────────────────────

/**
 * Extracts request context for audit logging.
 * Call this at the start of Server Actions.
 */
export async function getRequestContext(): Promise<{
  ip: string;
  userAgent: string;
  origin: string | null;
}> {
  const headerList = await headers();

  // Get IP address (check forwarding headers for proxies)
  const forwardedFor = headerList.get("x-forwarded-for");
  const realIp = headerList.get("x-real-ip");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? realIp ?? "unknown";

  // Get user agent
  const userAgent = headerList.get("user-agent") ?? "unknown";

  // Get origin
  const origin = headerList.get("origin");

  return { ip, userAgent, origin };
}
