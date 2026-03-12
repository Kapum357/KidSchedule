/**
 * GET /api/billing/payment-methods
 *
 * Returns the authenticated user's payment methods.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { observeApiRequest, observeApiException } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      observeApiRequest({
        route: "/api/billing/payment-methods",
        method: "GET",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const stripeCustomer = await db.stripeCustomers.findByUserId(sessionUser.userId);
    if (!stripeCustomer) {
      observeApiRequest({
        route: "/api/billing/payment-methods",
        method: "GET",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "not_found", message: "No customer record" }, { status: 404 });
    }

    const methods = await db.paymentMethods.findByCustomer(stripeCustomer.id);

    observeApiRequest({
      route: "/api/billing/payment-methods",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        methods: methods.map((m) => ({
          id: m.id,
          brand: m.brand,
          last4: m.last4,
          expiry: m.expMonth && m.expYear ? `${m.expMonth}/${m.expYear}` : undefined,
          isDefault: m.isDefault,
          createdAt: m.createdAt,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    observeApiException("/api/billing/payment-methods", "GET", error);
    logEvent("error", "Payment methods GET error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({
      route: "/api/billing/payment-methods",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
