/**
 * Read Receipt API Endpoint
 *
 * POST /api/messages/[id]/read
 * Marks a message as read by the authenticated user.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/calendar/utils";
import { getDb } from "@/lib/persistence";
import { emitMessageRead } from "@/lib/socket-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: messageId } = await params;

  // 1. Authenticate user
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get parent record to check family membership
  const db = getDb();
  const parent = await db.parents.findByUserId(user.userId);
  if (!parent) {
    return NextResponse.json({ error: "Parent profile not found" }, { status: 404 });
  }

  // 2. Find message
  const message = await db.messages.findById(messageId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // 3. Verify user belongs to message family
  const userFamily = await db.families.findByParentUserId(user.userId);
  if (!userFamily || userFamily.id !== message.familyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Reject if user is the sender (can't mark own message as read)
  if (message.senderId === parent.id) {
    return NextResponse.json(
      { error: "Cannot mark own message as read" },
      { status: 400 }
    );
  }

  // 5. If already read, return 200 with no-op
  if (message.readAt) {
    return NextResponse.json({
      id: message.id,
      readAt: message.readAt,
      wasAlreadyRead: true,
    });
  }

  // 6. Mark as read
  const readAt = new Date().toISOString();
  await db.messages.markAsRead(messageId, readAt);

  // 7. Emit socket event to notify other family members
  emitMessageRead(message.familyId, messageId, parent.id);

  // 8. Return success
  return NextResponse.json(
    {
      id: messageId,
      readAt,
      wasAlreadyRead: false,
    },
    { status: 200 }
  );
}
