import { NextResponse } from "next/server";
import {
  processStripeWebhookEvent,
  verifyAndConstructStripeEvent,
} from "@/lib/billing/stripe-billing";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = verifyAndConstructStripeEvent(payload, signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_stripe_signature";
    const response = NextResponse.json({ error: message }, { status: 400 });
    observeApiRequest({ route: "/api/webhooks/stripe", method: "POST", status: 400, durationMs: Date.now() - startedAt });
    return response;
  }

  try {
    const result = await processStripeWebhookEvent(event);
    const response = NextResponse.json({ ok: true, duplicate: result.duplicate }, { status: 200 });
    observeApiRequest({ route: "/api/webhooks/stripe", method: "POST", status: 200, durationMs: Date.now() - startedAt });
    return response;
  } catch (error) {
    logEvent("error", "Stripe webhook processing failed", {
      route: "/api/webhooks/stripe",
      error,
    });
    const response = NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
    observeApiRequest({ route: "/api/webhooks/stripe", method: "POST", status: 500, durationMs: Date.now() - startedAt });
    return response;
  }
}
