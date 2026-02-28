import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/persistence";
import { createBillingPortalSession } from "@/lib/billing/stripe-billing";
import { observeApiException, observeApiRequest } from "@/lib/observability/api-observability";

interface PortalRequestBody {
  returnPath?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      const response = NextResponse.json({ error: "unauthorized" }, { status: 401 });
      observeApiRequest({ route: "/api/billing/portal", method: "POST", status: 401, durationMs: Date.now() - startedAt });
      return response;
    }

    const body = (await request.json().catch(() => ({}))) as PortalRequestBody;
    const user = await db.users.findById(sessionUser.userId);
    if (!user) {
      const response = NextResponse.json({ error: "user_not_found" }, { status: 404 });
      observeApiRequest({ route: "/api/billing/portal", method: "POST", status: 404, durationMs: Date.now() - startedAt });
      return response;
    }

    const origin = new URL(request.url).origin;
    const portalUrl = await createBillingPortalSession({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      requestOrigin: origin,
      returnPath: body.returnPath,
    });

    const response = NextResponse.redirect(portalUrl, { status: 303 });
    observeApiRequest({ route: "/api/billing/portal", method: "POST", status: 303, durationMs: Date.now() - startedAt });
    return response;
  } catch (error) {
    observeApiException("/api/billing/portal", "POST", error);
    const response = NextResponse.json({ error: "internal_server_error" }, { status: 500 });
    observeApiRequest({ route: "/api/billing/portal", method: "POST", status: 500, durationMs: Date.now() - startedAt });
    return response;
  }
}
