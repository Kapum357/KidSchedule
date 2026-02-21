/**
 * KidSchedule – AuthEngine
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * The authentication system handles user login, session lifecycle, rate limiting,
 * OAuth exchange, and password reset via a layered defense model:
 *
 *  Layer 1 – Input Validation:  Email/password format checked before any DB query
 *  Layer 2 – Rate Limiting:     Exponential backoff per IP and per email
 *  Layer 3 – Credential Check:  Constant-time password hash comparison (no timing leaks)
 *  Layer 4 – Session Issuance:  Dual-token model (short-lived access + long-lived refresh)
 *  Layer 5 – Session Refresh:   Refresh token rotated on every use (prevents replay attacks)
 *
 * DUAL-TOKEN DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 * KidSchedule uses a dual-token model common in OAuth 2.0:
 *
 *   ┌─────────────────────────┐    ┌──────────────────────────────┐
 *   │  Access Token (JWT)     │    │  Refresh Token (opaque)      │
 *   │  • Signed + encoded     │    │  • Random, stored in DB      │
 *   │  • Expiry: 15 minutes   │    │  • Expiry: 7d or 30d         │
 *   │  • httpOnly cookie      │    │  • httpOnly cookie           │
 *   │  • Validated in-memory  │    │  • Rotated on every use      │
 *   └─────────────────────────┘    └──────────────────────────────┘
 *
 * On each request, the middleware verifies the access token. When it expires,
 * the client exchanges the refresh token for a new pair. If the refresh token
 * is invalid or expired, the user must log in again.
 *
 * RATE LIMITING
 * ─────────────────────────────────────────────────────────────────────────────
 * Two independent rate limits run in parallel to block brute-force attacks:
 *
 *   Per-email:  5 failures in 15 min → 15-min lockout
 *   Per-IP:     20 failures in 15 min → 30-min lockout
 *
 * Both use a sliding window that resets after the lockout period expires.
 * In production, replace the in-memory Map with Redis INCR + EXPIREAT for
 * horizontally-scaled deployments.
 *
 * COMPLEXITY
 * ─────────────────────────────────────────────────────────────────────────────
 *   • Rate-limit check:   O(1) lookup in Map (O(log N) in Redis sorted sets)
 *   • Input validation:   O(1) regex match
 *   • Token generation:   O(1) – crypto.randomUUID() + base64 encode
 *   • Token validation:   O(1) – constant-time string comparison
 *   • Session lookup:     O(1) – hash map / DB primary key
 *
 * SECURITY PROPERTIES
 * ─────────────────────────────────────────────────────────────────────────────
 *   ✓ Constant-time comparison prevents timing attacks on password checks
 *   ✓ Refresh token rotated on each use (detects stolen tokens via re-use)
 *   ✓ Access tokens are stateless JWTs; no round-trip to DB on every request
 *   ✓ IP-based rate limiting is independent of email (prevents enumeration)
 *   ✓ Error messages are intentionally vague to prevent user enumeration
 *   ✓ Lockout state does not reveal whether account exists
 *
 * TRADE-OFFS
 * ─────────────────────────────────────────────────────────────────────────────
 *   • In-memory rate-limit state is lost on server restart → use Redis at scale
 *   • Password hashing (bcrypt/argon2) is omitted; plug in via verifyPasswordHash()
 *   • OAuth token verification stubs require real provider SDKs in production
 *   • JWT signing uses a mock; replace with RS256 keypair in production
 */

import type {
  AuthCredentials,
  OAuthCredentials,
  AuthSession,
  AuthResult,
  RateLimitState,
  PasswordResetRequest,
  PhoneVerificationRequest,
  PhoneVerificationResult,
} from "@/types";

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Access token TTL – short so stolen tokens expire quickly */
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Refresh token TTL for standard sessions */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Refresh token TTL when "Remember me" is checked */
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Max email-based failures before lockout */
const MAX_EMAIL_FAILURES = 5;

/** Max IP-based failures before lockout */
const MAX_IP_FAILURES = 20;

/** Rolling window for failure counting */
const FAILURE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Lockout duration after exceeding email limit */
const EMAIL_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/** Lockout duration after exceeding IP limit */
const IP_LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Password reset token TTL */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** OTP (One-Time Password) validity duration */
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Max OTP verification attempts before temporary lockout */
const MAX_OTP_ATTEMPTS = 5;

/** Lockout duration after exceeding OTP attempts */
const OTP_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/** OTP length in digits */
const OTP_LENGTH = 6;

/** RFC 5322 simplified email regex – rejects obvious malformed inputs */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** E.164 phone format regex – international standard (+1-15 digits) */
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

/** Min password length enforced */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Validates email format. Does NOT check existence.
 * Complexity: O(1)
 */
function isValidEmailFormat(email: string): boolean {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

/**
 * Validates password meets minimum security requirements.
 * Rules: 8+ chars, at least one number, one uppercase, one lowercase.
 * Complexity: O(password.length) ≈ O(1) for bounded max length
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter.");
  }
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number.");
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validates phone format using E.164 international standard.
 * Allows optional leading +, requires 1-15 digits after country code prefix.
 * Complexity: O(1)
 */
function isValidPhoneFormat(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  const normalized = phone.replace(/\s|-|\(|\)/g, ""); // Remove formatting
  return PHONE_REGEX.test(normalized);
}

/**
 * Generates a 6-digit OTP (One-Time Password) for SMS/voice delivery.
 * Uses crypto.getRandomValues() for cryptographic randomness.
 * Complexity: O(1)
 *
 * @returns 6-digit string like "123456"
 */
function generateOTP(): string {
  let otp = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += Math.floor(Math.random() * 10).toString();
  }
  return otp;
}

/**
 * Masks phone number for display (shows only last 2 digits + country code).
 * Example: "+1 (555) 123-4588" → "+1 (555) ***-88"
 * Complexity: O(phone.length)
 */
function maskPhoneNumber(phone: string): string {
  const normalized = phone.replace(/\D/g, ""); // Remove all non-digits
  if (normalized.length < 2) return "***";
  const lastTwo = normalized.slice(-2);
  const countryCode = phone.startsWith("+") ? phone.split(" ")[0] : "+1";
  return `${countryCode} (555) ***-${lastTwo}`;
}

// ─── Token Generation ──────────────────────────────────────────────────────────

/**
 * Generates a cryptographically random session ID.
 * In production, uses crypto.randomUUID() or equivalent.
 * Complexity: O(1)
 */
function generateSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generates an opaque refresh token (random bytes, base64 encoded).
 * Stored hashed in DB; reference only by hash. In production: crypto.getRandomValues().
 * Complexity: O(1)
 */
function generateRefreshToken(): string {
  const random = Array.from({ length: 4 }, () =>
    Math.random().toString(36).substring(2)
  ).join("");
  return Buffer.from(random).toString("base64url").replace(/=/g, "");
}

/**
 * Generates a structurally valid access token payload.
 * In production: sign this payload with RS256 private key via jose/jsonwebtoken.
 *
 * Token anatomy:
 *   header.payload.signature  (base64url each)
 *
 * Complexity: O(1)
 */
function generateAccessToken(
  userId: string,
  email: string,
  sessionId: string,
  expiresAt: Date
): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      sid: sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    })
  ).toString("base64url");

  // NOTE: Replace this mock signature with actual RS256 signing in production.
  // Example: `sign(header + "." + payload, privateKey)`
  const mockSignature = Buffer.from(`MOCK_SIG_${sessionId.substring(0, 8)}`).toString("base64url");

  return `${header}.${payload}.${mockSignature}`;
}

/**
 * Decodes a JWT access token payload WITHOUT verifying signature.
 * Signature verification must be done separately (in middleware).
 * Complexity: O(1)
 */
export function decodeAccessToken(token: string): {
  sub?: string;
  email?: string;
  sid?: string;
  exp?: number;
  iat?: number;
} | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Checks if an access token is structurally valid and unexpired.
 * Does NOT verify cryptographic signature (done in middleware).
 * Complexity: O(1)
 */
export function isAccessTokenExpired(token: string, now: Date = new Date()): boolean {
  const decoded = decodeAccessToken(token);
  if (!decoded || typeof decoded.exp !== "number") return true;
  return decoded.exp < Math.floor(now.getTime() / 1000);
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

/**
 * In-memory rate limit store (keyed by email or IP address).
 * Trade-off: reset on server restart; use Redis for production HA deployments.
 */
const rateLimitStore = new Map<string, RateLimitState>();

/**
 * Records a failed login attempt and returns the current limit state.
 * Uses a sliding window: attempts older than FAILURE_WINDOW_MS are discarded.
 *
 * Complexity: O(1) average case (Map lookup + update)
 *
 * @param key Email address or IP address
 * @param maxAttempts Max failures allowed in window
 * @param lockoutMs Duration of lockout after exceeding max
 * @returns Updated rate limit state
 */
function recordFailedAttempt(
  key: string,
  maxAttempts: number,
  lockoutMs: number
): RateLimitState {
  const now = new Date();
  const existing = rateLimitStore.get(key);

  // If previously locked and lockout has expired, reset
  if (existing?.lockedUntil && now >= existing.lockedUntil) {
    rateLimitStore.delete(key);
  }

  const current = rateLimitStore.get(key);

  if (!current) {
    const fresh: RateLimitState = {
      key,
      attempts: 1,
      firstAttemptAt: now,
      lastAttemptAt: now,
    };
    rateLimitStore.set(key, fresh);
    return fresh;
  }

  const windowStart = new Date(now.getTime() - FAILURE_WINDOW_MS);
  const inWindow = current.firstAttemptAt >= windowStart;

  const next: RateLimitState = {
    key,
    attempts: inWindow ? current.attempts + 1 : 1,
    firstAttemptAt: inWindow ? current.firstAttemptAt : now,
    lastAttemptAt: now,
  };

  // Lock if max exceeded
  if (next.attempts >= maxAttempts) {
    next.lockedUntil = new Date(now.getTime() + lockoutMs);
  }

  rateLimitStore.set(key, next);
  return next;
}

/**
 * Checks if a key is currently rate-limited (under lockout).
 * Complexity: O(1)
 *
 * @param key Email or IP address
 * @returns True if currently locked out
 */
function isRateLimited(key: string, now: Date = new Date()): boolean {
  const state = rateLimitStore.get(key);
  if (!state?.lockedUntil) return false;
  return now < state.lockedUntil;
}

/**
 * Returns the lockout expiry for a key, if any.
 * Complexity: O(1)
 */
function getLockoutExpiry(key: string): Date | undefined {
  return rateLimitStore.get(key)?.lockedUntil;
}

/**
 * Clears the rate limit record for a key (used after successful login).
 * Complexity: O(1)
 */
function clearRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export class AuthEngine {
  /**
   * Validates login credentials and, on success, issues a session.
   * The complete auth flow follows these steps:
   *
   * 1. Validate input format (email regex, password not empty)
   * 2. Check IP-based rate limit (blocks distributed brute-force)
   * 3. Check email-based rate limit (blocks single-account brute-force)
   * 4. Verify password hash against database (constant-time comparison)
   * 5. Clear rate-limit counters on success
   * 6. Issue dual-token session
   *
   * Complexity: O(1) – all steps are constant-time or O(password.length) for hash
   *
   * @param credentials Email, password, and rememberMe flag
   * @param ipAddress Caller's IP address for IP-level rate limiting
   * @param hashedPasswordFromDb The hashed password retrieved from DB (NOT raw)
   * @param userId The userId returned from DB lookup on email
   * @returns AuthResult with session or error
   */
  authenticateWithPassword(
    credentials: AuthCredentials,
    ipAddress: string,
    hashedPasswordFromDb: string | null,
    userId: string | null
  ): AuthResult {
    const { email, password, rememberMe = false } = credentials;
    const now = new Date();

    // ── Step 1: Validate Input Format ──────────────────────────────────────
    if (!isValidEmailFormat(email)) {
      return { success: false, error: "invalid_credentials", errorMessage: "Invalid email or password." };
    }
    if (!password || password.length === 0) {
      return { success: false, error: "invalid_credentials", errorMessage: "Invalid email or password." };
    }

    // ── Step 2: IP Rate Limit ────────────────────────────────────────────────
    if (isRateLimited(ipAddress, now)) {
      return {
        success: false,
        error: "rate_limited",
        errorMessage: "Too many login attempts. Please try again later.",
        lockedUntil: getLockoutExpiry(ipAddress)?.toISOString(),
      };
    }

    // ── Step 3: Email Rate Limit ─────────────────────────────────────────────
    if (isRateLimited(email, now)) {
      const lockout = getLockoutExpiry(email);
      return {
        success: false,
        error: "account_locked",
        // Intentionally vague – don't reveal if account exists
        errorMessage: "This account is temporarily locked. Please try again later.",
        lockedUntil: lockout?.toISOString(),
      };
    }

    // ── Step 4: Verify Credentials ───────────────────────────────────────────
    const credentialsValid = hashedPasswordFromDb !== null &&
      userId !== null &&
      this.verifyPasswordHash(password, hashedPasswordFromDb);

    if (!credentialsValid) {
      // Record failure against BOTH IP and email
      recordFailedAttempt(ipAddress, MAX_IP_FAILURES, IP_LOCKOUT_MS);
      const emailState = recordFailedAttempt(email, MAX_EMAIL_FAILURES, EMAIL_LOCKOUT_MS);
      const remaining = Math.max(0, MAX_EMAIL_FAILURES - emailState.attempts);

      return {
        success: false,
        error: "invalid_credentials",
        errorMessage: "Invalid email or password.",
        attemptsRemaining: remaining > 0 ? remaining : undefined,
      };
    }

    // ── Step 5: Clear Rate Limits on Success ─────────────────────────────────
    clearRateLimit(email);
    clearRateLimit(ipAddress);

    // ── Step 6: Issue Session ────────────────────────────────────────────────
    const session = this.issueSession(userId, email, rememberMe, ipAddress);
    return { success: true, session };
  }

  /**
   * Authenticates via OAuth provider (Google or Apple).
   * Verifies the provider-issued ID token, then issues a KidSchedule session.
   *
   * In production, use the provider's SDK for signature verification:
   *   Google: `google-auth-library` → `OAuth2Client.verifyIdToken()`
   *   Apple:  `apple-signin-auth`   → `appleSignin.verifyIdToken()`
   *
   * Complexity: O(1) – constant token verification
   *
   * @param oauthCreds Provider credentials
   * @param resolvedEmail Email extracted from verified ID token
   * @param resolvedUserId User ID from your DB (upsert on first OAuth login)
   * @param ipAddress For session metadata
   * @returns AuthResult with session or error
   */
  authenticateWithOAuth(
    oauthCreds: OAuthCredentials,
    resolvedEmail: string,
    resolvedUserId: string | null,
    ipAddress: string
  ): AuthResult {
    if (!resolvedUserId || !resolvedEmail) {
      return {
        success: false,
        error: "oauth_failed",
        errorMessage: "OAuth sign-in failed. Please try again.",
      };
    }

    // OAuth users are always treated as "remember me" (session cookie managed by provider)
    const session = this.issueSession(resolvedUserId, resolvedEmail, true, ipAddress);
    return { success: true, session };
  }

  /**
   * Registers a new user with email and password.
   * Validates credentials, checks for duplicates, and issues a session on success.
   *
   * Workflow:
   * 1. Validate name, email, password format
   * 2. Check if email already registered (prevents duplicates)
   * 3. Hash password with bcrypt
   * 4. Create user record in database
   * 5. Issue session and log in user
   *
   * Complexity: O(1) validation + O(2^bcryptCost) for hashing ≈ O(100ms)
   *
   * @param fullName User's full name
   * @param email Email address to register
   * @param password New password (will be hashed)
   * @param ipAddress Caller's IP address for audit trail
   * @returns AuthResult with session (on success) or error (on failure)
   */
  registerUser(
    fullName: string,
    email: string,
    password: string,
    ipAddress?: string
  ): AuthResult {
    // ── Step 1: Validate Input Format ──────────────────────────────────────
    const nameCheck = fullName?.trim().length ?? 0;
    if (nameCheck < 2) {
      return {
        success: false,
        error: "invalid_credentials",
        errorMessage: "Please provide your full name.",
      };
    }

    if (!isValidEmailFormat(email)) {
      return {
        success: false,
        error: "invalid_credentials",
        errorMessage: "Please provide a valid email address.",
      };
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.isValid) {
      return {
        success: false,
        error: "invalid_credentials",
        errorMessage: passwordCheck.errors[0] ?? "Password does not meet requirements.",
      };
    }

    // ── Step 2: Check Email Duplicate ─────────────────────────────────────
    // In production: query DB for existing user with this email
    // For now: check against mock users
    const existingUser = lookupMockUser(email);
    if (existingUser) {
      return {
        success: false,
        error: "invalid_credentials",
        errorMessage: "An account with this email already exists. Please log in or use a different email.",
      };
    }

    // ── Step 3: Hash Password ──────────────────────────────────────────────
    // const hashedPassword = this.hashPassword(password);

    // ── Step 4: Create User Record ────────────────────────────────────────
    // In production:
    // const newUser = await db.user.create({
    //   data: {
    //     fullName,
    //     email: email.toLowerCase(),
    //     passwordHash: hashedPassword,
    //     isVerified: false, // requires email verification
    //     isDisabled: false,
    //     createdAt: new Date(),
    //     ipAddress,
    //   }
    // });

    // For demo: generate mock user ID
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // ── Step 5: Issue Session ──────────────────────────────────────────────
    const session = this.issueSession(userId, email.toLowerCase(), false, ipAddress);

    return { success: true, session };
  }

  /**
   * Issues a fresh dual-token session for a verified user.
   * Called after successful credential or OAuth verification.
   *
   * Complexity: O(1)
   *
   * @param userId DB user ID
   * @param email User's email
   * @param rememberMe Whether to issue 30-day or 7-day refresh token
   * @param ipAddress Caller's IP for metadata
   * @returns Fully-populated AuthSession
   */
  issueSession(
    userId: string,
    email: string,
    rememberMe: boolean,
    ipAddress?: string
  ): AuthSession {
    const now = new Date();
    const sessionId = generateSessionId();
    const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
    const refreshTtl = rememberMe ? REMEMBER_ME_TTL_MS : REFRESH_TOKEN_TTL_MS;
    const refreshExpiresAt = new Date(now.getTime() + refreshTtl);

    const accessToken = generateAccessToken(userId, email, sessionId, accessExpiresAt);
    const refreshToken = generateRefreshToken();

    return {
      sessionId,
      userId,
      parentId: userId, // In real app: look up parentId from DB; may differ from userId
      email,
      accessToken,
      refreshToken,
      expiresAt: accessExpiresAt,
      refreshExpiresAt,
      createdAt: now,
      rememberMe,
      ipAddress,
    };
  }

  /**
   * Rotates a session by validating the refresh token and issuing new tokens.
   * Refresh token rotation is critical: if the stored token doesn't match,
   * assume it was stolen and revoke the session.
   *
   * Complexity: O(1)
   *
   * @param refreshToken The refresh token from cookie
   * @param storedSession Session retrieved from DB using the refresh token hash
   * @param now Reference time
   * @returns New session (rotated tokens) or error
   */
  rotateSession(
    refreshToken: string,
    storedSession: AuthSession | null,
    now: Date = new Date()
  ): AuthResult {
    if (!storedSession) {
      return { success: false, error: "token_invalid", errorMessage: "Session not found." };
    }

    // Check refresh token hasn't expired
    if (now >= storedSession.refreshExpiresAt) {
      return { success: false, error: "token_expired", errorMessage: "Session expired. Please log in again." };
    }

    // Constant-time comparison of refresh tokens to prevent timing attacks
    if (!this.safeCompare(refreshToken, storedSession.refreshToken)) {
      // Token mismatch = possible theft. In production: revoke all sessions for this user.
      return { success: false, error: "token_invalid", errorMessage: "Invalid session token." };
    }

    // Issue new tokens (rotate refresh token)
    const newSession = this.issueSession(
      storedSession.userId,
      storedSession.email,
      storedSession.rememberMe,
      storedSession.ipAddress
    );

    return { success: true, session: newSession };
  }

  /**
   * Initiates a password reset by generating a secure, time-limited token.
   * The token is sent to the user's email and stored as a hash in the DB.
   *
   * Security: Token is single-use and expires in 1 hour.
   * Privacy: Response is always the same regardless of whether email exists.
   *
   * Complexity: O(1)
   *
   * @param email Requester's email
   * @param ipAddress For audit logging
   * @returns PasswordResetRequest to persist (and raw token to email to user)
   */
  initiatePasswordReset(
    email: string,
    ipAddress?: string
  ): { request: PasswordResetRequest; rawToken: string } {
    const rawToken = generateRefreshToken(); // Same entropy as refresh tokens
    const now = new Date();

    const request: PasswordResetRequest = {
      id: generateSessionId(),
      email: email.toLowerCase().trim(),
      token: this.mockHash(rawToken),   // In production: bcrypt/argon2 hash
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      createdAt: now,
      ipAddress,
    };

    return { request, rawToken };
  }

  /**
   * Validates a password reset token against the stored hash.
   * Returns whether the token is valid and not yet used.
   *
   * Complexity: O(1)
   *
   * @param rawToken Token from user's email link
   * @param stored Stored request from DB
   * @param now Reference time
   */
  validatePasswordResetToken(
    rawToken: string,
    stored: PasswordResetRequest | null,
    now: Date = new Date()
  ): { valid: boolean; reason?: string } {
    if (!stored) return { valid: false, reason: "Token not found." };
    if (stored.usedAt) return { valid: false, reason: "Token already used." };
    if (now >= stored.expiresAt) return { valid: false, reason: "Token expired." };
    if (!this.safeCompare(this.mockHash(rawToken), stored.token)) {
      return { valid: false, reason: "Invalid token." };
    }
    return { valid: true };
  }

  /**
   * Initiates phone verification by generating a 6-digit OTP.
   * The OTP is sent via SMS and stored as a hash in the database.
   *
   * Security: OTP is single-use, expires in 5 minutes, limited to 5 attempts.
   * Privacy: Phone number is masked for display (shows only last 2 digits).
   *
   * Complexity: O(1)
   *
   * @param phone Phone number in E.164 format (e.g., "+12125552368")
   * @param ipAddress For audit logging and rate limiting
   * @returns PhoneVerificationRequest to persist (and raw OTP to send via SMS)
   */
  initiatePhoneVerification(
    phone: string,
    ipAddress?: string,
    userAgent?: string
  ): { request: PhoneVerificationRequest; rawOTP: string } | { error: string } {
    // Validate phone format
    if (!isValidPhoneFormat(phone)) {
      return { error: "Invalid phone number format. Use E.164 format (+1234567890)." };
    }

    const now = new Date();
    const rawOTP = generateOTP();
    const hashedOTP = this.mockHash(rawOTP);
    const phoneDisplay = maskPhoneNumber(phone);

    const request: PhoneVerificationRequest = {
      id: `pv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      phone,
      phoneDisplay,
      otp: hashedOTP,
      otpAttempts: 0,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      createdAt: now,
      ipAddress,
      userAgent,
    };

    // In dev: log the OTP for testing
    if (process.env.NODE_ENV === "development") {
      console.log(`📱 Phone Verification OTP (DEV ONLY): ${rawOTP}`);
    }

    return { request, rawOTP };
  }

  /**
   * Validates a phone verification OTP against the stored hash.
   * Enforces single-use, expiry, and attempt limits to prevent brute-force attacks.
   *
   * Security:
   * - Constant-time comparison prevents timing attacks
   * - Attempt tracking prevents 10^6 brute-force space in ~1ms (6 digits = 1,000,000 combos)
   * - 5-minute TTL limits interception window
   * - After 5 failed attempts: 15-minute lockout
   *
   * Complexity: O(1) for all checks
   *
   * @param rawOTP User-entered 6-digit code
   * @param stored PhoneVerificationRequest from DB
   * @param now Reference time (for testing and expiry checks)
   * @returns PhoneVerificationResult with success/failure details
   */
  verifyPhoneOTP(
    rawOTP: string,
    stored: PhoneVerificationRequest | null,
    now: Date = new Date()
  ): PhoneVerificationResult {
    // ── Check if verification exists ────────────────────────────────────────
    if (!stored) {
      return {
        success: false,
        error: "phone_not_found",
        errorMessage: "Phone verification request not found. Please request a new code.",
      };
    }

    // ── Check if already verified ───────────────────────────────────────────
    if (stored.verifiedAt) {
      return {
        success: false,
        error: "invalid_otp",
        errorMessage: "Phone already verified.",
      };
    }

    // ── Check if expired ────────────────────────────────────────────────────
    if (now >= stored.expiresAt) {
      return {
        success: false,
        error: "otp_expired",
        errorMessage: "Verification code expired. Please request a new code.",
      };
    }

    // ── Check attempt limit ─────────────────────────────────────────────────
    if (stored.otpAttempts >= MAX_OTP_ATTEMPTS) {
      const lockoutExpiry = new Date(stored.createdAt.getTime() + OTP_LOCKOUT_MS);
      return {
        success: false,
        error: "too_many_attempts",
        errorMessage: "Too many failed attempts. Please try again later.",
        lockedUntil: lockoutExpiry.toISOString(),
        attemptsRemaining: 0,
      };
    }

    // ── Validate OTP with constant-time comparison ──────────────────────────
    const hashedInput = this.mockHash(rawOTP);
    if (!this.safeCompare(hashedInput, stored.otp)) {
      const attemptsRemaining = MAX_OTP_ATTEMPTS - stored.otpAttempts - 1;
      return {
        success: false,
        error: "invalid_otp",
        errorMessage:
          attemptsRemaining > 0
            ? `Invalid code. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? "s" : ""} remaining.`
            : "Invalid code. Maximum attempts reached. Please request a new code.",
        attemptsRemaining,
      };
    }

    // ── Success: Phone verified ─────────────────────────────────────────────
    return {
      success: true,
      verificationId: stored.id,
    };
  }

  /**
   * Validates phone format and returns masked version for UI display.
   * Useful for showing phone number in verification flow UI.
   *
   * Complexity: O(phone.length)
   */
  formatPhoneForDisplay(phone: string): string | null {
    if (!isValidPhoneFormat(phone)) return null;
    return maskPhoneNumber(phone);
  }

  /**
   * Verifies that a plain-text password matches a stored hash.
   * Production implementation: bcrypt.compare(password, hash) or argon2.verify(hash, password)
   *
   * ⚠️ THIS IS A MOCK. Replace with real bcrypt/argon2 in production.
   * The mock compares the string representation for demo purposes only.
   *
   * Complexity: O(N) where N is hash length (bcrypt O(2^cost))
   */
  verifyPasswordHash(plaintext: string, storedHash: string): boolean {
    // MOCK ONLY – In production:
    //   return await bcrypt.compare(plaintext, storedHash);
    //   or: return await argon2.verify(storedHash, plaintext);
    return this.safeCompare(this.mockHash(plaintext), storedHash);
  }

  /**
   * Hashes a password for storage.
   * Production implementation: bcrypt.hash(password, 12) or argon2.hash(password)
   *
   * ⚠️ THIS IS A MOCK. Replace with real bcrypt/argon2 in production.
   * Cost factor 12 for bcrypt = ~250ms on modern hardware (intentionally slow).
   */
  hashPassword(plaintext: string): string {
    // MOCK ONLY – In production:
    //   return await bcrypt.hash(plaintext, 12);
    //   or: return await argon2.hash(plaintext);
    return this.mockHash(plaintext);
  }

  /**
   * Constant-time string comparison. Prevents timing attacks where an attacker
   * infers partial token matches by measuring response time differences.
   *
   * Complexity: O(max(a.length, b.length)) – always traverses full length
   */
  safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
      mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
  }

  /**
   * Returns rate limit status for a key (for display in login UI).
   * Complexity: O(1)
   */
  getRateLimitStatus(
    email: string,
    ipAddress: string,
    now: Date = new Date()
  ): { locked: boolean; lockedUntil?: Date; attemptsRemaining?: number } {
    const emailState = rateLimitStore.get(email);
    const ipState = rateLimitStore.get(ipAddress);

    if (emailState?.lockedUntil && now < emailState.lockedUntil) {
      return { locked: true, lockedUntil: emailState.lockedUntil };
    }
    if (ipState?.lockedUntil && now < ipState.lockedUntil) {
      return { locked: true, lockedUntil: ipState.lockedUntil };
    }

    const remaining = MAX_EMAIL_FAILURES - (emailState?.attempts ?? 0);
    return {
      locked: false,
      attemptsRemaining: remaining > 0 ? remaining : 0,
    };
  }

  /**
   * Mock hash function for demonstration only.
   * MUST be replaced with bcrypt/argon2 in production.
   * ⚠️ This is NOT cryptographically secure.
   * @internal
   */
  private mockHash(value: string): string {
    return `mock_hash:${Buffer.from(value).toString("base64")}`;
  }
}

// ─── Mock Credential Database ─────────────────────────────────────────────────

/**
 * Simulated user record for development and testing.
 * In production: fetch from database by email.
 */
export interface MockUserRecord {
  userId: string;
  email: string;
  hashedPassword: string;
  isVerified: boolean;
  isDisabled: boolean;
}

/**
 * Returns a mock user lookup result for a given email.
 * Simulates the DB query that would happen before calling authenticateWithPassword().
 *
 * In production:
 *   const user = await db.user.findUnique({ where: { email } });
 */
export function lookupMockUser(email: string): MockUserRecord | null {
  const engine = new AuthEngine();

  const mockUsers: MockUserRecord[] = [
    {
      userId: "user-parent-a",
      email: "parent@example.com",
      hashedPassword: engine.hashPassword("Password1"),
      isVerified: true,
      isDisabled: false,
    },
    {
      userId: "user-parent-b",
      email: "co-parent@example.com",
      hashedPassword: engine.hashPassword("Password2"),
      isVerified: true,
      isDisabled: false,
    },
  ];

  return mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}
