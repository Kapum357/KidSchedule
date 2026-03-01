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

    const isValid = verifyTwilioWebhookSignature({
      authToken: process.env.TWILIO_AUTH_TOKEN || "",
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

    // Handle opt-out requests
    if (isOptOutRequest(payload.Body)) {
      logEvent("info", "SMS opt-out request", {
        phone: maskPhone(payload.From),
      });
      return new NextResponse(generateTwiMLResponse(getOptOutResponse()), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Handle help requests
    if (isHelpRequest(payload.Body)) {
      return new NextResponse(generateTwiMLResponse(getHelpResponse()), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // For regular messages, acknowledge without auto-reply
    // Message storage would be handled by a separate service
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
