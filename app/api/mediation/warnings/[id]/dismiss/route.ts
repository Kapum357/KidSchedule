/**
 * KidSchedule – Mediation Warning Dismiss Route
 *
 * POST /api/mediation/warnings/[id]/dismiss – dismiss a warning
 *
 * Request body:
 * {
 *   sendAcknowledgment?: boolean
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib/auth";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

type DismissRequestBody = {
  sendAcknowledgment?: boolean;
};

const ROUTE = "POST /api/mediation/warnings/[id]/dismiss";

const ACKNOWLEDGMENT_MESSAGE =
  "I've reviewed your message and I'm working to ensure our communication stays constructive. Let's focus on what's best for our child.";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  try {
    const user = await requireAuth();
    const parent = await db.parents.findByUserId(user.userId);

    if (!parent) {
      observeApiRequest({
        route: ROUTE,
        method: "POST",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Not a parent user" }, { status: 403 });
    }

    const { id } = await params;
    const warning = await db.mediationWarnings.findById(id);

    if (!warning || warning.familyId !== parent.familyId) {
      observeApiRequest({
        route: ROUTE,
        method: "POST",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Warning not found" }, { status: 404 });
    }

    const dismissed = await db.mediationWarnings.dismiss(id, parent.id);

    if (!dismissed) {
      logEvent("error", "mediation.warning_dismissal_failed", {
        warningId: id,
        parentId: parent.id,
        familyId: parent.familyId,
      });
      observeApiRequest({
        route: ROUTE,
        method: "POST",
        status: 500,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "Failed to dismiss warning" },
        { status: 500 }
      );
    }

    // Parse request body to check for sendAcknowledgment flag
    let sendAcknowledgment = false;
    try {
      const body = (await request.json()) as DismissRequestBody;
      sendAcknowledgment = body.sendAcknowledgment ?? false;
    } catch {
      // Body might be empty or invalid JSON; default to false
      sendAcknowledgment = false;
    }

    // If sendAcknowledgment is true, create acknowledgment message
    if (sendAcknowledgment && warning.messageId) {
      try {
        // Get other parent in family
        const familyParents = await db.parents.findByFamilyId(parent.familyId);
        const otherParent = familyParents.find((p) => p.id !== parent.id);

        if (otherParent) {
          // Create acknowledgment message in the same thread as the original warning
          // messageHash and chainIndex are computed by the repository
          const acknowledgmentMessage = await db.messages.create({
            threadId: warning.messageId,
            familyId: parent.familyId,
            senderId: parent.id,
            body: ACKNOWLEDGMENT_MESSAGE,
            sentAt: new Date().toISOString(),
            attachmentIds: [],
            messageHash: "",
            chainIndex: 0,
          });

          if (acknowledgmentMessage) {
            logEvent("info", "mediation.warning_acknowledged", {
              warningId: id,
              messageId: acknowledgmentMessage.id,
            });
          }
        }
      } catch (msgError) {
        // Log the error but don't fail the dismissal if message creation fails
        logEvent("error", "Failed to create acknowledgment message", {
          warningId: id,
          error: msgError instanceof Error ? msgError.message : "unknown",
        });
      }
    }

    logEvent("info", "mediation_warnings.dismissed", {
      warningId: id,
      dismissedBy: parent.id,
      withAcknowledgment: sendAcknowledgment,
    });

    observeApiRequest({
      route: ROUTE,
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ warning: dismissed });
  } catch (error) {
    logEvent("error", "mediation.warning_dismissal_error", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    observeApiRequest({
      route: ROUTE,
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: "Failed to dismiss warning" },
      { status: 500 }
    );
  }
}
