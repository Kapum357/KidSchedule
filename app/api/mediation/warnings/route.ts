/**
 * KidSchedule – Mediation Warnings API Routes
 *
 * GET /api/mediation/warnings – list warnings for current family
 * GET /api/mediation/warnings?filter=undismissed – only undismissed warnings
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib/auth";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      observeApiRequest({
        route: "/api/mediation/warnings",
        method: "GET",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const filter = request.nextUrl.searchParams.get("filter");
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam) : 30;

    let warnings;

    if (filter === "undismissed") {
      warnings = await db.mediationWarnings.findUndismissedByFamilyId(
        parent.familyId
      );
    } else {
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      warnings = await db.mediationWarnings.findByFamilyIdAndDateRange(
        parent.familyId,
        startDate.toISOString(),
        endDate
      );
    }

    const stats = await db.mediationWarnings.getStats(parent.familyId);

    logEvent("info", "Mediation warnings retrieved", {
      familyId: parent.familyId,
      filter: filter || "all",
      count: warnings.length
    });

    observeApiRequest({
      route: "/api/mediation/warnings",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ warnings, stats });
  } catch (error) {
    logEvent("error", "GET /api/mediation/warnings error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({
      route: "/api/mediation/warnings",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    console.error("[GET /api/mediation/warnings]", error);
    return NextResponse.json(
      { error: "Failed to fetch warnings" },
      { status: 500 }
    );
  }
}
