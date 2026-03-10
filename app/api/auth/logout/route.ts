/**
 * POST /api/auth/logout
 * 
 * Ends the current session and revokes the refresh token.
 * Clears authentication cookies.
 */

import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    // endSession revokes the refresh token and clears cookies
    await endSession();

    logEvent("info", "Logout successful", { requestId });

    const response = new NextResponse(null, { status: 204 });
    observeApiRequest({
      route: "/api/auth/logout",
      method: "POST",
      status: 204,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logEvent("error", "Logout endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    const response = NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
    observeApiRequest({
      route: "/api/auth/logout",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}
