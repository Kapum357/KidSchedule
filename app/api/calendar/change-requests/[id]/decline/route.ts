/**
 * KidSchedule – Decline Change Request API Route
 *
 * POST /api/calendar/change-requests/[id]/decline
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib";
import { db } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const route = "/api/calendar/change-requests/[id]/decline";

  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);
    if (!parent) {
      observeApiRequest({ route, method: "POST", status: 403, durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Parent profile not found" }, { status: 403 });
    }

    const { id } = await params;
    const request = await db.scheduleChangeRequests.findById(id);
    if (!request) {
      observeApiRequest({ route, method: "POST", status: 404, durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (request.familyId !== parent.familyId) {
      observeApiRequest({ route, method: "POST", status: 403, durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (request.requestedBy === parent.id) {
      observeApiRequest({ route, method: "POST", status: 403, durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Cannot decline your own request" }, { status: 403 });
    }
    if (request.status !== "pending") {
      observeApiRequest({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Request is no longer pending" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const responseNote = typeof body?.note === "string" ? body.note.trim() : undefined;

    await db.scheduleChangeRequests.decline(id, parent.id, responseNote || undefined);

    logEvent("info", "change_request.declined", {
      requestId: id,
      familyId: parent.familyId,
      declinedBy: parent.id,
    });

    observeApiRequest({ route, method: "POST", status: 204, durationMs: Date.now() - startedAt });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logEvent("error", "POST /api/calendar/change-requests/[id]/decline error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({ route, method: "POST", status: 500, durationMs: Date.now() - startedAt });
    console.error("[POST /api/calendar/change-requests/[id]/decline]", error);
    return NextResponse.json({ error: "Failed to decline request" }, { status: 500 });
  }
}
