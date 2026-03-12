/**
 * KidSchedule – Moment Reactions DELETE API
 *
 * DELETE /api/moments/{id}/reactions/{reactionId} – Remove a reaction (ownership verified)
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; reactionId: string } }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    // 1. Auth: Get current user (parent)
    const session = await getCurrentUser();
    if (!session) {
      logEvent("warn", "Reaction DELETE: unauthorized attempt", {
        requestId,
        momentId: params.id,
        reactionId: params.reactionId,
      });
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const parentId = session.userId;
    const momentId = params.id;
    const reactionId = params.reactionId;

    // 2. Find the reaction to verify ownership
    const reaction = await db.momentReactions.findById(reactionId);

    if (!reaction) {
      logEvent("warn", "Reaction DELETE: reaction not found", {
        requestId,
        momentId,
        reactionId,
      });
      return NextResponse.json(
        { error: "REACTION_NOT_FOUND", message: "Reaction not found" },
        { status: 404 }
      );
    }

    // 3. Verify ownership: reaction.parentId === currentUser.parentId
    if (reaction.parentId !== parentId) {
      logEvent("warn", "Reaction DELETE: ownership verification failed", {
        requestId,
        momentId,
        reactionId,
        parentId,
        reactionParentId: reaction.parentId,
      });
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Cannot delete reaction by another user" },
        { status: 403 }
      );
    }

    // 4. Verify reaction belongs to the moment being requested
    if (reaction.momentId !== momentId) {
      logEvent("warn", "Reaction DELETE: moment mismatch", {
        requestId,
        momentId,
        reactionMomentId: reaction.momentId,
        reactionId,
      });
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Reaction not found for this moment" },
        { status: 404 }
      );
    }

    // 5. Call: db.momentReactions.delete(reactionId)
    const deleted = await db.momentReactions.delete(reactionId);

    if (!deleted) {
      logEvent("warn", "Reaction DELETE: deletion failed", {
        requestId,
        momentId,
        reactionId,
      });
      return NextResponse.json(
        { error: "DELETION_FAILED", message: "Failed to delete reaction" },
        { status: 500 }
      );
    }

    // 6. Return: 204 No Content
    logEvent("info", "Moment reaction deleted", {
      requestId,
      momentId,
      reactionId,
      parentId,
      emoji: reaction.emoji,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(null, { status: 204 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logEvent("error", "Reaction DELETE failed", {
      requestId,
      momentId: params.id,
      reactionId: params.reactionId,
      error: errorMessage,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete reaction" },
      { status: 500 }
    );
  }
}
