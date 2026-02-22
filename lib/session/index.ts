/**
 * KidSchedule – Session Management
 *
 * Server-side session utilities for managing authentication state.
 * Used by Server Actions and API routes.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../persistence";
import { audit } from "../audit";
import { getRequestContext } from "../security/csrf";

// ─── Configuration ────────────────────────────────────────────────────────────

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const REFRESH_TOKEN_REMEMBER_ME_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// ─── JWT Utilities ────────────────────────────────────────────────────────────

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
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  
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
