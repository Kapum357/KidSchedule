/**
 * KidSchedule – Twilio Verify Integration
 *
 * Phone number verification using Twilio Verify service.
 * Provides a secure way to verify phone numbers via SMS OTP.
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID - Twilio account SID
 *   TWILIO_AUTH_TOKEN - Twilio auth token
 *   TWILIO_VERIFY_SERVICE_SID - Twilio Verify service SID
 *
 * @see https://www.twilio.com/docs/verify/api
 */

import { logEvent } from "@/lib/observability/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerifyStartResult {
  success: boolean;
  status?: string;
  error?: string;
  errorCode?: string;
  retryAfterSeconds?: number;
}

export interface VerifyCheckResult {
  success: boolean;
  valid?: boolean;
  status?: string;
  error?: string;
  errorCode?: string;
}

type TwilioVerificationResponse = {
  sid?: string;
  status?: string;
  to?: string;
  channel?: string;
  valid?: boolean;
  code?: number;
  message?: string;
};

// ─── Rate Limiting ────────────────────────────────────────────────────────────

// In-memory rate limiting for verification requests
const verifyRateLimits = new Map<string, { count: number; windowStart: number }>();
const VERIFY_RATE_LIMIT_MAX = 5;
const VERIFY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkVerifyRateLimit(phone: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const key = `verify:${phone}`;
  const existing = verifyRateLimits.get(key);

  if (!existing || now - existing.windowStart >= VERIFY_RATE_LIMIT_WINDOW_MS) {
    verifyRateLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count >= VERIFY_RATE_LIMIT_MAX) {
    const retryAfterMs = VERIFY_RATE_LIMIT_WINDOW_MS - (now - existing.windowStart);
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  existing.count++;
  return { allowed: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVerifyEnabled(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_VERIFY_SERVICE_SID
  );
}

function getBasicAuth(): string {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID is not configured");
  }
  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN is not configured");
  }

  return Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

function getVerifyBaseUrl(): string {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID ?? "";
  return `https://verify.twilio.com/v2/Services/${serviceSid}`;
}

/**
 * Validate E.164 phone number format.
 * Returns true if valid, false otherwise.
 */
export function isValidE164Phone(phone: string): boolean {
  // E.164: + followed by 1-15 digits
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Mask phone number for logging (PII protection).
 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return "***";
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

// ─── Verification Start ───────────────────────────────────────────────────────

/**
 * Start phone verification by sending an OTP via SMS.
 *
 * @param to - Phone number in E.164 format (e.g., "+15551234567")
 * @returns Result indicating success or failure
 */
export async function startPhoneVerification(to: string): Promise<VerifyStartResult> {
  // Check if Twilio Verify is configured
  if (!isVerifyEnabled()) {
    logEvent("warn", "Twilio Verify not configured - using mock verification", {
      phone: maskPhone(to),
    });

    // Development fallback - log the mock OTP
    const mockOtp = "123456";
    console.log(`\n${"=".repeat(60)}`);
    console.log("📱 PHONE VERIFICATION (DEV MODE)");
    console.log("=".repeat(60));
    console.log(`Phone: ${maskPhone(to)}`);
    console.log(`OTP: ${mockOtp}`);
    console.log("=".repeat(60) + "\n");

    return { success: true, status: "pending" };
  }

  // Validate phone number
  if (!isValidE164Phone(to)) {
    return {
      success: false,
      error: "Invalid phone number format. Use E.164 format (e.g., +15551234567)",
      errorCode: "INVALID_PHONE_FORMAT",
    };
  }

  // Rate limiting
  const rateCheck = checkVerifyRateLimit(to);
  if (!rateCheck.allowed) {
    
    return {
      success: false,
      error: "Too many verification requests. Please try again later.",
      errorCode: "RATE_LIMITED",
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    };
  }

  const url = `${getVerifyBaseUrl()}/Verifications`;
  const formData = new URLSearchParams({
    To: to,
    Channel: "sms",
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${getBasicAuth()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data: TwilioVerificationResponse = await response.json();

    if (response.ok && data.status) {
      
      logEvent("info", "Phone verification started", {
        phone: maskPhone(to),
        status: data.status,
      });

      return { success: true, status: data.status };
    }

    // Handle Twilio errors
    const errorMessage = data.message ?? "Failed to send verification code";
    const errorCode = data.code?.toString() ?? "UNKNOWN_ERROR";

    
    logEvent("error", "Phone verification start failed", {
      phone: maskPhone(to),
      errorCode,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  } catch (error) {
    
    logEvent("error", "Phone verification start exception", {
      phone: maskPhone(to),
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return {
      success: false,
      error: "Failed to connect to verification service",
      errorCode: "SERVICE_UNAVAILABLE",
    };
  }
}

// ─── Verification Check ───────────────────────────────────────────────────────

/**
 * Check the OTP code for phone verification.
 *
 * @param to - Phone number in E.164 format
 * @param code - 6-digit OTP code
 * @returns Result indicating if the code was valid
 */
export async function checkPhoneVerification(
  to: string,
  code: string
): Promise<VerifyCheckResult> {
  // Check if Twilio Verify is configured
  if (!isVerifyEnabled()) {
    logEvent("warn", "Twilio Verify not configured - using mock verification", {
      phone: maskPhone(to),
    });

    // Development fallback - accept "123456"
    const isValid = code === "123456";
    return {
      success: true,
      valid: isValid,
      status: isValid ? "approved" : "pending",
    };
  }

  // Validate phone number
  if (!isValidE164Phone(to)) {
    return {
      success: false,
      error: "Invalid phone number format",
      errorCode: "INVALID_PHONE_FORMAT",
    };
  }

  // Validate code format (6 digits)
  if (!/^\d{6}$/.test(code)) {
    return {
      success: false,
      error: "Invalid verification code format",
      errorCode: "INVALID_CODE_FORMAT",
    };
  }

  const url = `${getVerifyBaseUrl()}/VerificationCheck`;
  const formData = new URLSearchParams({
    To: to,
    Code: code,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${getBasicAuth()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data: TwilioVerificationResponse = await response.json();

    if (response.ok) {
      const isApproved = data.status === "approved" || data.valid === true;

      if (isApproved) {
        
      } else {
        
      }

      logEvent("info", "Phone verification check completed", {
        phone: maskPhone(to),
        status: data.status,
        valid: isApproved,
      });

      return {
        success: true,
        valid: isApproved,
        status: data.status,
      };
    }

    // Handle Twilio errors
    const errorMessage = data.message ?? "Failed to verify code";
    const errorCode = data.code?.toString() ?? "UNKNOWN_ERROR";

    
    logEvent("error", "Phone verification check failed", {
      phone: maskPhone(to),
      errorCode,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  } catch (error) {
    
    logEvent("error", "Phone verification check exception", {
      phone: maskPhone(to),
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return {
      success: false,
      error: "Failed to connect to verification service",
      errorCode: "SERVICE_UNAVAILABLE",
    };
  }
}
