/**
 * KidSchedule – Next.js Middleware
 *
 * Handles authentication, session refresh, and security headers.
 * Runs on Edge runtime for low latency.
 *
 * Protected routes require a valid access token.
 * When access token expires, middleware attempts refresh using refresh token.
 */

import { NextResponse, type NextRequest } from "next/server";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Routes that don't require authentication */
const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/forgot-password/check-email",
  "/reset-password",
  "/blog",
  "/faq",
  "/privacy",
  "/terms",
  "/for-coparents",
  "/for-families",
  "/for-teams",
  "/pta",
]);

/** Route prefixes that are always public */
const PUBLIC_PREFIXES = [
  "/blog/",           // Blog articles
  "/reset-password/", // Password reset with token
  "/_next/",          // Next.js static assets
  "/api/public/",     // Public API routes
];

/** Routes that should redirect to dashboard if already authenticated */
const AUTH_ROUTES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
]);

/** Access token cookie name */
const ACCESS_TOKEN_COOKIE = "access_token";

/** Refresh token cookie name */
const REFRESH_TOKEN_COOKIE = "refresh_token";

/** Access token TTL in seconds */
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes

// ─── JWT Utilities (Edge-compatible) ──────────────────────────────────────────

interface JWTPayload {
  sub: string;
  email: string;
  sid: string;
  iat: number;
  exp: number;
}

/**
 * Decode JWT payload without verification (Edge-compatible).
 * Signature verification should happen server-side.
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

// ─── Security Headers ─────────────────────────────────────────────────────────

/**
 * Apply security headers to response.
 */
function applySecurityHeaders(response: NextResponse): void {
  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");
  
  // XSS protection
  response.headers.set("X-XSS-Protection", "1; mode=block");
  
  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");
  
  // Control referrer
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Permissions policy
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
}

// ─── Route Matching ───────────────────────────────────────────────────────────

function isPublicRoute(pathname: string): boolean {
  // Check exact matches
  if (PUBLIC_ROUTES.has(pathname)) return true;
  
  // Check prefixes
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  
  return false;
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.has(pathname);
}

// ─── Middleware Handler ───────────────────────────────────────────────────────

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  
  // Get tokens from cookies
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  
  // Decode access token if present
  const accessPayload = accessToken ? decodeJWT(accessToken) : null;
  const isAccessValid = accessPayload && !isJWTExpired(accessPayload);
  
  // ── Public Routes ─────────────────────────────────────────────────────────
  if (isPublicRoute(pathname)) {
    // Redirect authenticated users away from auth routes
    if (isAuthRoute(pathname) && isAccessValid) {
      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
    
    // Allow access to public route
    const response = NextResponse.next();
    applySecurityHeaders(response);
    return response;
  }
  
  // ── Protected Routes ──────────────────────────────────────────────────────
  
  // Valid access token – allow access
  if (isAccessValid && accessPayload) {
    const response = NextResponse.next();
    applySecurityHeaders(response);
    
    // Add user context to headers for server components
    response.headers.set("x-user-id", accessPayload.sub);
    response.headers.set("x-user-email", accessPayload.email);
    response.headers.set("x-session-id", accessPayload.sid);
    
    return response;
  }
  
  // Access token expired or missing – try refresh
  if (refreshToken) {
    // In a full implementation, call refresh endpoint here
    // For now, redirect to login with return URL
    
    /**
     * Production implementation:
     * 
     * const refreshResponse = await fetch(new URL("/api/auth/refresh", request.url), {
     *   method: "POST",
     *   headers: { "Content-Type": "application/json" },
     *   body: JSON.stringify({ refreshToken }),
     * });
     * 
     * if (refreshResponse.ok) {
     *   const { accessToken: newAccess, refreshToken: newRefresh } = await refreshResponse.json();
     *   const response = NextResponse.next();
     *   response.cookies.set(ACCESS_TOKEN_COOKIE, newAccess, {
     *     httpOnly: true,
     *     secure: process.env.NODE_ENV === "production",
     *     sameSite: "lax",
     *     maxAge: ACCESS_TOKEN_TTL,
     *   });
     *   response.cookies.set(REFRESH_TOKEN_COOKIE, newRefresh, {
     *     httpOnly: true,
     *     secure: process.env.NODE_ENV === "production",
     *     sameSite: "lax",
     *     maxAge: 7 * 24 * 3600, // or 30 days for "remember me"
     *   });
     *   return response;
     * }
     */
  }
  
  // No valid session – redirect to login
  const loginUrl = new URL("/login", request.url);
  
  // Preserve return URL for post-login redirect
  if (pathname !== "/dashboard") {
    loginUrl.searchParams.set("returnTo", pathname);
  }
  
  const response = NextResponse.redirect(loginUrl);
  applySecurityHeaders(response);
  
  // Clear invalid cookies
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  // Don't delete refresh token – server will validate and clear if invalid
  
  return response;
}

// ─── Middleware Config ────────────────────────────────────────────────────────

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
