/**
 * POST /api/billing/payment-methods/{id}/set-default
 * DELETE /api/billing/payment-methods/{id}
 *
 * POST: Set a payment method as default
 * DELETE: Soft-delete a payment method
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { observeApiRequest, observeApiException } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const resolvedParams = await params;
  const startedAt = Date.now();

  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      observeApiRequest({
        route: "/api/billing/payment-methods/[id]/set-default",
        method: "POST",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const stripeCustomer = await db.stripeCustomers.findByUserId(sessionUser.userId);
    if (!stripeCustomer) {
      observeApiRequest({
        route: "/api/billing/payment-methods/[id]/set-default",
        method: "POST",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "not_found", message: "No customer record" }, { status: 404 });
    }

    const method = await db.paymentMethods.findByCustomer(stripeCustomer.id);
    const methodExists = method.some((m) => m.id === resolvedParams.id);

    if (!methodExists) {
      observeApiRequest({
        route: "/api/billing/payment-methods/[id]/set-default",
        method: "POST",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "forbidden", message: "Payment method not owned by user" },
        { status: 403 }
      );
    }

    await db.paymentMethods.setDefault(resolvedParams.id, stripeCustomer.id);

    logEvent("info", "Payment method set as default", {
      customerId: stripeCustomer.id,
      methodId: resolvedParams.id,
    });

    observeApiRequest({
      route: "/api/billing/payment-methods/[id]/set-default",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    observeApiException("/api/billing/payment-methods/[id]/set-default", "POST", error);
    logEvent("error", "Set default payment method error", {
      methodId: resolvedParams.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({
      route: "/api/billing/payment-methods/[id]/set-default",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now();
  const resolvedParams = await params;

  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      observeApiRequest({
        route: "/api/billing/payment-methods/[id]",
        method: "DELETE",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const stripeCustomer = await db.stripeCustomers.findByUserId(sessionUser.userId);
    if (!stripeCustomer) {
      observeApiRequest({
        route: "/api/billing/payment-methods/[id]",
        method: "DELETE",
        status: 404,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "not_found", message: "No customer record" }, { status: 404 });
    }

    const methods = await db.paymentMethods.findByCustomer(stripeCustomer.id);
    const method = methods.find((m) => m.id === resolvedParams.id);

    if (!method) {
      observeApiRequest({
        route: "/api/billing/payment-methods/[id]",
        method: "DELETE",
        status: 403,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "forbidden", message: "Payment method not owned by user" },
        { status: 403 }
      );
    }

    const activeCount = methods.filter((m) => !m.isDeleted).length;

    if (activeCount <= 1) {
      observeApiRequest({
        route: "/api/billing/payment-methods/[id]",
        method: "DELETE",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        {
          error: "cannot_delete_last_method",
          message: "At least one payment method required",
        },
        { status: 400 }
      );
    }

    await db.paymentMethods.softDelete(resolvedParams.id);

    logEvent("info", "Payment method deleted", {
      customerId: stripeCustomer.id,
      methodId: resolvedParams.id,
    });

    observeApiRequest({
      route: "/api/billing/payment-methods/[id]",
      method: "DELETE",
      status: 204,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ success: true }, { status: 204 });
  } catch (error) {
    observeApiException("/api/billing/payment-methods/[id]", "DELETE", error);
    logEvent("error", "Delete payment method error", {
      methodId: resolvedParams.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    observeApiRequest({
      route: "/api/billing/payment-methods/[id]",
      method: "DELETE",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
