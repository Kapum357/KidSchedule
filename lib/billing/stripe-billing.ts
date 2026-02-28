import Stripe from "stripe";
import { sql } from "@/lib/persistence/postgres";

type PlanTier = "essential" | "plus" | "complete";
type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete" | "trialing";
type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";

type UserRecord = {
  id: string;
  email: string;
  fullName: string;
};

type StripeCustomerRow = {
  stripeCustomerId: string;
};

type UserByStripeCustomerRow = {
  userId: string;
};

type SubscriptionLookupRow = {
  id: string;
  stripeSubscriptionId: string;
};

let cachedStripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (cachedStripeClient) {
    return cachedStripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  cachedStripeClient = new Stripe(secretKey);
  return cachedStripeClient;
}

function isStripeEnabled(): boolean {
  const toggle = process.env.STRIPE_ENABLED;
  if (toggle === "false") {
    return false;
  }

  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function deriveAppBaseUrl(requestOrigin?: string): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    requestOrigin;

  if (!configured) {
    return "http://localhost:3000";
  }

  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

function priceIdToPlanTier(priceId: string): PlanTier {
  if (priceId === process.env.STRIPE_PRICE_COMPLETE) {
    return "complete";
  }
  if (priceId === process.env.STRIPE_PRICE_PLUS) {
    return "plus";
  }

  return "essential";
}

function normalizeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "trialing") return "trialing";
  return "incomplete";
}

function normalizeInvoiceStatus(status: Stripe.Invoice.Status | null): InvoiceStatus {
  if (status === "paid") return "paid";
  if (status === "void") return "void";
  if (status === "uncollectible") return "uncollectible";
  if (status === "open") return "open";
  return "draft";
}

async function findUserByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
  const rows = await sql<UserByStripeCustomerRow[]>`
    SELECT user_id
    FROM stripe_customers
    WHERE stripe_customer_id = ${stripeCustomerId}
    LIMIT 1
  `;

  return rows[0]?.userId ?? null;
}

async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = String(subscription.customer ?? "");
  if (!stripeCustomerId) {
    return;
  }

  const userId = await findUserByStripeCustomerId(stripeCustomerId);
  if (!userId) {
    return;
  }

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price?.id ?? "";
  const metadataTier =
    firstItem?.price?.metadata?.plan_tier ??
    firstItem?.price?.metadata?.planTier ??
    subscription.metadata?.plan_tier ??
    subscription.metadata?.planTier;

  const planTier: PlanTier =
    metadataTier === "plus" || metadataTier === "complete" || metadataTier === "essential"
      ? metadataTier
      : priceIdToPlanTier(priceId);

  const subscriptionWithPeriods = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const currentPeriodStart = subscriptionWithPeriods.current_period_start ?? Math.floor(Date.now() / 1000);
  const currentPeriodEnd = subscriptionWithPeriods.current_period_end ?? currentPeriodStart;

  await sql`
    INSERT INTO subscriptions (
      user_id,
      stripe_subscription_id,
      stripe_customer_id,
      plan_tier,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      created_at,
      updated_at
    ) VALUES (
      ${userId},
      ${subscription.id},
      ${stripeCustomerId},
      ${planTier},
      ${normalizeSubscriptionStatus(subscription.status)},
      ${new Date(currentPeriodStart * 1000)},
      ${new Date(currentPeriodEnd * 1000)},
      ${subscription.cancel_at_period_end},
      NOW(),
      NOW()
    )
    ON CONFLICT (stripe_subscription_id)
    DO UPDATE SET
      plan_tier = EXCLUDED.plan_tier,
      status = EXCLUDED.status,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      updated_at = NOW()
  `;
}

async function upsertInvoiceFromStripe(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = String(invoice.customer ?? "");
  if (!stripeCustomerId) {
    return;
  }

  const userId = await findUserByStripeCustomerId(stripeCustomerId);
  if (!userId) {
    return;
  }

  const invoiceWithSubscription = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    parent?: {
      subscription_details?: {
        subscription?: string | null;
      } | null;
    } | null;
  };

  let subscriptionId: string | null = null;
  const stripeSubscriptionId =
    typeof invoiceWithSubscription.subscription === "string"
      ? invoiceWithSubscription.subscription
      : invoiceWithSubscription.subscription?.id ??
        invoiceWithSubscription.parent?.subscription_details?.subscription ??
        null;

  if (stripeSubscriptionId) {
    const subscriptionRows = await sql<SubscriptionLookupRow[]>`
      SELECT id, stripe_subscription_id
      FROM subscriptions
      WHERE stripe_subscription_id = ${stripeSubscriptionId}
      LIMIT 1
    `;
    subscriptionId = subscriptionRows[0]?.id ?? null;
  }

  await sql`
    INSERT INTO invoices (
      user_id,
      stripe_invoice_id,
      subscription_id,
      amount_due,
      amount_paid,
      status,
      invoice_pdf,
      due_date,
      paid_at,
      created_at
    ) VALUES (
      ${userId},
      ${invoice.id},
      ${subscriptionId},
      ${invoice.amount_due ?? 0},
      ${invoice.amount_paid ?? 0},
      ${normalizeInvoiceStatus(invoice.status)},
      ${invoice.invoice_pdf ?? null},
      ${invoice.due_date ? new Date(invoice.due_date * 1000) : null},
      ${invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null},
      NOW()
    )
    ON CONFLICT (stripe_invoice_id)
    DO UPDATE SET
      amount_due = EXCLUDED.amount_due,
      amount_paid = EXCLUDED.amount_paid,
      status = EXCLUDED.status,
      invoice_pdf = EXCLUDED.invoice_pdf,
      due_date = EXCLUDED.due_date,
      paid_at = EXCLUDED.paid_at
  `;
}

export async function createStripeCustomerForUser(input: {
  userId: string;
  email: string;
  fullName: string;
}): Promise<string | null> {
  if (!isStripeEnabled()) {
    return null;
  }

  const existing = await sql<StripeCustomerRow[]>`
    SELECT stripe_customer_id
    FROM stripe_customers
    WHERE user_id = ${input.userId}
    LIMIT 1
  `;

  if (existing[0]?.stripeCustomerId) {
    return existing[0].stripeCustomerId;
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: input.email,
    name: input.fullName,
    metadata: {
      userId: input.userId,
    },
  });

  await sql`
    INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at)
    VALUES (${input.userId}, ${customer.id}, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id
  `;

  return customer.id;
}

export async function createCheckoutSession(input: {
  user: UserRecord;
  priceId: string;
  requestOrigin?: string;
  successPath?: string;
  cancelPath?: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const customerId = await createStripeCustomerForUser({
    userId: input.user.id,
    email: input.user.email,
    fullName: input.user.fullName,
  });

  if (!customerId) {
    throw new Error("Stripe integration disabled");
  }

  const baseUrl = deriveAppBaseUrl(input.requestOrigin);
  const successUrl = `${baseUrl}${input.successPath ?? "/billing/success"}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}${input.cancelPath ?? "/billing"}`;
  const planTier = priceIdToPlanTier(input.priceId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.user.id,
    line_items: [{
      price: input.priceId,
      quantity: 1,
    }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: input.user.id,
      planTier,
    },
    subscription_data: {
      metadata: {
        userId: input.user.id,
        planTier,
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe checkout session did not return a redirect URL");
  }

  return session.url;
}

export async function createBillingPortalSession(input: {
  user: UserRecord;
  requestOrigin?: string;
  returnPath?: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const customerId = await createStripeCustomerForUser({
    userId: input.user.id,
    email: input.user.email,
    fullName: input.user.fullName,
  });

  if (!customerId) {
    throw new Error("Stripe integration disabled");
  }

  const baseUrl = deriveAppBaseUrl(input.requestOrigin);
  const returnUrl = `${baseUrl}${input.returnPath ?? "/billing"}`;

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return portal.url;
}

export async function createProratedUpgrade(input: {
  userId: string;
  newPriceId: string;
  quantity?: number;
}): Promise<{ subscriptionId: string; status: string; prorationBehavior: "create_prorations" }> {
  const stripe = getStripeClient();

  const rows = await sql<SubscriptionLookupRow[]>`
    SELECT id, stripe_subscription_id
    FROM subscriptions
    WHERE user_id = ${input.userId}
      AND status IN ('active', 'trialing', 'past_due')
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  const subscription = rows[0];
  if (!subscription) {
    throw new Error("No active subscription found for user");
  }

  const current = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
  const existingItem = current.items.data[0];

  if (!existingItem?.id) {
    throw new Error("Subscription has no updatable items");
  }

  const updated = await stripe.subscriptions.update(current.id, {
    proration_behavior: "create_prorations",
    items: [
      {
        id: existingItem.id,
        price: input.newPriceId,
        quantity: input.quantity ?? 1,
      },
    ],
  });

  await upsertSubscriptionFromStripe(updated);

  return {
    subscriptionId: updated.id,
    status: updated.status,
    prorationBehavior: "create_prorations",
  };
}

export function verifyAndConstructStripeEvent(payload: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }

  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

async function markWebhookProcessed(stripeEventId: string): Promise<void> {
  await sql`
    UPDATE webhook_events
    SET processed = TRUE, processed_at = NOW(), error = NULL
    WHERE stripe_event_id = ${stripeEventId}
  `;
}

async function markWebhookError(stripeEventId: string, errorMessage: string): Promise<void> {
  await sql`
    UPDATE webhook_events
    SET processed = FALSE, error = ${errorMessage}
    WHERE stripe_event_id = ${stripeEventId}
  `;
}

async function reserveWebhookEvent(event: Stripe.Event): Promise<boolean> {
  const rows = await sql<{ stripeEventId: string }[]>`
    INSERT INTO webhook_events (stripe_event_id, event_type, payload, processed, created_at)
    VALUES (${event.id}, ${event.type}, ${JSON.stringify(event)}, FALSE, NOW())
    ON CONFLICT (stripe_event_id) DO NOTHING
    RETURNING stripe_event_id
  `;

  return Boolean(rows[0]?.stripeEventId);
}

export async function processStripeWebhookEvent(event: Stripe.Event): Promise<{
  processed: boolean;
  duplicate: boolean;
}> {
  const reserved = await reserveWebhookEvent(event);
  if (!reserved) {
    return { processed: false, duplicate: true };
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (subscriptionId) {
        const stripe = getStripeClient();
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscriptionFromStripe(subscription);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
    }

    if (event.type === "invoice.finalized" || event.type === "invoice.paid") {
      await upsertInvoiceFromStripe(event.data.object as Stripe.Invoice);
    }

    await markWebhookProcessed(event.id);
    return { processed: true, duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_webhook_processing_error";
    await markWebhookError(event.id, message);
    throw error;
  }
}