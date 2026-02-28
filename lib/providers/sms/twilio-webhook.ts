/**
 * KidSchedule – Twilio Webhook Signature Verification
 *
 * Verifies X-Twilio-Signature for inbound Twilio webhooks.
 */

import crypto from "crypto";

function buildSignaturePayload(url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  let payload = url;

  for (const key of sortedKeys) {
    payload += key + (params[key] ?? "");
  }

  return payload;
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function computeTwilioWebhookSignature(input: {
  authToken: string;
  url: string;
  params: Record<string, string>;
}): string {
  const payload = buildSignaturePayload(input.url, input.params);

  return crypto
    .createHmac("sha1", input.authToken)
    .update(payload, "utf8")
    .digest("base64");
}

export function verifyTwilioWebhookSignature(input: {
  authToken: string;
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!input.signature || !input.authToken) {
    return false;
  }

  const computed = computeTwilioWebhookSignature({
    authToken: input.authToken,
    url: input.url,
    params: input.params,
  });

  return constantTimeEquals(computed, input.signature);
}

export function mapTwilioStatusToDeliveryStatus(
  twilioStatus?: string
): "queued" | "accepted" | "sending" | "sent" | "delivered" | "undelivered" | "failed" | "unknown" {
  switch ((twilioStatus ?? "").toLowerCase()) {
    case "queued":
      return "queued";
    case "accepted":
      return "accepted";
    case "sending":
      return "sending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}
