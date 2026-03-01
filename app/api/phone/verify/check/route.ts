/**
 * POST /api/phone/verify/check
 * 
 * Checks the OTP code for phone verification via Twilio Verify.
 * On success, marks the phone as verified for the user.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib";
import { checkPhoneVerification, isValidE164Phone } from "@/lib/providers/sms/twilio-verify";
import { db } from "@/lib/persistence";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

interface VerifyCheckBody {
  to?: string;
  code?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    // Require authentication
    const user = await getCurrentUser();
    if (!user) {
      const response = NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
      observeApiRequest({
        route: "/api/phone/verify/check",
        method: "POST",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    const body: VerifyCheckBody = await request.json();
    const { to, code } = body;

    // Validate inputs
    if (!to || typeof to !== "string") {
      const response = NextResponse.json(
        { error: "missing_phone", message: "Phone number is required" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/phone/verify/check",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    if (!code || typeof code !== "string") {
      const response = NextResponse.json(
        { error: "missing_code", message: "Verification code is required" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/phone/verify/check",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    if (!isValidE164Phone(to)) {
      const response = NextResponse.json(
        {
          error: "invalid_phone_format",
          message: "Phone number must be in E.164 format (e.g., +15551234567)",
        },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/phone/verify/check",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    if (!/^\d{6}$/.test(code)) {
      const response = NextResponse.json(
        { error: "invalid_code_format", message: "Verification code must be 6 digits" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/phone/verify/check",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Check verification
    const result = await checkPhoneVerification(to, code);

    if (!result.success) {
      logEvent("info", "Phone verification check failed", {
        requestId,
        userId: user.userId,
        error: result.error,
      });

      const response = NextResponse.json(
        {
          error: result.errorCode?.toLowerCase() ?? "verification_failed",
          message: result.error,
        },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/phone/verify/check",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    if (!result.valid) {
      logEvent("info", "Phone verification code invalid", {
        requestId,
        userId: user.userId,
      });

      const response = NextResponse.json(
        { error: "invalid_code", message: "The verification code is incorrect" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/phone/verify/check",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Mark phone as verified for the user
    await db.users.markPhoneVerified(user.userId, to);

    logEvent("info", "Phone verification successful", {
      requestId,
      userId: user.userId,
    });

    const response = NextResponse.json(
      { success: true, valid: true, status: result.status },
      { status: 200 }
    );
    observeApiRequest({
      route: "/api/phone/verify/check",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logEvent("error", "Phone verification check endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    const response = NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
    observeApiRequest({
      route: "/api/phone/verify/check",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}
