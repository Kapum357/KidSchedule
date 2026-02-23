/**
 * KidSchedule – Security Headers Configuration
 *
 * Configures HTTP security headers for the application.
 * These are applied via Next.js middleware and next.config.ts.
 *
 * Headers implemented:
 *   - Content-Security-Policy (CSP)
 *   - X-Frame-Options
 *   - X-Content-Type-Options
 *   - Referrer-Policy
 *   - Permissions-Policy
 *   - Strict-Transport-Security (HSTS)
 */

// ─── CSP Directives ───────────────────────────────────────────────────────────

/**
 * Content Security Policy directives.
 * 
 * Note: 'unsafe-inline' for style-src is required for Tailwind's inline styles.
 * Consider using nonce-based CSP for stricter security in future.
 */
const CSP_DIRECTIVES = {
  // Default: only same-origin
  "default-src": ["'self'"],

  // Scripts: self + OAuth providers
  "script-src": [
    "'self'",
    // Google Sign-In
    "https://accounts.google.com",
    "https://apis.google.com",
    // Apple Sign-In
    "https://appleid.cdn-apple.com",
    // Next.js dev (only in development)
    ...(process.env.NODE_ENV === "development" ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
  ],

  // Styles: self + inline (Tailwind) + Google Fonts
  "style-src": [
    "'self'",
    "'unsafe-inline'", // Required for Tailwind
    "https://fonts.googleapis.com",
  ],

  // Images: self + Google user content + data URIs
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://lh3.googleusercontent.com", // Google profile photos
    "https://*.googleusercontent.com",
  ],

  // Fonts: self + Google Fonts
  "font-src": [
    "'self'",
    "https://fonts.gstatic.com",
  ],

  // Connections: self + API endpoints
  "connect-src": [
    "'self'",
    ...(process.env.NODE_ENV === "development"
      ? ["ws://localhost:*", "http://localhost:*", "ws://127.0.0.1:*", "http://127.0.0.1:*"]
      : []),
    // OAuth providers
    "https://accounts.google.com",
    "https://appleid.apple.com",
    // Analytics (if used)
    // "https://www.google-analytics.com",
  ],

  // Frames: none by default, allow OAuth popups
  "frame-src": [
    "https://accounts.google.com",
    "https://appleid.apple.com",
  ],

  // Frame ancestors: prevent clickjacking
  "frame-ancestors": ["'none'"],

  // Forms: self only
  "form-action": ["'self'"],

  // Base URI: self only
  "base-uri": ["'self'"],

  // Upgrade insecure requests in production
  ...(process.env.NODE_ENV === "production" && {
    "upgrade-insecure-requests": [],
  }),
};

/**
 * Build CSP header string from directives.
 */
export function buildCSP(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, values]) => {
      if (values.length === 0) return directive;
      return `${directive} ${values.join(" ")}`;
    })
    .join("; ");
}

// ─── Other Security Headers ───────────────────────────────────────────────────

export const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",

  // XSS protection (legacy, but still useful)
  "X-XSS-Protection": "1; mode=block",

  // Prevent clickjacking
  "X-Frame-Options": "DENY",

  // Control referrer information
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // Permissions policy (restrict browser features)
  "Permissions-Policy": [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "interest-cohort=()", // Disable FLoC
  ].join(", "),

  // HSTS (Strict Transport Security)
  // Only enable in production with proper HTTPS setup
  ...(process.env.NODE_ENV === "production" && {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  }),

  // CSP
  "Content-Security-Policy": buildCSP(),
};

/**
 * Returns security headers as an array for Next.js headers() config.
 */
export function getSecurityHeadersArray(): Array<{ key: string; value: string }> {
  return Object.entries(SECURITY_HEADERS).map(([key, value]) => ({
    key,
    value,
  }));
}

// ─── Auth Page Specific Headers ───────────────────────────────────────────────

/**
 * Stricter headers for authentication pages.
 * More restrictive frame-ancestors and caching.
 */
export const AUTH_PAGE_HEADERS = {
  ...SECURITY_HEADERS,
  // Ensure auth pages are never cached
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};
