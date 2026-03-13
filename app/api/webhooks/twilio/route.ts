import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  mapTwilioStatusToDeliveryStatus,
  updateSmsDeliveryStatus,
  verifyTwilioWebhookSignature,
} from "@/lib/providers/sms";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";
import { getTwilioAuthToken } from "@/lib/providers/sms/twilio-config";
import { getDb } from "@/lib/persistence";

export const runtime = "nodejs";

function getCanonicalWebhookUrl(request: Request): string {
  const configuredBaseUrl = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (!configuredBaseUrl) {
    return request.url;
  }

  const incoming = new URL(request.url);
  const base = configuredBaseUrl.endsWith("/")
    ? configuredBaseUrl.slice(0, -1)
    : configuredBaseUrl;

  return `${base}${incoming.pathname}${incoming.search}`;
}

function toParamsObject(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    params[key] = typeof value === "string" ? value : value.name;
  }

  return params;
}

/**
 * Extract E.164 formatted phone number from Twilio webhook payload.
 * Twilio sends phone numbers in E.164 format (+country_code + number).
 * This function returns the phone number as-is if already E.164, or null if invalid.
 */
function extractPhoneNumber(params: Record<string, string>): string | null {
  // For delivery receipts and message status events, phone is in 'To' or derived from context
  // For incoming messages, phone is in 'From'
  // For opt-out changes, phone is in 'PhoneNumber' or similar
  const phone = params.To || params.From || params.PhoneNumber;

  if (!phone) {
    return null;
  }

  // Validate E.164 format: +[1-9]\d{1,14}
  if (/^\+[1-9]\d{1,14}$/.test(phone)) {
    return phone;
  }

  return null;
}

/**
 * Determine event type from Twilio webhook params.
 * Twilio sends different event types via MessageStatus callback.
 */
function determineEventType(params: Record<string, string>): "MessageReceived" | "DeliveryReceipt" | "OptOutChange" | "IncomingPhoneNumberUnprovisioned" | "MessageStatus" | null {
  // Check for MessageStatus (most common - delivery receipts)
  const messageStatus = params.MessageStatus;
  if (messageStatus) {
    return "DeliveryReceipt";
  }

  // Check for opt-out changes (From/To indicate it's a message event)
  const optOutChange = params.OptOutChange || params.OptOut;
  if (optOutChange) {
    return "OptOutChange";
  }

  // Check for phone number unprovisioned
  if (params.IncomingPhoneNumberUnprovisioned === "true") {
    return "IncomingPhoneNumberUnprovisioned";
  }

  return null;
}

/**
 * Extract timestamp from Twilio webhook.
 * Twilio includes timestamp in various formats - we use current time as default.
 */
function extractTimestamp(params: Record<string, string>): string {
  // Twilio may include 'Timestamp' in some webhooks
  // If not present, use current time
  const timestamp = params.Timestamp;
  if (timestamp) {
    const parsed = new Date(parseInt(timestamp) * 1000).toISOString();
    return parsed;
  }
  return new Date().toISOString();
}

/**
 * Process webhook idempotently using INSERT-then-check pattern.
 * 1. Try to INSERT event into twilio_webhook_events table
 * 2. If INSERT succeeds (new event): process the status update
 * 3. If duplicate: skip processing, return 200 OK
 * 4. Mark as processed or error after handling
 */
async function processWebhookIdempotently(
  messageSid: string,
  phoneNumber: string,
  eventType: string,
  timestamp: string,
  payload: Record<string, string>,
  handler: (eventId: string) => Promise<void>
): Promise<{ success: boolean; statusCode: number; reason?: string }> {
  const db = getDb();

  try {
    // Step 1: Try to find existing event by messageSid (most reliable identifier)
    const existingEvent = await db.twilioWebhookEvents.findByMessageSid(messageSid);

    if (existingEvent) {
      // Duplicate event - already processed or in progress
      logEvent("info", "Twilio webhook already processed (duplicate)", {
        messageSid,
        eventType,
        phoneNumber,
        eventId: existingEvent.id,
      });
      return { success: true, statusCode: 200, reason: "duplicate" };
    }

    // Step 2: Insert new event with validation
    let event;
    try {
      event = await db.twilioWebhookEvents.create({
        messageSid,
        phoneNumber,
        eventType,
        timestamp,
        payload,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        logEvent("warn", "Twilio webhook validation failed", {
          messageSid,
          eventType,
          phoneNumber,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          errors: (error as any).errors.map((e: any) => `${e.path.join(".")}: ${e.message}`),
        });
        return { success: false, statusCode: 400, reason: "validation_error" };
      }
      throw error;
    }

    // Step 3: Process the event
    try {
      await handler(event.id);

      // Step 4a: Mark as processed on success
      try {
        await db.twilioWebhookEvents.markProcessed(event.id);
      } catch (error) {
        logEvent("error", "Failed to mark Twilio webhook as processed", {
          eventId: event.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        return { success: false, statusCode: 500, reason: "mark_processed_failed" };
      }

      logEvent("info", "Twilio webhook processed successfully", {
        eventId: event.id,
        messageSid,
        eventType,
        phoneNumber,
      });

      return { success: true, statusCode: 200, reason: "processed" };
    } catch (processingError) {
      // Step 4b: Mark as error on processing failure
      const errorMessage = processingError instanceof Error ? processingError.message : "unknown error";
      try {
        await db.twilioWebhookEvents.markError(event.id, errorMessage);
      } catch (markErrorError) {
        logEvent("error", "Failed to mark Twilio webhook error", {
          eventId: event.id,
          originalError: errorMessage,
          markErrorError: markErrorError instanceof Error ? markErrorError.message : "unknown",
        });
      }

      logEvent("error", "Twilio webhook processing failed", {
        eventId: event.id,
        messageSid,
        eventType,
        phoneNumber,
        error: errorMessage,
      });

      return { success: false, statusCode: 500, reason: "processing_failed" };
    }
  } catch (error) {
    logEvent("error", "Unexpected error in idempotent webhook processing", {
      messageSid,
      eventType,
      phoneNumber,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { success: false, statusCode: 500, reason: "unexpected_error" };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  let authToken: string;

  try {
    authToken = getTwilioAuthToken();
  } catch {
    logEvent("error", "Twilio auth token is not configured", {
      route: "/api/webhooks/twilio",
    });
    const response = NextResponse.json({ error: "twilio_auth_token_not_configured" }, { status: 500 });
    observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: 500, durationMs: Date.now() - startedAt });
    return response;
  }

  const signature = request.headers.get("x-twilio-signature");
  const formData = await request.formData();
  const params = toParamsObject(formData);

  const validSignature = verifyTwilioWebhookSignature({
    authToken,
    signature,
    url: getCanonicalWebhookUrl(request),
    params,
  });

  if (!validSignature) {
    const response = NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: 401, durationMs: Date.now() - startedAt });
    return response;
  }

  const messageSid = params.MessageSid;
  const phoneNumber = extractPhoneNumber(params);
  const eventType = determineEventType(params);
  const timestamp = extractTimestamp(params);

  // Basic validation
  if (!messageSid) {
    logEvent("warn", "Twilio webhook missing MessageSid", {
      params: Object.keys(params),
    });
    const response = NextResponse.json({ error: "missing_message_sid" }, { status: 400 });
    observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: 400, durationMs: Date.now() - startedAt });
    return response;
  }

  if (!phoneNumber) {
    logEvent("warn", "Twilio webhook missing or invalid phone number", {
      messageSid,
      params: Object.keys(params),
    });
    const response = NextResponse.json({ error: "missing_phone_number" }, { status: 400 });
    observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: 400, durationMs: Date.now() - startedAt });
    return response;
  }

  if (!eventType) {
    logEvent("warn", "Twilio webhook unable to determine event type", {
      messageSid,
      phoneNumber,
      params: Object.keys(params),
    });
    const response = NextResponse.json({ error: "unknown_event_type" }, { status: 400 });
    observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: 400, durationMs: Date.now() - startedAt });
    return response;
  }

  // Handle different event types with idempotency
  let result;

  if (eventType === "DeliveryReceipt") {
    // Process delivery receipt idempotently
    const messageStatus = params.MessageStatus;
    result = await processWebhookIdempotently(
      messageSid,
      phoneNumber,
      eventType,
      timestamp,
      params,
      async () => {
        updateSmsDeliveryStatus({
          messageId: messageSid,
          status: mapTwilioStatusToDeliveryStatus(messageStatus),
          providerStatus: messageStatus,
          errorCode: params.ErrorCode,
          errorMessage: params.ErrorMessage,
        });
      }
    );
  } else if (eventType === "OptOutChange") {
    // Process opt-out change idempotently (skip actual processing per Task #59)
    result = await processWebhookIdempotently(
      messageSid,
      phoneNumber,
      eventType,
      timestamp,
      params,
      async () => {
        // Task #59 will handle opt-out sync
        // For now, just store the event
        logEvent("info", "Twilio OptOutChange event received (will be processed in Task #59)", {
          messageSid,
          phoneNumber,
        });
      }
    );
  } else if (eventType === "IncomingPhoneNumberUnprovisioned") {
    // Process phone unprovisioned (just log)
    result = await processWebhookIdempotently(
      messageSid,
      phoneNumber,
      eventType,
      timestamp,
      params,
      async () => {
        logEvent("info", "Twilio phone number unprovisioned", {
          messageSid,
          phoneNumber,
        });
      }
    );
  } else {
    // Unknown event type - skip processing but log
    logEvent("warn", "Twilio webhook event type not explicitly handled", {
      eventType,
      messageSid,
      phoneNumber,
    });
    result = { success: true, statusCode: 200, reason: "event_type_not_handled" };
  }

  // Return response based on result
  const statusCode = result.statusCode;
  const response = NextResponse.json(
    { ok: statusCode === 200, reason: result.reason },
    { status: statusCode }
  );
  observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: statusCode, durationMs: Date.now() - startedAt });
  return response;
}
