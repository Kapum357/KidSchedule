/**
 * KidSchedule – Server-Only Authentication & Session Management
 * These functions can only be used in Server Components and Server Actions.
 */

import type { AuditAction, DbAuditLog } from "./persistence/types";
import { db } from "./persistence";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestContext } from "./security/csrf";

// ─── Audit Event Types ────────────────────────────────────────────────────────

export interface AuditContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditMetadata {
  [key: string]: string | number | boolean | null | undefined;
}

// ─── PII Sanitization ─────────────────────────────────────────────────────────

/**
 * Masks email address for logging.
 * user@example.com → u***@example.com
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const maskedLocal = local.length > 1 ? local[0] + "***" : "***";
  return `${maskedLocal}@${domain}`;
}

/**
 * Masks phone number for logging.
 * +12345678901 → +1****8901
 */
function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length < 4) return "***";

  const last4 = trimmed.slice(-4);
  const prefix = trimmed.startsWith("+") && trimmed.length >= 2
    ? trimmed.slice(0, 2)
    : "+*";

  return `${prefix}****${last4}`;
}

/**
 * Truncates token to safe prefix for logging.
 * abc123xyz789... → abc123...
 */
function truncateToken(token: string, prefixLength = 8): string {
  if (token.length <= prefixLength) return "***";
  return token.slice(0, prefixLength) + "...";
}

/**
 * Sanitizes metadata to remove or mask sensitive values.
 */
function sanitizeMetadata(metadata: AuditMetadata): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;

    // Mask known sensitive keys
    if (/email/i.test(key) && typeof value === "string") {
      sanitized[key] = maskEmail(value);
    } else if (/phone/i.test(key) && typeof value === "string") {
      sanitized[key] = maskPhone(value);
    } else if (/token|secret|password|otp/i.test(key) && typeof value === "string") {
      sanitized[key] = truncateToken(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ─── Audit Logger Class ───────────────────────────────────────────────────────

class AuditLogger {
  private readonly enableConsole: boolean;

  constructor() {
    // Enable console logging in all environments for log aggregation
    this.enableConsole = true;
  }

  /**
   * Log an audit event.
   * Writes to both database and console (for log aggregation).
   */
  async log(
    action: AuditAction,
    context: AuditContext,
    metadata: AuditMetadata = {}
  ): Promise<DbAuditLog | null> {
    const sanitizedMetadata = sanitizeMetadata(metadata);
    const timestamp = new Date().toISOString();

    // Console log (structured JSON for log aggregation)
    if (this.enableConsole) {
      const logEntry = {
        level: "audit",
        action,
        userId: context.userId,
        ip: context.ip,
        // Truncate user agent for log brevity
        ua: context.userAgent?.slice(0, 100),
        metadata: sanitizedMetadata,
        timestamp,
      };

      // Use JSON format for machine parsing
      console.log(JSON.stringify(logEntry));
    }

    // Database log (async, non-blocking)
    try {
      return await db.auditLogs.create({
        userId: context.userId,
        action,
        metadata: sanitizedMetadata,
        ip: context.ip,
        userAgent: context.userAgent,
      });
    } catch (error) {
      // Log database failures but don't throw – audit should never break the flow
      console.error("[AuditLogger] Database write failed:", error);
      return null;
    }
  }

  // ─── Convenience Methods ──────────────────────────────────────────────────

  async loginSuccess(context: AuditContext, email: string): Promise<void> {
    await this.log("user.login", context, { email, success: true });
  }

  async loginFailed(context: AuditContext, email: string, reason: string): Promise<void> {
    await this.log("user.login_failed", context, { email, reason });
  }

  async logout(context: AuditContext): Promise<void> {
    await this.log("user.logout", context);
  }

  async register(context: AuditContext, email: string): Promise<void> {
    await this.log("user.register", context, { email });
  }

  async passwordResetRequest(context: AuditContext, email: string): Promise<void> {
    await this.log("user.password_reset_request", context, { email });
  }

  async passwordResetComplete(context: AuditContext, email: string): Promise<void> {
    await this.log("user.password_reset_complete", context, { email });
  }

  async phoneVerifyRequest(context: AuditContext, phone: string): Promise<void> {
    await this.log("user.phone_verify_request", context, { phone });
  }

  async phoneVerifySuccess(context: AuditContext, phone: string): Promise<void> {
    await this.log("user.phone_verify_success", context, { phone });
  }

  async phoneVerifyFailed(
    context: AuditContext,
    phone: string,
    attemptsRemaining: number
  ): Promise<void> {
    await this.log("user.phone_verify_failed", context, { phone, attemptsRemaining });
  }

  async sessionCreate(context: AuditContext, sessionId: string): Promise<void> {
    await this.log("session.create", context, { sessionId: truncateToken(sessionId) });
  }

  async sessionRefresh(context: AuditContext, sessionId: string): Promise<void> {
    await this.log("session.refresh", context, { sessionId: truncateToken(sessionId) });
  }

  async sessionRevoke(context: AuditContext, sessionId: string, reason?: string): Promise<void> {
    await this.log("session.revoke", context, { sessionId: truncateToken(sessionId), reason });
  }

  async sessionRevokeAll(context: AuditContext, reason?: string): Promise<void> {
    await this.log("session.revoke_all", context, { reason });
  }

  async rateLimitTriggered(context: AuditContext, key: string, type: string): Promise<void> {
    // Don't log the full key (may contain email)
    const sanitizedKey = key.split(":")[0] + ":***";
    await this.log("rate_limit.triggered", context, { keyType: sanitizedKey, limitType: type });
  }

  async suspiciousActivity(
    context: AuditContext,
    reason: string,
    details: AuditMetadata = {}
  ): Promise<void> {
    await this.log("security.suspicious_activity", context, { reason, ...details });
  }
}

// ─── Re-export auth functions ──────────────────────────────────────────────────

export {
  login,
  register,
  requestPasswordReset,
  requestPhoneVerification,
  verifyPhoneOTP,
  resetPassword,
  verifyEmailAddress,
} from "./auth/index";

// ─── Session Context ──────────────────────────────────────────────────────────

export interface SessionUser {
  userId: string;
  email: string;
  sessionId: string;
}

/**
 * Get current user from session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;

  if (!accessToken) return null;

  const payload = decodeJWT(accessToken);
  if (!payload) return null;

  // Check expiration
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    userId: payload.sub,
    email: payload.email,
    sessionId: payload.sid,
  };
}

/**
 * Require authentication – redirects to login if not authenticated.
 * Use at the start of protected Server Actions or page components.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

// ─── Session Operations ───────────────────────────────────────────────────────

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const REFRESH_TOKEN_REMEMBER_ME_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

interface JWTPayload {
  sub: string;
  email: string;
  sid: string;
  iat: number;
  exp: number;
}

/**
 * Decode JWT payload without verification.
 * In production, verify signature with jose or jsonwebtoken.
 */
function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Generate a signed JWT access token.
 *
 * Production implementation:
 * import { SignJWT } from "jose";
 * const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET);
 * return await new SignJWT({ email, sid: sessionId })
 *   .setProtectedHeader({ alg: "HS256" })
 *   .setSubject(userId)
 *   .setIssuedAt()
 *   .setExpirationTime("15m")
 *   .sign(secret);
 */
function generateAccessToken(
  userId: string,
  email: string,
  sessionId: string,
  expiresAt: Date
): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      sid: sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    })
  ).toString("base64url");

  // Mock signature – replace with actual signing in production
  const signature = Buffer.from(`sig_${userId}_${sessionId}`).toString("base64url");

  return `${header}.${payload}.${signature}`;
}

/**
 * Generate a secure refresh token.
 */
function generateRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Hash refresh token for storage.
 * Uses SHA-256 for fast lookups (refresh tokens are already high-entropy).
 */
async function hashRefreshToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hashBuffer).toString("hex");
}

/**
 * Create a new session and set cookies.
 * Called after successful authentication.
 */
export async function createSession(
  userId: string,
  email: string,
  rememberMe: boolean = false
): Promise<void> {
  const now = new Date();
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Generate tokens
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_MAX_AGE * 1000);
  const refreshExpiresAt = new Date(
    now.getTime() + (rememberMe ? REFRESH_TOKEN_REMEMBER_ME_MAX_AGE : REFRESH_TOKEN_MAX_AGE) * 1000
  );

  const accessToken = generateAccessToken(userId, email, sessionId, accessExpiresAt);
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await hashRefreshToken(refreshToken);

  // Get request context for audit
  const ctx = await getRequestContext();

  // Store session in database
  await db.sessions.create({
    userId,
    refreshTokenHash,
    expiresAt: refreshExpiresAt.toISOString(),
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    isRevoked: false,
  });

  // Set cookies
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: rememberMe ? REFRESH_TOKEN_REMEMBER_ME_MAX_AGE : REFRESH_TOKEN_MAX_AGE,
    path: "/",
  });

  // Audit log
  await audit.sessionCreate({ userId, ip: ctx.ip, userAgent: ctx.userAgent }, sessionId);
}

/**
 * Refresh the session using the refresh token.
 * Returns true if refresh succeeded, false otherwise.
 */
export async function refreshSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) return false;

  const refreshTokenHash = await hashRefreshToken(refreshToken);
  const session = await db.sessions.findByRefreshTokenHash(refreshTokenHash);

  if (!session || session.isRevoked) {
    // Clear cookies
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    return false;
  }

  // Check expiration
  if (new Date(session.expiresAt) < new Date()) {
    await db.sessions.revoke(session.id, "expired");
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    return false;
  }

  // Get user
  const user = await db.users.findById(session.userId);
  if (!user || user.isDisabled) {
    await db.sessions.revoke(session.id, "user_disabled");
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    return false;
  }

  // Rotate refresh token
  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = await hashRefreshToken(newRefreshToken);
  const newExpiresAt = new Date(
    Date.now() + REFRESH_TOKEN_MAX_AGE * 1000
  ).toISOString();

  await db.sessions.rotate(session.id, newRefreshTokenHash, newExpiresAt);

  // Generate new access token
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_MAX_AGE * 1000);
  const accessToken = generateAccessToken(
    user.id,
    user.email,
    session.id,
    accessExpiresAt
  );

  // Update cookies
  const isProduction = process.env.NODE_ENV === "production";

  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, newRefreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: "/",
  });

  // Audit log
  const ctx = await getRequestContext();
  await audit.sessionRefresh({ userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent }, session.id);

  return true;
}

/**
 * End the current session.
 */
export async function endSession(): Promise<void> {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    const refreshTokenHash = await hashRefreshToken(refreshToken);
    const session = await db.sessions.findByRefreshTokenHash(refreshTokenHash);

    if (session) {
      await db.sessions.revoke(session.id, "logout");

      // Audit log
      const ctx = await getRequestContext();
      await audit.sessionRevoke(
        { userId: user?.userId, ip: ctx.ip, userAgent: ctx.userAgent },
        session.id,
        "logout"
      );
    }
  }

  // Clear cookies
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

/**
 * Revoke all sessions for a user.
 * Used after password reset or security events.
 */
export async function revokeAllSessions(userId: string, reason: string): Promise<void> {
  await db.sessions.revokeAllForUser(userId, reason);

  // Audit log
  const ctx = await getRequestContext();
  await audit.sessionRevokeAll({ userId, ip: ctx.ip, userAgent: ctx.userAgent }, reason);
}