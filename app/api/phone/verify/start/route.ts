/**
 * POST /api/phone/verify/start
 * 
 * Initiates phone verification by sending an OTP via Twilio Verify.
 * Requires authentication.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib";
import { startPhoneVerification, isValidE164Phone } from "@/lib/providers/sms/twilio-verify";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

interface VerifyStartBody {
  to?: string;
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
        route: "/api/phone/verify/start",
        method: "POST",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    const body: VerifyStartBody = await request.json();
    const { to } = body;

    // Validate phone number
    if (!to || typeof to !== "string") {
      const response = NextResponse.json(
        { error: "missing_phone", message: "Phone number is required" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/phone/verify/start",
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
        route: "/api/phone/verify/start",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Start verification
    const result = await startPhoneVerification(to);

    if (!result.success) {
      const statusCode = result.errorCode === "RATE_LIMITED" ? 429 : 400;

      logEvent("info", "Phone verification start failed", {
        requestId,
        userId: user.userId,
        error: result.error,
      });

      const response = NextResponse.json(
        {
          error: result.errorCode?.toLowerCase() ?? "verification_failed",
          message: result.error,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        { status: statusCode }
      );
      observeApiRequest({
        route: "/api/phone/verify/start",
        method: "POST",
        status: statusCode,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    logEvent("info", "Phone verification started", {
      requestId,
      userId: user.userId,
      status: result.status,
    });

    const response = NextResponse.json(
      { success: true, status: result.status },
      { status: 200 }
    );
    observeApiRequest({
      route: "/api/phone/verify/start",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logEvent("error", "Phone verification start endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    const response = NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
    observeApiRequest({
      route: "/api/phone/verify/start",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}
