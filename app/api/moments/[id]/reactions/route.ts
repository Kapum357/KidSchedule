/**
 * KidSchedule – Moment Reactions REST API
 *
 * POST /api/moments/{id}/reactions – Add or update a reaction (upsert)
 * GET /api/moments/{id}/reactions – List all reactions for a moment, grouped by emoji
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { validateEmoji } from "@/lib/constants/emoji";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

// ─── POST Handler: Add or update a reaction ────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    // 1. Auth: Get current user (parent)
    const session = await getCurrentUser();
    if (!session) {
      const { id: momentId } = await params;
      logEvent("warn", "Reaction POST: unauthorized attempt", {
        requestId,
        momentId,
      });
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const parentId = session.userId;
    const { id: momentId } = await params;

    // 2. Parse body: { emoji: string }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Request body must be valid JSON" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object" || !("emoji" in body)) {
      return NextResponse.json(
        { error: "MISSING_EMOJI", message: "Request body must contain 'emoji' field" },
        { status: 400 }
      );
    }

    const emoji = (body as Record<string, unknown>).emoji;
    if (typeof emoji !== "string") {
      return NextResponse.json(
        { error: "INVALID_EMOJI_TYPE", message: "Emoji must be a string" },
        { status: 400 }
      );
    }

    // 3. Validate: emoji in ALLOWED_EMOJIS
    if (!validateEmoji(emoji)) {
      return NextResponse.json(
        { error: "INVALID_EMOJI", message: `Emoji '${emoji}' is not allowed` },
        { status: 400 }
      );
    }

    // 4. Check if moment exists (momentId already awaited above)
    const moment = await db.moments.findById(momentId);
    if (!moment) {
      logEvent("warn", "Reaction POST: moment not found", {
        requestId,
        momentId,
      });
      return NextResponse.json(
        { error: "MOMENT_NOT_FOUND", message: "Moment not found" },
        { status: 404 }
      );
    }

    // 5. Call: db.momentReactions.addReaction(momentId, parentId, emoji)
    const result = await db.momentReactions.addReaction(momentId, parentId, emoji);

    // 6. Return: 201 Created { id, emoji, parentId, isNew, createdAt }
    const createdAt = new Date().toISOString();
    const response = {
      id: result.id,
      emoji,
      parentId,
      isNew: result.isNew,
      createdAt,
    };

    // 7. Log: logEvent('info', 'Moment reaction added', { momentId, emoji })
    logEvent("info", "Moment reaction added", {
      requestId,
      momentId,
      parentId,
      emoji,
      isNew: result.isNew,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const { id: momentId } = await params;
    logEvent("error", "Reaction POST failed", {
      requestId,
      momentId,
      error: errorMessage,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to add reaction" },
      { status: 500 }
    );
  }
}

// ─── GET Handler: List all reactions for a moment, grouped by emoji ─────────────

interface GroupedReaction {
  emoji: string;
  count: number;
  byCurrentUser: boolean;
  userIds: string[];
}

interface GroupedReactionsResponse {
  momentId: string;
  reactions: GroupedReaction[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const { id: momentId } = await params;

    // Optional: Get current user to mark which reactions are by them
    const session = await getCurrentUser();
    const currentParentId = session?.userId;

    // 1. Check if moment exists
    const moment = await db.moments.findById(momentId);
    if (!moment) {
      logEvent("warn", "Reactions GET: moment not found", {
        requestId,
        momentId,
      });
      return NextResponse.json(
        { error: "MOMENT_NOT_FOUND", message: "Moment not found" },
        { status: 404 }
      );
    }

    // 2. Query all reactions for moment
    const allReactions = await db.momentReactions.findByMomentId(momentId);

    // 3. Group by emoji
    const groupMap = new Map<string, Map<string, true>>();

    for (const reaction of allReactions) {
      if (!groupMap.has(reaction.emoji)) {
        groupMap.set(reaction.emoji, new Map());
      }
      const parentMap = groupMap.get(reaction.emoji)!;
      parentMap.set(reaction.parentId, true);
    }

    // 4. Build grouped response
    const reactions: GroupedReaction[] = Array.from(groupMap.entries()).map(
      ([emoji, parentMap]) => ({
        emoji,
        count: parentMap.size,
        byCurrentUser: currentParentId ? parentMap.has(currentParentId) : false,
        userIds: Array.from(parentMap.keys()),
      })
    );

    const response: GroupedReactionsResponse = {
      momentId,
      reactions,
    };

    logEvent("info", "Moment reactions retrieved", {
      requestId,
      momentId,
      reactionCount: allReactions.length,
      groupCount: reactions.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const { id: momentId } = await params;
    logEvent("error", "Reactions GET failed", {
      requestId,
      momentId,
      error: errorMessage,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to retrieve reactions" },
      { status: 500 }
    );
  }
}
