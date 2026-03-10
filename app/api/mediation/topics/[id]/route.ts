/**
 * KidSchedule – Mediation Topic Detail API Routes
 *
 * PATCH /api/mediation/topics/[id] – update a topic (draft, resolve, etc.)
 * DELETE /api/mediation/topics/[id] – delete a topic
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib/auth";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

type TopicUpdateRequest = {
  title?: string;
  description?: string;
  status?: "draft" | "in_progress" | "resolved";
  draftSuggestion?: string;
  resolve?: boolean;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      observeApiRequest({
        route: "/api/mediation/topics/[id]",
        method: "PATCH",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const { id } = await params;
    const topic = await db.mediationTopics.findById(id);

    if (!topic || topic.familyId !== parent.familyId) {
      observeApiRequest({
        route: "/api/mediation/topics/[id]",
        method: "PATCH",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const body: TopicUpdateRequest = await request.json();

    // Validate status enum if provided
    if (body.status && !["draft", "in_progress", "resolved"].includes(body.status)) {
      observeApiRequest({
        route: "/api/mediation/topics/[id]",
        method: "PATCH",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Handle resolve flag
    if (body.resolve) {
      const resolved = await db.mediationTopics.resolve(id);
      if (!resolved) {
        logEvent("error", "Failed to resolve topic", { topicId: id });
        observeApiRequest({
          route: "/api/mediation/topics/[id]",
          method: "PATCH",
          status: 500,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: "Failed to resolve topic" }, { status: 500 });
      }
      logEvent("info", "Mediation topic resolved", { topicId: id, operation: "resolved" });
      observeApiRequest({
        route: "/api/mediation/topics/[id]",
        method: "PATCH",
        status: 200,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ topic: resolved });
    }

    // Handle draft suggestion
    if (body.draftSuggestion !== undefined) {
      const updated = await db.mediationTopics.saveDraft(
        id,
        body.draftSuggestion
      );
      if (!updated) {
        logEvent("error", "Failed to save draft", { topicId: id });
        observeApiRequest({
          route: "/api/mediation/topics/[id]",
          method: "PATCH",
          status: 500,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
      }
      logEvent("info", "Mediation topic draft saved", { topicId: id, operation: "draft_saved" });
      observeApiRequest({
        route: "/api/mediation/topics/[id]",
        method: "PATCH",
        status: 200,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ topic: updated });
    }

    // Handle general update
    const updated = await db.mediationTopics.update(id, {
      title: body.title,
      description: body.description,
      status: body.status,
    });

    logEvent("info", "Mediation topic updated", { topicId: id, operation: "updated" });
    observeApiRequest({
      route: "/api/mediation/topics/[id]",
      method: "PATCH",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ topic: updated });
  } catch (error) {
    logEvent("error", "PATCH /api/mediation/topics/[id] error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({
      route: "/api/mediation/topics/[id]",
      method: "PATCH",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    console.error("[PATCH /api/mediation/topics/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update topic" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      observeApiRequest({
        route: "/api/mediation/topics/[id]",
        method: "DELETE",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const { id } = await params;
    const topic = await db.mediationTopics.findById(id);

    if (!topic || topic.familyId !== parent.familyId) {
      observeApiRequest({
        route: "/api/mediation/topics/[id]",
        method: "DELETE",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const deleted = await db.mediationTopics.delete(id);
    logEvent("info", "Mediation topic deleted", { topicId: id });
    observeApiRequest({
      route: "/api/mediation/topics/[id]",
      method: "DELETE",
      status: 204,
      durationMs: Date.now() - startedAt,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logEvent("error", "DELETE /api/mediation/topics/[id] error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({
      route: "/api/mediation/topics/[id]",
      method: "DELETE",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    console.error("[DELETE /api/mediation/topics/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete topic" },
      { status: 500 }
    );
  }
}
