import { NextResponse } from "next/server";
import {
  mapTwilioStatusToDeliveryStatus,
  updateSmsDeliveryStatus,
  verifyTwilioWebhookSignature,
} from "@/lib/providers/sms";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

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

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  if (!authToken) {
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
  const messageStatus = params.MessageStatus;

  if (messageSid) {
    updateSmsDeliveryStatus({
      messageId: messageSid,
      status: mapTwilioStatusToDeliveryStatus(messageStatus),
      providerStatus: messageStatus,
      errorCode: params.ErrorCode,
      errorMessage: params.ErrorMessage,
    });
  }

  // Twilio expects a 2xx response to stop retries.
  const response = NextResponse.json({ ok: true }, { status: 200 });
  observeApiRequest({ route: "/api/webhooks/twilio", method: "POST", status: 200, durationMs: Date.now() - startedAt });
  return response;
}
