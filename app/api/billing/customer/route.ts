/**
 * POST /api/billing/customer
 * 
 * Creates or retrieves a Stripe customer for a user.
 * Used to ensure a user has a Stripe customer ID before subscription operations.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib";
import { db } from "@/lib/persistence";
import { createStripeCustomerForUser } from "@/lib/stripe-billing";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

interface CustomerRequestBody {
  userId?: string;
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
        route: "/api/billing/customer",
        method: "POST",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    const body: CustomerRequestBody = await request.json().catch(() => ({}));
    
    // If userId is provided, validate it matches the authenticated user
    // (prevents creating customers for other users)
    const targetUserId = body.userId ?? sessionUser.userId;
    if (targetUserId !== sessionUser.userId) {
      const response = NextResponse.json(
        { error: "forbidden", message: "Cannot create customer for another user" },
        { status: 403 }
      );
      observeApiRequest({
        route: "/api/billing/customer",
        method: "POST",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Get user details
    const user = await db.users.findById(targetUserId);
    if (!user) {
      const response = NextResponse.json(
        { error: "user_not_found", message: "User not found" },
        { status: 404 }
      );
      observeApiRequest({
        route: "/api/billing/customer",
        method: "POST",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Create or retrieve Stripe customer
    const stripeCustomerId = await createStripeCustomerForUser({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
    });

    if (!stripeCustomerId) {
      logEvent("warn", "Stripe integration disabled", {
        requestId,
        userId: user.id,
      });

      const response = NextResponse.json(
        { error: "stripe_disabled", message: "Stripe integration is not configured" },
        { status: 503 }
      );
      observeApiRequest({
        route: "/api/billing/customer",
        method: "POST",
        status: 503,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    logEvent("info", "Stripe customer created/retrieved", {
      requestId,
      userId: user.id,
      stripeCustomerId,
    });

    const response = NextResponse.json(
      { stripeCustomerId },
      { status: 200 }
    );
    observeApiRequest({
      route: "/api/billing/customer",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logEvent("error", "Billing customer endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    const response = NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
    observeApiRequest({
      route: "/api/billing/customer",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}
