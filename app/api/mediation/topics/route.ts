/**
 * KidSchedule – Mediation Topics API Routes
 *
 * GET /api/mediation/topics – list all topics for current family
 * POST /api/mediation/topics – create a new topic
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib";

type TopicCreateRequest = {
  title: string;
  description?: string;
  status?: "draft" | "in_progress";
};

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const topics = await db.mediationTopics.findByFamilyId(parent.familyId);
    return NextResponse.json({ topics });
  } catch (error) {
    console.error("[GET /api/mediation/topics]", error);
    return NextResponse.json(
      { error: "Failed to fetch topics" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const body: TopicCreateRequest = await request.json();

    if (!body.title || body.title.trim().length === 0) {
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

    return NextResponse.json({ topic }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/mediation/topics]", error);
    return NextResponse.json(
      { error: "Failed to create topic" },
      { status: 500 }
    );
  }
}
