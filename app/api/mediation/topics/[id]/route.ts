/**
 * KidSchedule – Mediation Topic Detail API Routes
 *
 * PATCH /api/mediation/topics/[id] – update a topic (draft, resolve, etc.)
 * DELETE /api/mediation/topics/[id] – delete a topic
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib";

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
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const { id } = await params;
    const topic = await db.mediationTopics.findById(id);

    if (!topic || topic.familyId !== parent.familyId) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const body: TopicUpdateRequest = await request.json();

    // Handle resolve flag
    if (body.resolve) {
      const resolved = await db.mediationTopics.resolve(id);
      return NextResponse.json({ topic: resolved });
    }

    // Handle draft suggestion
    if (body.draftSuggestion !== undefined) {
      const updated = await db.mediationTopics.saveDraft(
        id,
        body.draftSuggestion
      );
      return NextResponse.json({ topic: updated });
    }

    // Handle general update
    const updated = await db.mediationTopics.update(id, {
      title: body.title,
      description: body.description,
      status: body.status,
    });

    return NextResponse.json({ topic: updated });
  } catch (error) {
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
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const { id } = await params;
    const topic = await db.mediationTopics.findById(id);

    if (!topic || topic.familyId !== parent.familyId) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const deleted = await db.mediationTopics.delete(id);
    return NextResponse.json({ success: deleted });
  } catch (error) {
    console.error("[DELETE /api/mediation/topics/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete topic" },
      { status: 500 }
    );
  }
}
