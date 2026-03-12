/**
 * KidSchedule – Twilio Incoming SMS Webhook
 *
 * Handles inbound SMS messages from parents. Validates Twilio signature,
 * parses message content, and routes to appropriate handler.
 *
 * @module api/webhooks/twilio/incoming
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTwilioWebhookSignature } from "@/lib/providers/sms/twilio-webhook";
import { logEvent } from "@/lib/observability/logger";
import { getDb } from "@/lib/persistence";
import { emitNewMessage } from "@/lib/socket-server";

// ─── Types ─────────────────────────────────────────────────────────────────

interface IncomingSmsPayload {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TWILIO_SIGNATURE_HEADER = "x-twilio-signature";
const SMS_MAX_LENGTH = 1600;
const PHONE_MASK_VISIBLE_DIGITS = 4;

const STOP_KEYWORDS = new Set(["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseIncomingSms(formData: FormData): IncomingSmsPayload | null {
  const messageSid = formData.get("MessageSid");
  const accountSid = formData.get("AccountSid");
  const from = formData.get("From");
  const to = formData.get("To");
  const body = formData.get("Body");

  if (
    typeof messageSid !== "string" ||
    typeof accountSid !== "string" ||
    typeof from !== "string" ||
    typeof to !== "string" ||
    typeof body !== "string"
  ) {
    return null;
  }

  return {
    MessageSid: messageSid,
    AccountSid: accountSid,
    From: from,
    To: to,
    Body: body.slice(0, SMS_MAX_LENGTH),
    NumMedia: formData.get("NumMedia")?.toString(),
  };
}

function isOptOutRequest(body: string): boolean {
  return STOP_KEYWORDS.has(body.trim().toUpperCase());
}

function isHelpRequest(body: string): boolean {
  return HELP_KEYWORDS.has(body.trim().toUpperCase());
}

function generateTwiMLResponse(message?: string): string {
  if (!message) {
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }

  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

function maskPhone(phone: string): string {
  if (phone.length <= PHONE_MASK_VISIBLE_DIGITS) {
    return "****";
  }
  return `****${phone.slice(-PHONE_MASK_VISIBLE_DIGITS)}`;
}

function getHelpResponse(): string {
  return "KidSchedule: Reply STOP to unsubscribe. For support, visit kidschedule.app/help";
}

function getOptOutResponse(): string {
  return "You have been unsubscribed from KidSchedule SMS notifications. Reply START to resubscribe.";
}

// ─── Route Handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get Twilio signature
    const signature = request.headers.get(TWILIO_SIGNATURE_HEADER);
    if (!signature) {
      logEvent("warn", "Missing Twilio signature on incoming SMS", {});
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const payload = parseIncomingSms(formData);

    if (!payload) {
      logEvent("warn", "Invalid incoming SMS payload", {});
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Verify Twilio signature
    const webhookUrl =
      process.env.TWILIO_WEBHOOK_URL ||
      `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/incoming`;
    
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        params[key] = value;
      }
    });

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      logEvent("error", "Twilio auth token is not configured", {
        route: "/api/webhooks/twilio/incoming",
      });
      return NextResponse.json({ error: "twilio_auth_token_not_configured" }, { status: 500 });
    }

    const isValid = verifyTwilioWebhookSignature({
      authToken,
      signature,
      url: webhookUrl,
      params,
    });
    if (!isValid) {
      logEvent("warn", "Invalid Twilio signature", {
        messageSid: payload.MessageSid,
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    logEvent("info", "Received incoming SMS", {
      messageSid: payload.MessageSid,
      fromMasked: maskPhone(payload.From),
      bodyLength: payload.Body.length,
    });

    // ─── SMS Relay Message Handling ───────────────────────────────────────────

    // 1. Find family by proxy number (To: field is the proxy number SMS was sent to)
    const db = getDb();
    const relayParticipant = await db.smsRelayParticipants.findByProxyNumber(payload.To);

    if (!relayParticipant) {
      // SMS sent to proxy number but no relay participant found
      logEvent("warn", "SMS to unknown proxy number", {
        proxyNumber: payload.To,
      });
      return new NextResponse(
        generateTwiMLResponse("This number is not enrolled in KidSchedule SMS relay."),
        { status: 200, headers: { "Content-Type": "text/xml" } }
      );
    }

    // 2. Find sender by phone number and family
    const senderParticipant = await db.smsRelayParticipants.findByPhoneAndFamily(
      payload.From,
      relayParticipant.familyId
    );

    if (!senderParticipant) {
      // SMS from phone not enrolled in this family
      logEvent("warn", "SMS from non-enrolled phone", {
        phone: maskPhone(payload.From),
        familyId: relayParticipant.familyId,
      });
      return new NextResponse(
        generateTwiMLResponse("Your phone number is not enrolled in this family's relay."),
        { status: 200, headers: { "Content-Type": "text/xml" } }
      );
    }

    // 3. Handle opt-out/help for relay messages (check before processing)
    if (isOptOutRequest(payload.Body)) {
      // Deactivate SMS relay for this participant
      await db.smsRelayParticipants.deactivate(senderParticipant.parentId);
      logEvent("info", "SMS relay opt-out", {
        parentId: senderParticipant.parentId,
        familyId: relayParticipant.familyId,
      });
      return new NextResponse(generateTwiMLResponse(getOptOutResponse()), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (isHelpRequest(payload.Body)) {
      return new NextResponse(generateTwiMLResponse(getHelpResponse()), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // 4. Get or create message thread for family
    const threads = await db.messageThreads.findByFamilyId(relayParticipant.familyId);
    let threadId = threads[0]?.id;

    if (!threadId) {
      const createdThread = await db.messageThreads.create({
        familyId: relayParticipant.familyId,
        subject: "Family Messages",
      });
      threadId = createdThread.id ?? `thread_${crypto.randomUUID()}`;
    }

    // 5. Get parent record for sender
    const senderParent = await db.parents.findById(senderParticipant.parentId);
    if (!senderParent) {
      logEvent("error", "Parent record not found for SMS relay message", {
        parentId: senderParticipant.parentId,
      });
      return new NextResponse(generateTwiMLResponse(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // 6. Create message from SMS content
    const sentAt = new Date().toISOString();
    const createdMessage = await db.messages.create({
      threadId,
      familyId: relayParticipant.familyId,
      senderId: senderParent.id,
      body: payload.Body,
      sentAt,
      readAt: undefined,
      attachmentIds: [],
      toneAnalysis: {
        isHostile: false,
        indicators: [],
      },
      messageHash: "",
      chainIndex: 0,
    });

    // 7. Emit real-time socket event to connected family members
    emitNewMessage(relayParticipant.familyId, {
      id: createdMessage.id,
      familyId: createdMessage.familyId,
      senderId: createdMessage.senderId,
      body: createdMessage.body,
      sentAt: createdMessage.sentAt,
      readAt: createdMessage.readAt,
      attachmentIds: createdMessage.attachmentIds,
    });

    logEvent("info", "SMS relay message created", {
      messageId: createdMessage.id,
      familyId: relayParticipant.familyId,
      senderParentId: senderParent.id,
    });

    // ─── End SMS Relay Handling ──────────────────────────────────────────────

    // Acknowledge relay message without additional auto-reply
    return new NextResponse(generateTwiMLResponse(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    logEvent("error", "Failed to process incoming SMS", {
      error: error instanceof Error ? error.message : "unknown",
    });

    // Return valid TwiML even on error to prevent Twilio retries
    return new NextResponse(generateTwiMLResponse(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

// Twilio may send GET for webhook verification
export async function GET(): Promise<NextResponse> {
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    },
  );
}
