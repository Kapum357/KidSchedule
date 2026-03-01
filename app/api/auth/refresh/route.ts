/**
 * POST /api/auth/refresh
 * 
 * Refreshes the access token using the refresh token.
 * Implements token rotation - old refresh token is invalidated.
 */

import { NextResponse } from "next/server";
import { refreshSession } from "@/lib";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    // The refresh token is read from HttpOnly cookies by refreshSession
    const success = await refreshSession();

    if (!success) {
      logEvent("info", "Token refresh failed - invalid or expired refresh token", {
        requestId,
      });

      const response = NextResponse.json(
        { error: "invalid_refresh_token", message: "Refresh token is invalid or expired" },
        { status: 401 }
      );
      observeApiRequest({
        route: "/api/auth/refresh",
        method: "POST",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Success - new tokens are set as HttpOnly cookies by refreshSession
    logEvent("info", "Token refresh successful", { requestId });

    const response = NextResponse.json(
      { success: true },
      { status: 200 }
    );
    observeApiRequest({
      route: "/api/auth/refresh",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logEvent("error", "Token refresh endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    const response = NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
    observeApiRequest({
      route: "/api/auth/refresh",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}
