/**
 * KidSchedule – Mediation Warning Dismiss Route
 *
 * POST /api/mediation/warnings/[id]/dismiss – dismiss a warning
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      observeApiRequest({
        route: "/api/mediation/warnings/[id]/dismiss",
        method: "POST",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const { id } = await params;
    const warning = await db.mediationWarnings.findById(id);

    if (!warning || warning.familyId !== parent.familyId) {
      observeApiRequest({
        route: "/api/mediation/warnings/[id]/dismiss",
        method: "POST",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Warning not found" }, { status: 404 });
    }

    const dismissed = await db.mediationWarnings.dismiss(id, parent.id);

    if (!dismissed) {
      logEvent("error", "Failed to dismiss warning", { warningId: id });
      observeApiRequest({
        route: "/api/mediation/warnings/[id]/dismiss",
        method: "POST",
        status: 500,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "Failed to dismiss warning" },
        { status: 500 }
      );
    }

    logEvent("info", "Mediation warning dismissed", {
      warningId: id,
      dismissedBy: parent.id
    });

    observeApiRequest({
      route: "/api/mediation/warnings/[id]/dismiss",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ warning: dismissed });
  } catch (error) {
    logEvent("error", "POST /api/mediation/warnings/[id]/dismiss error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({
      route: "/api/mediation/warnings/[id]/dismiss",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    console.error("[POST /api/mediation/warnings/[id]/dismiss]", error);
    return NextResponse.json(
      { error: "Failed to dismiss warning" },
      { status: 500 }
    );
  }
}
