/**
 * GET /api/billing/status
 *
 * Returns the authenticated user's current subscription status and plan.
 * Returns null if no active subscription.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib";
import { db } from "@/lib/persistence";
import { observeApiRequest, observeApiException } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

interface SubscriptionStatus {
  planTier: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialStart?: string;
  trialEnd?: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    // Authenticate user
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      const response = NextResponse.json(
        { error: "unauthorized" },
        { status: 401 }
      );
      observeApiRequest({
        route: "/api/billing/status",
        method: "GET",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Look up Stripe customer for user
    const stripeCustomer = await db.stripeCustomers.findByUserId(sessionUser.userId);
    if (!stripeCustomer) {
      // No Stripe customer, so no active subscription
      const response = NextResponse.json(
        { subscription: null } as { subscription: null },
        { status: 200 }
      );
      observeApiRequest({
        route: "/api/billing/status",
        method: "GET",
        status: 200,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Look up active subscription for customer
    const subscriptions = await db.subscriptions.findByCustomer(stripeCustomer.id);

    if (!subscriptions) {
      // No active subscription
      const response = NextResponse.json(
        { subscription: null } as { subscription: null },
        { status: 200 }
      );
      observeApiRequest({
        route: "/api/billing/status",
        method: "GET",
        status: 200,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    const status: SubscriptionStatus = {
      planTier: subscriptions.planTier,
      status: subscriptions.status,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      trialStart: subscriptions.trialStart,
      trialEnd: subscriptions.trialEnd,
    };

    const response = NextResponse.json(
      { subscription: status },
      { status: 200 }
    );

    observeApiRequest({
      route: "/api/billing/status",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    observeApiException("/api/billing/status", "GET", error);

    logEvent("error", "Billing status endpoint error", {
      error: error instanceof Error ? error.message : "unknown",
    });

    const response = NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 }
    );

    observeApiRequest({
      route: "/api/billing/status",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return response;
  }
}
