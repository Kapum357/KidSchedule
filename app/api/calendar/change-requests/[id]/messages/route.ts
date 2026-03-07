/**
 * KidSchedule – Change Request Messages API Routes
 *
 * GET  /api/calendar/change-requests/[id]/messages – list messages
 * POST /api/calendar/change-requests/[id]/messages – send a message
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib";
import { db } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const route = "/api/calendar/change-requests/[id]/messages";

  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);
    if (!parent) {
      observeApiRequest({ route, method: "GET", status: 403, durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Parent profile not found" }, { status: 403 });
    }

    const { id } = await params;
    const request = await db.scheduleChangeRequests.findById(id);
    if (!request) {
      observeApiRequest({ route, method: "GET", status: 404, durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (request.familyId !== parent.familyId) {
      observeApiRequest({ route, method: "GET", status: 403, durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const messages = await db.changeRequestMessages.findByRequestId(id);

    observeApiRequest({ route, method: "GET", status: 200, durationMs: Date.now() - startedAt });
    return NextResponse.json(messages);
  } catch (error) {
    logEvent("error", "GET /api/calendar/change-requests/[id]/messages error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({ route, method: "GET", status: 500, durationMs: Date.now() - startedAt });
    console.error("[GET /api/calendar/change-requests/[id]/messages]", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const route = "/api/calendar/change-requests/[id]/messages";

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

    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message || message.length === 0) {
      observeApiRequest({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }
    if (message.length > 2000) {
      observeApiRequest({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
      return NextResponse.json(
        { error: "Message body must be 2000 characters or fewer" },
        { status: 400 }
      );
    }

    const newMsg = await db.changeRequestMessages.create({
      requestId: id,
      familyId: parent.familyId,
      senderParentId: parent.id,
      body: message,
    });

    logEvent("info", "change_request.message_sent", {
      requestId: id,
      familyId: parent.familyId,
      senderId: parent.id,
    });

    observeApiRequest({ route, method: "POST", status: 201, durationMs: Date.now() - startedAt });
    return NextResponse.json(
      {
        id: newMsg.id,
        senderName: parent.name,
        senderInitial: parent.name[0] ?? "?",
        isCurrentUser: true,
        body: newMsg.body,
        createdAt: newMsg.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    logEvent("error", "POST /api/calendar/change-requests/[id]/messages error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({ route, method: "POST", status: 500, durationMs: Date.now() - startedAt });
    console.error("[POST /api/calendar/change-requests/[id]/messages]", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
