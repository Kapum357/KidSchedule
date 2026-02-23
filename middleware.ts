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

const isDevelopment = process.env.NODE_ENV === "development";

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
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

function buildCSP(nonce: string): string {
  const directives = [
    "default-src 'self'",
    [
      "script-src",
      "'self'",
      `'nonce-${nonce}'`,
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      "https://accounts.google.com",
      "https://apis.google.com",
      "https://appleid.cdn-apple.com",
    ].join(" "),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com",
    "font-src 'self' https://fonts.gstatic.com",
    [
      "connect-src",
      "'self'",
      ...(isDevelopment
        ? ["ws://localhost:*", "http://localhost:*", "ws://127.0.0.1:*", "http://127.0.0.1:*"]
        : []),
      "https://accounts.google.com",
      "https://appleid.apple.com",
    ].join(" "),
    "frame-src https://accounts.google.com https://appleid.apple.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ];

  return directives.join("; ");
}

function applySecurityHeaders(response: NextResponse, nonce: string): void {
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

  // CSP with per-request nonce (required for Next.js inline hydration/runtime scripts)
  response.headers.set("Content-Security-Policy", buildCSP(nonce));
}

function createNextResponseWithNonce(request: NextRequest, nonce: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
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
  const nonce = generateNonce();
  
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
      const response = NextResponse.redirect(dashboardUrl);
      applySecurityHeaders(response, nonce);
      return response;
    }
    
    // Allow access to public route
    const response = createNextResponseWithNonce(request, nonce);
    applySecurityHeaders(response, nonce);
    return response;
  }
  
  // ── Protected Routes ──────────────────────────────────────────────────────
  
  // Valid access token – allow access
  if (isAccessValid && accessPayload) {
    const response = createNextResponseWithNonce(request, nonce);
    applySecurityHeaders(response, nonce);
    
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
  applySecurityHeaders(response, nonce);
  
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
