/**
 * Message API Endpoints
 *
 * PATCH /api/messages/[id] - Attempt to modify a message (blocked if exported)
 * PUT /api/messages/[id] - Attempt to replace a message (blocked if exported)
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/persistence";
import { getAuthenticatedUser, badRequest, unauthorized, notFound } from "@/app/api/calendar/utils";
import { logEvent } from "@/lib/observability/logger";

/**
 * PATCH /api/messages/[id]
 *
 * Attempt to modify a message.
 * Blocked if message has been exported (immutability enforcement).
 *
 * Request body:
 *   { body?: string; tone_analysis?: Record<string, unknown> }
 *
 * Response:
 *   403 Forbidden - if message has been exported
 *   404 Not Found - if message not found
 *   200 OK - if successfully updated (should not happen due to immutability)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized();
    }

    const messageId = (await params).id;
    if (!messageId) {
      return badRequest(
        "invalid_request",
        "Message ID is required"
      );
    }

    const db = getDb();

    // Find the message
    const message = await db.messages?.findById(messageId);
    if (!message) {
      return notFound("message_not_found", "Message not found");
    }

    // Check if message has been exported (immutability enforcement)
    const exports = await db.exportJobs?.findByMessageId(messageId);
    if (exports && exports.length > 0) {
      logEvent("warn", "Immutable message modification attempt", {
        messageId,
        userId: user.userId,
        exportCount: exports.length,
        requestId,
      });

      return NextResponse.json(
        {
          error: "immutable_exported",
          message: "Cannot modify message that has been exported",
        },
        { status: 403 }
      );
    }

    // Messages are immutable per hash chain design
    // Even if not exported, modifications violate the hash chain integrity
    logEvent("info", "Message modification blocked by hash chain immutability", {
      messageId,
      userId: user.userId,
      requestId,
    });

    return NextResponse.json(
      {
        error: "immutable_design",
        message: "Messages are immutable after creation to preserve hash chain integrity",
      },
      { status: 403 }
    );
  } catch (error) {
    logEvent("error", "Failed to process message PATCH", {
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return NextResponse.json(
      { error: "server_error", message: "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/messages/[id]
 *
 * Attempt to replace a message.
 * Blocked if message has been exported (immutability enforcement).
 *
 * Request body:
 *   { body: string; ... }
 *
 * Response:
 *   403 Forbidden - if message has been exported
 *   404 Not Found - if message not found
 *   200 OK - if successfully replaced (should not happen due to immutability)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized();
    }

    const messageId = (await params).id;
    if (!messageId) {
      return badRequest(
        "invalid_request",
        "Message ID is required"
      );
    }

    const db = getDb();

    // Find the message
    const message = await db.messages?.findById(messageId);
    if (!message) {
      return notFound("message_not_found", "Message not found");
    }

    // Check if message has been exported (immutability enforcement)
    const exports = await db.exportJobs?.findByMessageId(messageId);
    if (exports && exports.length > 0) {
      logEvent("warn", "Immutable message modification attempt (PUT)", {
        messageId,
        userId: user.userId,
        exportCount: exports.length,
        requestId,
      });

      return NextResponse.json(
        {
          error: "immutable_exported",
          message: "Cannot modify message that has been exported",
        },
        { status: 403 }
      );
    }

    // Messages are immutable per hash chain design
    logEvent("info", "Message replacement blocked by hash chain immutability", {
      messageId,
      userId: user.userId,
      requestId,
    });

    return NextResponse.json(
      {
        error: "immutable_design",
        message: "Messages are immutable after creation to preserve hash chain integrity",
      },
      { status: 403 }
    );
  } catch (error) {
    logEvent("error", "Failed to process message PUT", {
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return NextResponse.json(
      { error: "server_error", message: "Failed to process request" },
      { status: 500 }
    );
  }
}
