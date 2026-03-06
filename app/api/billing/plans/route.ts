/**
 * GET /api/billing/plans
 *
 * Returns all active pricing plans from the database.
 * Used by the pricing page to display current plan tiers.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import { observeApiRequest, observeApiException } from "@/lib/observability/api-observability";

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    const plans = await db.planTiers.findAll();

    const response = NextResponse.json(
      {
        plans: plans.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          monthlyPriceCents: p.monthlyPriceCents,
          annualPriceCents: p.annualPriceCents,
          features: p.features,
          maxChildren: p.maxChildren,
          maxDocuments: p.maxDocuments,
          stripePriceId: p.stripePriceId,
        })),
      },
      { status: 200 }
    );

    observeApiRequest({
      route: "/api/billing/plans",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    observeApiException("/api/billing/plans", "GET", error);

    const response = NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 }
    );

    observeApiRequest({
      route: "/api/billing/plans",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return response;
  }
}
