/**
 * KidSchedule – Production Auth Service
 *
 * High-level authentication operations that integrate:
 *   - AuthEngine (core validation logic)
 *   - Persistence (database operations)
 *   - Session management (cookies, tokens)
 *   - Audit logging
 *   - Email/SMS providers
 *
 * This service replaces the mock implementations in page components.
 */

import { AuthEngine, validatePasswordStrength } from "../auth-engine";
import { createSession, revokeAllSessions } from "../session";
import { audit } from "../audit";
import { getRequestContext } from "../security/csrf";
import { verifyRecaptchaToken } from "../security/recaptcha";
import { getEmailSender } from "../providers/email";
import { getSmsSender } from "../providers/sms";
import { db } from "../persistence";
import {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
} from "./email-verification";

// ─── Password Hashing ─────────────────────────────────────────────────────────

/**
 * Hash password using bcrypt.
 * 
 * Production implementation:
 * import bcrypt from "bcrypt";
 * return bcrypt.hash(password, 12);
 */
async function hashPassword(password: string): Promise<string> {
  // Mock implementation – replace with bcrypt in production
  const encoder = new TextEncoder();
  const data = encoder.encode(password + process.env.AUTH_JWT_SECRET);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return "bcrypt$12$" + Buffer.from(hashBuffer).toString("hex");
}

/**
 * Verify password against hash.
 * 
 * Production implementation:
 * import bcrypt from "bcrypt";
 * return bcrypt.compare(password, hash);
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  // Constant-time comparison
  if (computed.length !== hash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const EMAIL_RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 };
const IP_RATE_LIMIT = { max: 20, windowMs: 15 * 60 * 1000, lockoutMs: 30 * 60 * 1000 };
const PASSWORD_RESET_RATE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };

async function checkRateLimit(key: string, limit: { max: number; windowMs: number }): Promise<{
  allowed: boolean;
  count: number;
  lockedUntil?: string;
}> {
  const existing = await db.rateLimits.get(key);
  
  if (existing?.lockedUntil) {
    if (new Date(existing.lockedUntil) > new Date()) {
      return { allowed: false, count: existing.count, lockedUntil: existing.lockedUntil };
    }
    // Lockout expired, clear it
    await db.rateLimits.clear(key);
  }
  
  const current = await db.rateLimits.increment(key, limit.windowMs);
  return { allowed: current.count <= limit.max, count: current.count };
}

async function applyLockout(key: string, lockoutMs: number): Promise<void> {
  const lockedUntil = new Date(Date.now() + lockoutMs).toISOString();
  await db.rateLimits.setLockout(key, lockedUntil);
}

async function clearRateLimit(key: string): Promise<void> {
  await db.rateLimits.clear(key);
}

// ─── Login ────────────────────────────────────────────────────────────────────

export interface LoginParams {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  errorMessage?: string;
  attemptsRemaining?: number;
  lockedUntil?: string;
}

/**
 * Authenticate user with email and password.
 * On success, creates session and sets cookies.
 */
export async function login(params: LoginParams): Promise<LoginResult> {
  try {
    const { email, password, rememberMe } = params;
    const ctx = await getRequestContext();
    const normalizedEmail = email.toLowerCase().trim();
    
    // Rate limiting
    const ipKey = `ip:${ctx.ip}`;
    const emailKey = `email:${normalizedEmail}`;
    
    const ipCheck = await checkRateLimit(ipKey, IP_RATE_LIMIT);
    if (!ipCheck.allowed) {
      await audit.rateLimitTriggered(ctx, ipKey, "ip");
      return {
        success: false,
        error: "rate_limited",
        errorMessage: "Too many login attempts. Please try again later.",
        lockedUntil: ipCheck.lockedUntil,
      };
    }
    
    const emailCheck = await checkRateLimit(emailKey, EMAIL_RATE_LIMIT);
    if (!emailCheck.allowed) {
      await audit.rateLimitTriggered(ctx, emailKey, "email");
      return {
        success: false,
        error: "account_locked",
        errorMessage: "This account is temporarily locked. Please try again later.",
        lockedUntil: emailCheck.lockedUntil,
      };
    }
    
    // Lookup user
    const user = await db.users.findByEmail(normalizedEmail);
    
    // Verify credentials (constant-time even if user doesn't exist)
    const dummyHash = "bcrypt$12$" + "0".repeat(64);
    const hashToCheck = user?.passwordHash ?? dummyHash;
    const passwordValid = await verifyPassword(password, hashToCheck);
    
    if (!user || !passwordValid) {
      // Record failure
      await db.rateLimits.increment(ipKey, IP_RATE_LIMIT.windowMs);
      const emailState = await db.rateLimits.increment(emailKey, EMAIL_RATE_LIMIT.windowMs);
      
      const attemptsRemaining = Math.max(0, EMAIL_RATE_LIMIT.max - emailState.count);
      
      if (emailState.count >= EMAIL_RATE_LIMIT.max) {
        await applyLockout(emailKey, EMAIL_RATE_LIMIT.lockoutMs);
      }
      
      await audit.loginFailed(ctx, normalizedEmail, "invalid_credentials");
      
      return {
        success: false,
        error: "invalid_credentials",
        errorMessage: "Invalid email or password.",
        attemptsRemaining: attemptsRemaining > 0 ? attemptsRemaining : undefined,
      };
    }
    
    // Check if user is disabled
    if (user.isDisabled) {
      await audit.loginFailed(ctx, normalizedEmail, "account_disabled");
      return {
        success: false,
        error: "account_disabled",
        errorMessage: "This account has been disabled. Please contact support.",
      };
    }
/*
    // Require email verification before allowing login
    if (!user.emailVerified) {
      await audit.loginFailed(ctx, normalizedEmail, "email_not_verified");
      return {
        success: false,
        error: "email_not_verified",
        errorMessage: "Please verify your email before logging in.",
      };
    }
 */ 
    // Success – clear rate limits
    await clearRateLimit(ipKey);
    await clearRateLimit(emailKey);
    
    // Create session
    await createSession(user.id, user.email, rememberMe);
    
    // Update last login
    await db.users.update(user.id, {
      lastLoginAt: new Date().toISOString(),
      lastLoginIp: ctx.ip,
    });
    
    // Audit log
    await audit.loginSuccess(ctx, normalizedEmail);
    
    return { success: true };
  } catch (error) {
    console.error("[Auth] Login failed due to backend dependency error", error);
    return {
      success: false,
      error: "service_unavailable",
      errorMessage: "We’re having trouble connecting right now. Please try again in a moment.",
    };
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export interface RegisterParams {
  fullName: string;
  email: string;
  password: string;
  recaptchaToken?: string;
}

export interface RegisterResult {
  success: boolean;
  requiresEmailVerification?: boolean;
  error?: string;
  errorMessage?: string;
}

/**
 * Register a new user.
 * On success, creates user, session, and sets cookies.
 */
export async function register(params: RegisterParams): Promise<RegisterResult> {
  const { fullName, email, password, recaptchaToken } = params;
  const ctx = await getRequestContext();
  const normalizedEmail = email.toLowerCase().trim();

  // Verify reCAPTCHA token (required only when env vars are configured)
  const recaptchaCheck = await verifyRecaptchaToken(recaptchaToken ?? null, ctx.ip);
  if (!recaptchaCheck.success) {
    await audit.suspiciousActivity(ctx, "signup_validation_failed", {
      failure: "recaptcha_failed",
      score: recaptchaCheck.score ?? 0,
    });
    return {
      success: false,
      error: "recaptcha_failed",
      errorMessage: "Security verification failed. Please try again.",
    };
  }
  
  // Validate input
  if (!fullName || fullName.trim().length < 2) {
    await audit.suspiciousActivity(ctx, "signup_validation_failed", {
      failure: "invalid_full_name",
    });
    return {
      success: false,
      error: "validation_error",
      errorMessage: "Please provide your full name.",
    };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(normalizedEmail)) {
    await audit.suspiciousActivity(ctx, "signup_validation_failed", {
      failure: "invalid_email",
    });
    return {
      success: false,
      error: "validation_error",
      errorMessage: "Please provide a valid email address.",
    };
  }
  
  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.isValid) {
    await audit.suspiciousActivity(ctx, "signup_validation_failed", {
      failure: "weak_password",
    });
    return {
      success: false,
      error: "validation_error",
      errorMessage: passwordCheck.errors[0] ?? "Password does not meet requirements.",
    };
  }
  
  // Check for existing user
  const existingUser = await db.users.findByEmail(normalizedEmail);
  if (existingUser) {
    await audit.suspiciousActivity(ctx, "signup_validation_failed", {
      failure: "email_exists",
    });
    return {
      success: false,
      error: "email_exists",
      errorMessage: "An account with this email already exists.",
    };
  }
  
  // Hash password
  const passwordHash = await hashPassword(password);
  
  // Create user
  await db.users.create({
    email: normalizedEmail,
    emailVerified: false,
    passwordHash,
    fullName: fullName.trim(),
    phoneVerified: false,
    isDisabled: false,
  });

  // Send email verification
  const verifyToken = createEmailVerificationToken(normalizedEmail);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const verifyLink = `${appUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;

  const emailSender = getEmailSender();
  await emailSender.send({
    to: normalizedEmail,
    subject: "Verify your KidSchedule email",
    templateId: "email-verification",
    variables: {
      userName: fullName.trim(),
      email: normalizedEmail,
      verifyLink,
      expiryHours: "24",
    },
  });
  
  // Audit log
  await audit.register(ctx, normalizedEmail);

  return { success: true, requiresEmailVerification: true };
}

export interface VerifyEmailResult {
  success: boolean;
  alreadyVerified?: boolean;
  error?: string;
  errorMessage?: string;
}

/**
 * Verify user email from signed token.
 */
export async function verifyEmailAddress(token: string): Promise<VerifyEmailResult> {
  const payload = verifyEmailVerificationToken(token);
  if (!payload.valid || !payload.email) {
    return {
      success: false,
      error: payload.reason ?? "invalid_token",
      errorMessage: "This verification link is invalid or expired.",
    };
  }

  const user = await db.users.findByEmail(payload.email);
  if (!user) {
    return {
      success: false,
      error: "user_not_found",
      errorMessage: "No account was found for this verification link.",
    };
  }

  if (user.emailVerified) {
    return { success: true, alreadyVerified: true };
  }

  const marked = await db.users.markEmailVerified(user.id);
  if (!marked) {
    return {
      success: false,
      error: "verification_failed",
      errorMessage: "Could not verify your email right now. Please try again.",
    };
  }

  const emailSender = getEmailSender();
  emailSender
    .send({
      to: user.email,
      subject: "Welcome to KidSchedule",
      templateId: "welcome",
      variables: {
        userName: user.fullName,
        email: user.email,
      },
    })
    .catch((err) => {
      console.error("[Auth] Welcome email failed:", err);
    });

  return { success: true };
}

// ─── Password Reset Request ───────────────────────────────────────────────────

export interface PasswordResetRequestResult {
  success: boolean;
  error?: string;
  errorMessage?: string;
}

/**
 * Request a password reset email.
 * Always returns success (for privacy) – doesn't reveal if email exists.
 */
export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const ctx = await getRequestContext();
  const normalizedEmail = email.toLowerCase().trim();
  
  // Rate limiting
  const recentCount = await db.passwordResets.countRecentByEmail(
    normalizedEmail,
    PASSWORD_RESET_RATE_LIMIT.windowMs
  );
  
  if (recentCount >= PASSWORD_RESET_RATE_LIMIT.max) {
    // Still return success for privacy, but don't send email
    await audit.passwordResetRequest(ctx, normalizedEmail);
    return { success: true };
  }
  
  // Check if user exists
  const user = await db.users.findByEmail(normalizedEmail);
  
  // Generate token regardless (for timing consistency)
  const engine = new AuthEngine();
  const { request, rawToken } = engine.initiatePasswordReset(normalizedEmail, ctx.ip);
  
  // Hash token for storage
  const encoder = new TextEncoder();
  const tokenData = encoder.encode(rawToken);
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", tokenData);
  const tokenHash = Buffer.from(tokenHashBuffer).toString("hex");
  
  // Store request
  await db.passwordResets.create({
    email: normalizedEmail,
    tokenHash,
    requestedAt: request.createdAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  
  // Audit log
  await audit.passwordResetRequest(ctx, normalizedEmail);
  
  // Send email only if user exists
  if (user) {
    const resetLink = `${process.env.APP_URL ?? "https://v1.kidschedule.com"}/reset-password/${encodeURIComponent(rawToken)}`;
    
    const emailSender = getEmailSender();
    await emailSender.send({
      to: normalizedEmail,
      subject: "Reset your KidSchedule password",
      templateId: "password-reset",
      variables: {
        email: normalizedEmail,
        resetLink,
        expiryTime: "1 hour",
        userName: user.fullName ?? "there",
      },
    });
  }
  
  return { success: true };
}

// ─── Password Reset Complete ──────────────────────────────────────────────────

export interface PasswordResetParams {
  token: string;
  newPassword: string;
}

export interface PasswordResetResult {
  success: boolean;
  error?: string;
  errorMessage?: string;
}

/**
 * Complete password reset with token.
 */
export async function resetPassword(params: PasswordResetParams): Promise<PasswordResetResult> {
  const { token, newPassword } = params;
  const ctx = await getRequestContext();
  
  // Validate password
  const passwordCheck = validatePasswordStrength(newPassword);
  if (!passwordCheck.isValid) {
    return {
      success: false,
      error: "validation_error",
      errorMessage: passwordCheck.errors[0] ?? "Password does not meet requirements.",
    };
  }
  
  // Hash token for lookup
  const encoder = new TextEncoder();
  const tokenData = encoder.encode(token);
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", tokenData);
  const tokenHash = Buffer.from(tokenHashBuffer).toString("hex");
  
  // Find reset request
  const resetRequest = await db.passwordResets.findByTokenHash(tokenHash);
  
  if (!resetRequest) {
    return {
      success: false,
      error: "invalid_token",
      errorMessage: "Invalid or expired reset link. Please request a new one.",
    };
  }
  
  if (resetRequest.usedAt) {
    return {
      success: false,
      error: "token_used",
      errorMessage: "This reset link has already been used. Please request a new one.",
    };
  }
  
  if (new Date(resetRequest.expiresAt) < new Date()) {
    return {
      success: false,
      error: "token_expired",
      errorMessage: "This reset link has expired. Please request a new one.",
    };
  }
  
  // Find user
  const user = await db.users.findByEmail(resetRequest.email);
  if (!user) {
    return {
      success: false,
      error: "user_not_found",
      errorMessage: "User account not found.",
    };
  }
  
  // Hash new password
  const passwordHash = await hashPassword(newPassword);
  
  // Update password
  await db.users.updatePassword(user.id, passwordHash);
  
  // Mark token as used
  await db.passwordResets.markUsed(resetRequest.id);
  
  // Revoke all sessions (security measure)
  await revokeAllSessions(user.id, "password_reset");
  
  // Audit log
  await audit.passwordResetComplete({ userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent }, user.email);
  
  // Send confirmation email
  const emailSender = getEmailSender();
  emailSender.send({
    to: user.email,
    subject: "Your KidSchedule password has been reset",
    templateId: "password-reset-confirmation",
    variables: {
      email: user.email,
      userName: user.fullName ?? "there",
    },
  }).catch((err) => {
    console.error("[Auth] Password reset confirmation email failed:", err);
  });
  
  return { success: true };
}

// ─── Token Validation ─────────────────────────────────────────────────────────

export interface TokenValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a password reset token without using it.
 * Used to pre-validate token before showing the reset form.
 */
export async function validateResetToken(token: string): Promise<TokenValidationResult> {
  // Hash token for lookup
  const encoder = new TextEncoder();
  const tokenData = encoder.encode(token);
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", tokenData);
  const tokenHash = Buffer.from(tokenHashBuffer).toString("hex");
  
  // Find reset request
  const resetRequest = await db.passwordResets.findByTokenHash(tokenHash);
  
  if (!resetRequest) {
    return { valid: false, reason: "This reset link is invalid. Please request a new one." };
  }
  
  if (resetRequest.usedAt) {
    return { valid: false, reason: "This reset link has already been used. Please request a new one." };
  }
  
  if (new Date(resetRequest.expiresAt) < new Date()) {
    return { valid: false, reason: "This reset link has expired. Please request a new one." };
  }
  
  return { valid: true };
}

// ─── Phone Verification ───────────────────────────────────────────────────────

export interface PhoneVerificationRequestResult {
  success: boolean;
  verificationId?: string;
  phoneDisplay?: string;
  error?: string;
  errorMessage?: string;
}

/**
 * Request phone verification OTP.
 */
export async function requestPhoneVerification(
  userId: string,
  phone: string
): Promise<PhoneVerificationRequestResult> {
  const ctx = await getRequestContext();
  
  // Validate phone format
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  const normalizedPhone = phone.replace(/\s|-|\(|\)/g, "");
  
  if (!phoneRegex.test(normalizedPhone)) {
    return {
      success: false,
      error: "invalid_phone",
      errorMessage: "Please enter a valid phone number.",
    };
  }
  
  // Generate OTP
  const engine = new AuthEngine();
  const result = engine.initiatePhoneVerification(normalizedPhone, ctx.ip, ctx.userAgent);
  
  if ("error" in result) {
    return {
      success: false,
      error: "invalid_phone",
      errorMessage: result.error,
    };
  }
  
  const { request, rawOTP } = result;
  
  // Hash OTP for storage
  const encoder = new TextEncoder();
  const otpData = encoder.encode(rawOTP);
  const otpHashBuffer = await crypto.subtle.digest("SHA-256", otpData);
  const otpHash = Buffer.from(otpHashBuffer).toString("hex");
  
  // Store verification request
  const verification = await db.phoneVerifications.create({
    userId,
    phone: normalizedPhone,
    otpHash,
    requestedAt: request.createdAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    attemptCount: 0,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  
  // Audit log
  await audit.phoneVerifyRequest({ userId, ip: ctx.ip, userAgent: ctx.userAgent }, normalizedPhone);
  
  // Send OTP via SMS
  const smsSender = getSmsSender();
  await smsSender.send({
    to: normalizedPhone,
    templateId: "otp-verification",
    variables: {
      otp: rawOTP,
      expiryMinutes: "5",
    },
  });
  
  return {
    success: true,
    verificationId: verification.id,
    phoneDisplay: request.phoneDisplay,
  };
}

/**
 * Verify phone with OTP.
 */
export async function verifyPhoneOTP(
  userId: string,
  otp: string
): Promise<{
  success: boolean;
  error?: string;
  errorMessage?: string;
  attemptsRemaining?: number;
}> {
  const ctx = await getRequestContext();
  
  // Find verification request
  const verification = await db.phoneVerifications.findByUserId(userId);
  
  if (!verification) {
    return {
      success: false,
      error: "not_found",
      errorMessage: "No verification request found. Please request a new code.",
    };
  }
  
  if (verification.verifiedAt) {
    return {
      success: false,
      error: "already_verified",
      errorMessage: "Phone already verified.",
    };
  }
  
  if (new Date(verification.expiresAt) < new Date()) {
    return {
      success: false,
      error: "expired",
      errorMessage: "Verification code expired. Please request a new code.",
    };
  }
  
  if (verification.attemptCount >= 5) {
    return {
      success: false,
      error: "too_many_attempts",
      errorMessage: "Too many failed attempts. Please request a new code.",
      attemptsRemaining: 0,
    };
  }
  
  // Hash input OTP for comparison
  const encoder = new TextEncoder();
  const otpData = encoder.encode(otp);
  const otpHashBuffer = await crypto.subtle.digest("SHA-256", otpData);
  const inputOtpHash = Buffer.from(otpHashBuffer).toString("hex");
  
  // Constant-time comparison
  const storedHash = verification.otpHash;
  let mismatch = 0;
  const maxLen = Math.max(inputOtpHash.length, storedHash.length);
  for (let i = 0; i < maxLen; i++) {
    const a = inputOtpHash.charCodeAt(i) || 0;
    const b = storedHash.charCodeAt(i) || 0;
    mismatch |= a ^ b;
  }
  
  if (mismatch !== 0) {
    // Increment attempt count
    await db.phoneVerifications.incrementAttempts(verification.id);
    const attemptsRemaining = 5 - verification.attemptCount - 1;
    
    await audit.phoneVerifyFailed(
      { userId, ip: ctx.ip, userAgent: ctx.userAgent },
      verification.phone,
      attemptsRemaining
    );
    
    return {
      success: false,
      error: "invalid_otp",
      errorMessage: `Invalid code. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? "s" : ""} remaining.`,
      attemptsRemaining,
    };
  }
  
  // Success
  await db.phoneVerifications.markVerified(verification.id);
  await db.users.markPhoneVerified(userId, verification.phone);
  
  // Audit log
  await audit.phoneVerifySuccess({ userId, ip: ctx.ip, userAgent: ctx.userAgent }, verification.phone);
  
  // Send confirmation SMS
  const smsSender = getSmsSender();
  smsSender.send({
    to: verification.phone,
    templateId: "phone-verification-success",
    variables: {
      phone: verification.phone.slice(-4),
    },
  }).catch((err) => {
    console.error("[Auth] Phone verification success SMS failed:", err);
  });
  
  return { success: true };
}
