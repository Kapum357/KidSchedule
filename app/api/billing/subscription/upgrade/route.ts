import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createProratedUpgrade } from "@/lib/billing/stripe-billing";
import { observeApiException, observeApiRequest } from "@/lib/observability/api-observability";

interface UpgradeRequestBody {
  newPriceId?: string;
  quantity?: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      const response = NextResponse.json({ error: "unauthorized" }, { status: 401 });
      observeApiRequest({ route: "/api/billing/subscription/upgrade", method: "POST", status: 401, durationMs: Date.now() - startedAt });
      return response;
    }

    const body = (await request.json().catch(() => ({}))) as UpgradeRequestBody;
    if (!body.newPriceId) {
      const response = NextResponse.json({ error: "new_price_id_required" }, { status: 400 });
      observeApiRequest({ route: "/api/billing/subscription/upgrade", method: "POST", status: 400, durationMs: Date.now() - startedAt });
      return response;
    }

    const result = await createProratedUpgrade({
      userId: sessionUser.userId,
      newPriceId: body.newPriceId,
      quantity: body.quantity,
    });

    const response = NextResponse.json({
      ok: true,
      subscriptionId: result.subscriptionId,
      status: result.status,
      prorationBehavior: result.prorationBehavior,
    });
    observeApiRequest({ route: "/api/billing/subscription/upgrade", method: "POST", status: 200, durationMs: Date.now() - startedAt });
    return response;
  } catch (error) {
    observeApiException("/api/billing/subscription/upgrade", "POST", error);
    const response = NextResponse.json({ error: "internal_server_error" }, { status: 500 });
    observeApiRequest({ route: "/api/billing/subscription/upgrade", method: "POST", status: 500, durationMs: Date.now() - startedAt });
    return response;
  }
}
