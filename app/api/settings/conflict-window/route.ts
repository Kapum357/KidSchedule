/**
 * GET /api/settings/conflict-window
 *
 * Returns the authenticated user's family conflict window setting.
 * Returns default value (120 minutes) if no setting exists.
 */

export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { observeApiRequest, observeApiException } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

interface ConflictWindowResponse {
  windowMins: number;
}

const DEFAULT_WINDOW_MINS = 120;

export async function GET(): Promise<NextResponse> {
  const requestId = randomUUID();
  const startedAt = Date.now();

  try {
    // Authenticate user
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      const response = NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
      observeApiRequest({
        route: "/api/settings/conflict-window",
        method: "GET",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Get user's family
    const family = await db.families.findByParentUserId(sessionUser.userId);
    if (!family) {
      const response = NextResponse.json(
        { error: "family_not_found", message: "No family found for user" },
        { status: 404 }
      );
      observeApiRequest({
        route: "/api/settings/conflict-window",
        method: "GET",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Get conflict window setting (or default if not set)
    const conflictWindow = await db.conflictWindows.findByFamilyId(family.id);
    const windowMins = conflictWindow?.windowMins ?? DEFAULT_WINDOW_MINS;

    const response = NextResponse.json(
      { windowMins } as ConflictWindowResponse,
      { status: 200 }
    );

    observeApiRequest({
      route: "/api/settings/conflict-window",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    observeApiException("/api/settings/conflict-window", "GET", error);

    logEvent("error", "Conflict window settings endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown",
    });

    const response = NextResponse.json(
      { error: "internal_server_error", message: "Failed to fetch conflict window" },
      { status: 500 }
    );

    observeApiRequest({
      route: "/api/settings/conflict-window",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return response;
  }
}
