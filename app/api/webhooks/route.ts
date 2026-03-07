/**
 * POST /api/billing/webhook
 *
 * Stripe webhook handler for subscription and payment events.
 * Validates signatures, handles idempotency, and syncs subscription state.
 *
 * Events handled:
 * - checkout.session.completed — new subscription created
 * - customer.subscription.* — subscription state changes
 * - invoice.* — payment events (paid, payment_failed, etc.)
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyAndConstructStripeEvent, processStripeWebhookEvent } from "@/lib/stripe-billing";
import { observeApiRequest, observeApiException } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    // Get signature and body
    const signature = request.headers.get("stripe-signature");
    const body = await request.text();

    // Verify Stripe webhook signature
    let event: Stripe.Event;
    try {
      event = verifyAndConstructStripeEvent(body, signature);
    } catch (error) {
      const message = error instanceof Error ? error.message : "signature_verification_failed";
      logEvent("warn", "Stripe webhook signature verification failed", {
        requestId,
        error: message,
      });

      const response = NextResponse.json(
        { error: "invalid_signature", message },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/billing/webhook",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Log incoming event
    logEvent("info", "Stripe webhook received", {
      requestId,
      eventId: event.id,
      eventType: event.type,
    });

    // Process the event (idempotency built in via reserveWebhookEvent)
    const result = await processStripeWebhookEvent(event);

    if (result.duplicate) {
      logEvent("info", "Stripe webhook duplicate (already processed)", {
        requestId,
        eventId: event.id,
      });
    } else if (result.processed) {
      logEvent("info", "Stripe webhook processed successfully", {
        requestId,
        eventId: event.id,
        eventType: event.type,
      });
    }

    // Return success to Stripe (200 prevents retries)
    const response = NextResponse.json(
      { ok: true, duplicate: result.duplicate },
      { status: 200 }
    );
    observeApiRequest({
      route: "/api/billing/webhook",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    logEvent("error", "Stripe webhook processing error", {
      requestId,
      error: message,
    });

    observeApiException("/api/billing/webhook", "POST", error);

    // Return 500 to trigger Stripe retry
    const response = NextResponse.json(
      { error: "processing_failed", message },
      { status: 500 }
    );
    observeApiRequest({
      route: "/api/billing/webhook",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}

export async function GET(): Promise<NextResponse> {
  // Stripe docs recommend returning 400 for GET (webhook is POST-only)
  return NextResponse.json(
    { error: "method_not_allowed" },
    { status: 400 }
  );
}
