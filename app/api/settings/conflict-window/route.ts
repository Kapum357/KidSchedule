/**
 * GET /api/settings/conflict-window
 * PUT /api/settings/conflict-window
 *
 * GET: Returns the authenticated user's family conflict window setting.
 *      Returns default value (120 minutes) if no setting exists.
 *
 * PUT: Updates the authenticated user's family conflict window setting.
 *      Request body: { windowMins: number }
 *      Response: { windowMins: number } (clamped to [0, 720])
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { SettingsEngine } from "@/lib/settings-engine";
import { observeApiRequest, observeApiException } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

interface ConflictWindowResponse {
  windowMins: number;
}

const DEFAULT_WINDOW_MINS = 120;

const ConflictWindowRequestSchema = z.object({
  windowMins: z.number().int().min(0).max(720),
});

type ConflictWindowRequest = z.infer<typeof ConflictWindowRequestSchema>;

type AuthResult =
  | {
      error: "unauthorized" | "family_not_found";
      status: 401 | 404;
    }
  | {
      sessionUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
      family: NonNullable<Awaited<ReturnType<typeof db.families.findByParentUserId>>>;
    };

/**
 * Shared authentication and family lookup logic for conflict window endpoints.
 * Returns { sessionUser, family } on success or { error, status } on failure.
 */
async function authAndLoadFamily(): Promise<AuthResult> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return { error: "unauthorized", status: 401 };
  }
  const family = await db.families.findByParentUserId(sessionUser.userId);
  if (!family) {
    return { error: "family_not_found", status: 404 };
  }
  return { sessionUser, family };
}

export async function GET(): Promise<NextResponse> {
  const requestId = randomUUID();
  const startedAt = Date.now();

  try {
    const authResult = await authAndLoadFamily();
    if ("error" in authResult) {
      const body = {
        error: authResult.error,
        message:
          authResult.error === "unauthorized"
            ? "Authentication required"
            : "No family found for user",
      };
      const response = NextResponse.json(body, { status: authResult.status });

      observeApiRequest({
        route: "/api/settings/conflict-window",
        method: "GET",
        status: authResult.status,
        durationMs: Date.now() - startedAt,
        requestId,
      });
      return response;
    }

    const { family } = authResult;
    const conflictWindow = await db.conflictWindows.findByFamilyId(family.id);
    const windowMins = conflictWindow?.windowMins ?? DEFAULT_WINDOW_MINS;

    observeApiRequest({
      route: "/api/settings/conflict-window",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
      requestId,
    });

    logEvent("info", "GET /api/settings/conflict-window", {
      familyId: family.id,
      windowMins,
    });

    return NextResponse.json({ windowMins } as ConflictWindowResponse, {
      status: 200,
    });
  } catch (error) {
    observeApiException("/api/settings/conflict-window", "GET", error);

    logEvent("error", "Conflict window settings endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown",
    });

    const response = NextResponse.json(
      {
        error: "internal_server_error",
        message: "Failed to retrieve conflict window setting",
      },
      { status: 500 }
    );

    observeApiRequest({
      route: "/api/settings/conflict-window",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
      requestId,
    });

    return response;
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  const startedAt = Date.now();

  try {
    const authResult = await authAndLoadFamily();
    if ("error" in authResult) {
      const body = {
        error: authResult.error,
        message:
          authResult.error === "unauthorized"
            ? "Authentication required"
            : "No family found for user",
      };
      const response = NextResponse.json(body, { status: authResult.status });

      observeApiRequest({
        route: "/api/settings/conflict-window",
        method: "PUT",
        status: authResult.status,
        durationMs: Date.now() - startedAt,
        requestId,
      });
      return response;
    }

    const { family } = authResult;

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const response = NextResponse.json(
        { error: "invalid_json", message: "Request body must be valid JSON" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/settings/conflict-window",
        method: "PUT",
        status: 400,
        durationMs: Date.now() - startedAt,
        requestId,
      });
      return response;
    }

    let validated: ConflictWindowRequest;
    try {
      validated = ConflictWindowRequestSchema.parse(body);
    } catch (error) {
      let errorMessage = "Invalid request body";
      if (error instanceof z.ZodError) {
        const flattened = error.flatten();
        const fieldErrors = Object.values(flattened.fieldErrors);
        if (fieldErrors.length > 0 && Array.isArray(fieldErrors[0])) {
          errorMessage = fieldErrors[0][0] || errorMessage;
        }
      }
      const response = NextResponse.json(
        {
          error: "invalid_input",
          message: errorMessage,
        },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/settings/conflict-window",
        method: "PUT",
        status: 400,
        durationMs: Date.now() - startedAt,
        requestId,
      });
      return response;
    }

    // Validate and clamp window using SettingsEngine
    const settingsEngine = new SettingsEngine();
    const resolved = settingsEngine.resolveConflictWindow(family.id, {
      windowMins: validated.windowMins,
    });

    // Upsert to database
    const saved = await db.conflictWindows.upsert(family.id, resolved.windowMins);

    const response = NextResponse.json(
      { windowMins: saved.windowMins } as ConflictWindowResponse,
      { status: 200 }
    );

    observeApiRequest({
      route: "/api/settings/conflict-window",
      method: "PUT",
      status: 200,
      durationMs: Date.now() - startedAt,
      requestId,
    });

    logEvent("info", "Conflict window updated", {
      requestId,
      familyId: family.id,
      windowMins: saved.windowMins,
    });

    return response;
  } catch (error) {
    observeApiException("/api/settings/conflict-window", "PUT", error);

    logEvent("error", "Conflict window settings endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown",
    });

    const response = NextResponse.json(
      {
        error: "internal_server_error",
        message: "Failed to update conflict window",
      },
      { status: 500 }
    );

    observeApiRequest({
      route: "/api/settings/conflict-window",
      method: "PUT",
      status: 500,
      durationMs: Date.now() - startedAt,
      requestId,
    });

    return response;
  }
}
