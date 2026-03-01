/**
 * POST /api/auth/login
 * 
 * Authenticates user with email and password.
 * On success, returns access and refresh tokens.
 */

import { NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

interface LoginBody {
  email?: string;
  password?: string;
  rememberMe?: boolean;
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const body: LoginBody = await request.json();
    const { email, password, rememberMe } = body;

    // Validate required fields
    if (!email || typeof email !== "string") {
      const response = NextResponse.json(
        { error: "missing_email", message: "Email is required" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/auth/login",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    if (!password || typeof password !== "string") {
      const response = NextResponse.json(
        { error: "missing_password", message: "Password is required" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/auth/login",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Attempt login
    const result = await login({
      email,
      password,
      rememberMe: rememberMe ?? false,
    });

    if (!result.success) {
      const statusCode = result.error === "rate_limited" || result.error === "account_locked"
        ? 429
        : 401;

      logEvent("info", "Login failed", {
        requestId,
        email: email.replace(/(.{2}).*@/, "$1***@"),
        error: result.error,
      });

      const response = NextResponse.json(
        {
          error: result.error,
          message: result.errorMessage,
          attemptsRemaining: result.attemptsRemaining,
          lockedUntil: result.lockedUntil,
        },
        { status: statusCode }
      );
      observeApiRequest({
        route: "/api/auth/login",
        method: "POST",
        status: statusCode,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Success - tokens are set as HttpOnly cookies by the login function
    logEvent("info", "Login successful", {
      requestId,
      email: email.replace(/(.{2}).*@/, "$1***@"),
    });

    const response = NextResponse.json(
      { success: true },
      { status: 200 }
    );
    observeApiRequest({
      route: "/api/auth/login",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logEvent("error", "Login endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    const response = NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
    observeApiRequest({
      route: "/api/auth/login",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}
