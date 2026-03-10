/**
 * KidSchedule – Mediation Topics API Routes
 *
 * GET /api/mediation/topics – list all topics for current family
 * POST /api/mediation/topics – create a new topic
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib/auth";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

type TopicCreateRequest = {
  title: string;
  description?: string;
  status?: "draft" | "in_progress";
};

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      observeApiRequest({
        route: "/api/mediation/topics",
        method: "GET",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const topics = await db.mediationTopics.findByFamilyId(parent.familyId);
    logEvent("info", "Mediation topics retrieved", { familyId: parent.familyId, count: topics.length });

    observeApiRequest({
      route: "/api/mediation/topics",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ topics });
  } catch (error) {
    logEvent("error", "GET /api/mediation/topics error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({
      route: "/api/mediation/topics",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    console.error("[GET /api/mediation/topics]", error);
    return NextResponse.json(
      { error: "Failed to fetch topics" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      observeApiRequest({
        route: "/api/mediation/topics",
        method: "POST",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const body: TopicCreateRequest = await request.json();

    if (!body.title || body.title.trim().length === 0) {
      observeApiRequest({
        route: "/api/mediation/topics",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const topic = await db.mediationTopics.create({
      familyId: parent.familyId,
      parentId: parent.id,
      title: body.title.trim(),
      description: body.description?.trim(),
      status: body.status || "draft",
    });

    logEvent("info", "Mediation topic created", { topicId: topic.id, status: topic.status });
    observeApiRequest({
      route: "/api/mediation/topics",
      method: "POST",
      status: 201,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ topic }, { status: 201 });
  } catch (error) {
    logEvent("error", "POST /api/mediation/topics error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({
      route: "/api/mediation/topics",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    console.error("[POST /api/mediation/topics]", error);
    return NextResponse.json(
      { error: "Failed to create topic" },
      { status: 500 }
    );
  }
}
