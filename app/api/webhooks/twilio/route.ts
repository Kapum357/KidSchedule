import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  mapTwilioStatusToDeliveryStatus,
  updateSmsDeliveryStatus,
  verifyTwilioWebhookSignature,
} from "@/lib/providers/sms";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";
import { getTwilioAuthToken, getTwilioAccountSid } from "@/lib/providers/sms/twilio-config";
import { getDb } from "@/lib/persistence";
import {
  classifyError,
  formatErrorLog,
} from "@/lib/providers/webhook-error-handler";
import { checkRateLimit } from "@/lib/providers/redis-rate-limiter";

export const runtime = "nodejs";

// Rate limiting constants
const LIMIT_PER_WINDOW = 100;

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
 * Handle Twilio opt-out sync.
 * When a user texts "STOP" to any Twilio number:
 * 1. Mark SMS subscription as opted-out (if exists)
 * 2. Call Twilio API to confirm the opt-out
 * 3. Log the bidirectional sync
 *
 * @param phoneNumber E.164 formatted phone number
 * @returns void (errors logged but not thrown)
 */
async function handleOptOutSync(
  phoneNumber: string
): Promise<void> {
  const db = getDb();

  // Step 1: Find SMS subscription by phone number
  const subscription = await db.smsSubscriptions.findByPhoneNumber(phoneNumber);

  if (!subscription) {
    logEvent("warn", "Twilio opt-out: SMS subscription not found", {
      phoneNumber,
      reason: "User may have deleted subscription",
    });
    // Continue to Twilio API call even if subscription not found
  } else {
    // Step 2: Check idempotency - if already opted out, skip Twilio API call (optimization)
    if (subscription.optedOut && subscription.optedOutAt) {
      logEvent("info", "Twilio opt-out: Already opted out (idempotent)", {
        phoneNumber,
        subscriptionId: subscription.id,
        optedOutAt: subscription.optedOutAt,
      });
      // Already opted out - skip Twilio API call
      return;
    }

    // Step 2b: Mark SMS subscription as opted-out
    try {
      await db.smsSubscriptions.update(subscription.id, {
        optedOut: true,
        optedOutAt: new Date().toISOString(),
      });

      logEvent("info", "Twilio opt-out: Marked SMS subscription as opted-out", {
        phoneNumber,
        subscriptionId: subscription.id,
        familyId: subscription.familyId,
        reason: "stop_message",
      });
    } catch (error) {
      const errorLog = formatErrorLog(error, {
        phoneNumber,
        subscriptionId: subscription.id,
        operation: "mark_subscription_opted_out",
      }, 500);
      logEvent("error", "Twilio opt-out: Failed to mark subscription as opted-out", errorLog as unknown as Record<string, unknown>);
      // Continue to Twilio API call even if update fails
    }
  }

  // Step 3: Call Twilio API to confirm opt-out
  try {
    const accountSid = getTwilioAccountSid();
    const authToken = getTwilioAuthToken();

    // Encode phone number for URL (remove +)
    const encodedPhone = phoneNumber.replace("+", "");

    // Build the Twilio API endpoint
    // https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/IncomingPhoneNumbers/{phone_number}/OptInOutStatus
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${encodedPhone}/OptInOutStatus`;

    // Create Basic Auth header
    const authString = `${accountSid}:${authToken}`;
    const encodedAuth = Buffer.from(authString).toString("base64");

    const response = await fetch(twilioUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${encodedAuth}`,
      },
      body: "OptInStatus=OptOut",
    });

    // Step 3b: Handle response
    if (response.ok) {
      const responseData = await response.json();
      logEvent("info", "Twilio opt-out: API call successful", {
        phoneNumber,
        twilioStatus: responseData.OptInStatus,
        statusCode: response.status,
      });
    } else if (response.status >= 400 && response.status < 500) {
      // 4xx: Client error - log but don't retry
      const responseText = await response.text();
      const error = new Error(`Twilio API returned ${response.status}`);
      const errorLog = formatErrorLog(error, {
        phoneNumber,
        statusCode: response.status,
        responseText: responseText.substring(0, 500),
        operation: "twilio_opt_out_api_4xx",
      }, 500);
      logEvent("error", "Twilio opt-out: Client error from API", errorLog as unknown as Record<string, unknown>);
      // Return 200 to Twilio (don't retry 4xx errors)
    } else if (response.status >= 500) {
      // 5xx: Server error - return 500 to Twilio for retry
      const error = new Error(`Twilio API returned ${response.status}`);
      const errorLog = formatErrorLog(error, {
        phoneNumber,
        statusCode: response.status,
        operation: "twilio_opt_out_api_5xx",
      }, 500);
      logEvent("error", "Twilio opt-out: Server error from API", errorLog as unknown as Record<string, unknown>);
      throw error;
    }
  } catch (error) {
    const errorLog = formatErrorLog(error, {
      phoneNumber,
      operation: "twilio_opt_out_api_call",
    }, 500);
    logEvent("error", "Twilio opt-out: API call failed", errorLog as unknown as Record<string, unknown>);
    // Return 500 to Twilio for network errors
    throw new Error(`Failed to call Twilio opt-out API: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

/**
 * Process webhook idempotently using INSERT-then-check pattern.
 * 1. Try to INSERT event into twilio_webhook_events table
 * 2. If INSERT succeeds (new event): process the status update
 * 3. If duplicate: skip processing, return 200 OK
 * 4. Mark as processed or error after handling
 *
 * Includes enhanced error classification and structured logging.
 */
async function processWebhookIdempotently(
  messageSid: string,
  phoneNumber: string,
  eventType: string,
  timestamp: string,
  payload: Record<string, string>,
  handler: (eventId: string) => Promise<void>,
  requestId?: string
): Promise<{ success: boolean; statusCode: number; reason?: string }> {
  const db = getDb();

  try {
    // Step 1: Try to find existing event by messageSid (most reliable identifier)
    const existingEvent = await db.twilioWebhookEvents.findByMessageSid(messageSid);

    if (existingEvent) {
      // Duplicate event - already processed or in progress (expected, not an error)
      logEvent("info", "Twilio webhook already processed (duplicate)", {
        messageSid,
        eventType,
        phoneNumber,
        eventId: existingEvent.id,
        requestId,
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
        const errorLog = formatErrorLog(error, {
          requestId,
          messageSid,
          eventType,
          phoneNumber,
        }, 400);
        logEvent("error", "Twilio webhook validation failed during event creation", errorLog as unknown as Record<string, unknown>);
        return { success: false, statusCode: 400, reason: "validation_error" };
      }
      // For non-Zod errors, rethrow
      const errorLog = formatErrorLog(error, {
        requestId,
        messageSid,
        eventType,
        phoneNumber,
        operation: "create_webhook_event",
      }, 500);
      logEvent("error", "Failed to store Twilio webhook event", errorLog as unknown as Record<string, unknown>);
      throw error;
    }

    // Step 3: Process the event
    try {
      await handler(event.id);

      // Step 4a: Mark as processed on success
      try {
        await db.twilioWebhookEvents.markProcessed(event.id);
      } catch (error) {
        const errorLog = formatErrorLog(error, {
          requestId,
          eventId: event.id,
          messageSid,
          phoneNumber,
          operation: "mark_webhook_processed",
        }, 500);
        logEvent("error", "Failed to mark Twilio webhook as processed", errorLog as unknown as Record<string, unknown>);
        return { success: false, statusCode: 500, reason: "mark_processed_failed" };
      }

      logEvent("info", "Twilio webhook processed successfully", {
        eventId: event.id,
        messageSid,
        eventType,
        phoneNumber,
        requestId,
      });

      return { success: true, statusCode: 200, reason: "processed" };
    } catch (processingError) {
      // Step 4b: Mark as error on processing failure
      // Classify the error to determine if it's retryable
      const classification = classifyError(processingError);

      const errorLog = formatErrorLog(processingError, {
        requestId,
        eventId: event.id,
        messageSid,
        phoneNumber,
        eventType,
        operation: "process_webhook_handler",
      }, 500);

      logEvent("error", "Twilio webhook processing failed", errorLog as unknown as Record<string, unknown>);

      // Try to mark event with error for audit trail
      try {
        const errorMessage = processingError instanceof Error
          ? processingError.message
          : "unknown error";
        await db.twilioWebhookEvents.markError(event.id, errorMessage);
      } catch (markErrorError) {
        const markErrorLog = formatErrorLog(markErrorError, {
          requestId,
          eventId: event.id,
          originalError: processingError instanceof Error ? processingError.message : "unknown",
          operation: "mark_webhook_error",
        }, 500);
        logEvent("error", "Failed to mark Twilio webhook error in database", markErrorLog as unknown as Record<string, unknown>);
      }

      // Return appropriate status based on error classification
      const statusCode = classification.isRetryable ? 500 : 400;
      return { success: false, statusCode, reason: "processing_failed" };
    }
  } catch (error) {
    const errorLog = formatErrorLog(error, {
      requestId,
      messageSid,
      eventType,
      phoneNumber,
      operation: "process_webhook_idempotently",
    }, 500);
    logEvent("error", "Unexpected error in idempotent webhook processing", errorLog as unknown as Record<string, unknown>);
    return { success: false, statusCode: 500, reason: "unexpected_error" };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  let authToken: string;

  try {
    authToken = getTwilioAuthToken();
  } catch {
    logEvent("error", "Twilio auth token is not configured", {
      route: "/api/webhooks/twilio",
      requestId,
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
    const error = new Error("Invalid Twilio signature");
    const errorLog = formatErrorLog(error, { requestId }, 401);
    logEvent("error", "Webhook signature verification failed", errorLog as unknown as Record<string, unknown>);
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
    const error = new Error("Missing MessageSid in webhook payload");
    const errorLog = formatErrorLog(error, { requestId }, 400);
    logEvent("error", "Webhook validation failed: missing MessageSid", errorLog as unknown as Record<string, unknown>);
    const response = NextResponse.json({ error: "missing_message_sid" }, { status: 400 });
    observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: 400, durationMs: Date.now() - startedAt });
    return response;
  }

  if (!phoneNumber) {
    const error = new Error("Missing or invalid phone number in webhook payload");
    const errorLog = formatErrorLog(error, { requestId, messageSid }, 400);
    logEvent("error", "Webhook validation failed: invalid phone number", errorLog as unknown as Record<string, unknown>);
    const response = NextResponse.json({ error: "missing_phone_number" }, { status: 400 });
    observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: 400, durationMs: Date.now() - startedAt });
    return response;
  }

  if (!eventType) {
    const error = new Error("Unable to determine event type from webhook payload");
    const errorLog = formatErrorLog(error, { requestId, messageSid, phoneNumber }, 400);
    logEvent("error", "Webhook validation failed: unknown event type", errorLog as unknown as Record<string, unknown>);
    const response = NextResponse.json({ error: "unknown_event_type" }, { status: 400 });
    observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: 400, durationMs: Date.now() - startedAt });
    return response;
  }

  // Task #61: Check rate limit (100 webhooks/min per family)
  // First, resolve familyId from phone number via SMS subscription
  const db = getDb();
  const subscription = await db.smsSubscriptions.findByPhoneNumber(phoneNumber);

  let rateLimitResult;
  if (subscription) {
    const familyId = subscription.familyId;

    // Check rate limit for this family
    rateLimitResult = await checkRateLimit(familyId);

    if (!rateLimitResult.allowed) {
      // Rate limited - return 429 Too Many Requests
      logEvent("warn", "Twilio webhook rate limited", {
        requestId,
        familyId,
        phoneNumber,
        messageSid,
        remaining: rateLimitResult.remaining,
      });

      const retryAfterSeconds = Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000);
      const response = NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: "Too many webhook requests",
          retryAfter: rateLimitResult.resetAt.toISOString(),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": LIMIT_PER_WINDOW.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": rateLimitResult.resetAt.toISOString(),
            "Retry-After": retryAfterSeconds.toString(),
          },
        }
      );
      observeApiRequest({
        route: "/api/webhooks/twilio",
        method: "POST",
        status: 429,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Rate limit check passed - we'll add headers to success response below
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
        try {
          updateSmsDeliveryStatus({
            messageId: messageSid,
            status: mapTwilioStatusToDeliveryStatus(messageStatus),
            providerStatus: messageStatus,
            errorCode: params.ErrorCode,
            errorMessage: params.ErrorMessage,
          });
        } catch (error) {
          const errorLog = formatErrorLog(error, {
            requestId,
            messageSid,
            phoneNumber,
            eventType,
            operation: "update_sms_delivery_status",
          }, 500);
          logEvent("error", "Failed to update SMS delivery status", errorLog as unknown as Record<string, unknown>);
          throw error;
        }
      },
      requestId
    );
  } else if (eventType === "OptOutChange") {
    // Process opt-out change idempotently
    result = await processWebhookIdempotently(
      messageSid,
      phoneNumber,
      eventType,
      timestamp,
      params,
      async () => {
        // Task #59: Handle opt-out sync
        try {
          await handleOptOutSync(phoneNumber);
        } catch (error) {
          const errorLog = formatErrorLog(error, {
            requestId,
            messageSid,
            phoneNumber,
            eventType,
            operation: "handle_opt_out_sync",
          }, 500);
          logEvent("error", "Failed to handle opt-out sync", errorLog as unknown as Record<string, unknown>);
          throw error;
        }
      },
      requestId
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
          requestId,
        });
      },
      requestId
    );
  } else {
    // Unknown event type - skip processing but log
    const error = new Error(`Unknown event type: ${eventType}`);
    const errorLog = formatErrorLog(error, {
      requestId,
      eventType,
      messageSid,
      phoneNumber,
    }, 400);
    logEvent("warn", "Twilio webhook event type not explicitly handled", errorLog as unknown as Record<string, unknown>);
    result = { success: true, statusCode: 200, reason: "event_type_not_handled" };
  }

  // Return response based on result
  const statusCode = result.statusCode;

  // Add rate limit headers if we have rate limit data
  const responseHeaders: Record<string, string> = {};
  if (rateLimitResult) {
    responseHeaders["X-RateLimit-Limit"] = LIMIT_PER_WINDOW.toString();
    responseHeaders["X-RateLimit-Remaining"] = rateLimitResult.remaining.toString();
    responseHeaders["X-RateLimit-Reset"] = rateLimitResult.resetAt.toISOString();
  }

  const response = NextResponse.json(
    { ok: statusCode === 200, reason: result.reason },
    { status: statusCode, headers: responseHeaders }
  );
  observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: statusCode, durationMs: Date.now() - startedAt });
  return response;
}
