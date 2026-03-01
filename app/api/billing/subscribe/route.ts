/**
 * POST /api/billing/subscribe
 * 
 * Creates a subscription or returns a checkout URL for the user.
 * Uses Stripe Checkout for a secure payment flow.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib";
import { db } from "@/lib/persistence";
import { createCheckoutSession } from "@/lib/stripe-billing";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

interface SubscribeRequestBody {
  priceId?: string;
  successPath?: string;
  cancelPath?: string;
}

// Valid price IDs from environment
function getValidPriceIds(): string[] {
  const priceIds: string[] = [];
  if (process.env.STRIPE_PRICE_ESSENTIAL) priceIds.push(process.env.STRIPE_PRICE_ESSENTIAL);
  if (process.env.STRIPE_PRICE_PLUS) priceIds.push(process.env.STRIPE_PRICE_PLUS);
  if (process.env.STRIPE_PRICE_COMPLETE) priceIds.push(process.env.STRIPE_PRICE_COMPLETE);
  return priceIds;
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    // Require authentication
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      const response = NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
      observeApiRequest({
        route: "/api/billing/subscribe",
        method: "POST",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    const body: SubscribeRequestBody = await request.json().catch(() => ({}));
    const { priceId, successPath, cancelPath } = body;

    // Validate priceId
    if (!priceId || typeof priceId !== "string") {
      const response = NextResponse.json(
        { error: "missing_price_id", message: "Price ID is required" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/billing/subscribe",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Validate priceId is one of the configured plans
    const validPriceIds = getValidPriceIds();
    if (validPriceIds.length > 0 && !validPriceIds.includes(priceId)) {
      const response = NextResponse.json(
        { error: "invalid_price_id", message: "Invalid price ID" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/billing/subscribe",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Get user details
    const user = await db.users.findById(sessionUser.userId);
    if (!user) {
      const response = NextResponse.json(
        { error: "user_not_found", message: "User not found" },
        { status: 404 }
      );
      observeApiRequest({
        route: "/api/billing/subscribe",
        method: "POST",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Create checkout session
    const origin = new URL(request.url).origin;
    const checkoutUrl = await createCheckoutSession({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      priceId,
      requestOrigin: origin,
      successPath: successPath ?? "/billing/success",
      cancelPath: cancelPath ?? "/billing",
    });

    logEvent("info", "Subscription checkout created", {
      requestId,
      userId: user.id,
      priceId,
    });

    const response = NextResponse.json(
      { checkoutUrl },
      { status: 200 }
    );
    observeApiRequest({
      route: "/api/billing/subscribe",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    logEvent("error", "Subscribe endpoint error", {
      requestId,
      error: message,
    });

    // Handle Stripe-specific errors
    if (message.includes("Stripe integration disabled")) {
      const response = NextResponse.json(
        { error: "stripe_disabled", message: "Stripe integration is not configured" },
        { status: 503 }
      );
      observeApiRequest({
        route: "/api/billing/subscribe",
        method: "POST",
        status: 503,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    const response = NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
    observeApiRequest({
      route: "/api/billing/subscribe",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}
