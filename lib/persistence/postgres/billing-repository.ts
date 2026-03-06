/**
 * Billing Repository (BILL-001)
 *
 * Manages Stripe customers, payment methods, subscriptions,
 * invoices, and webhook event processing.
 */

import type {
  DbStripeCustomer,
  DbPaymentMethod,
  DbSubscription,
  DbInvoice,
  DbWebhookEvent,
  DbPlanTier,
  SubscriptionStatus,
  InvoiceStatus,
} from "../types";
import { sql, type SqlClient } from "./client";

// ─── Stripe Customer Repository ───────────────────────────────────────────────

export interface StripeCustomerRepository {
  findByUserId(userId: string): Promise<DbStripeCustomer | null>;
  findByStripeId(stripeCustomerId: string): Promise<DbStripeCustomer | null>;
  create(data: Omit<DbStripeCustomer, "id" | "createdAt" | "updatedAt">): Promise<DbStripeCustomer>;
  update(id: string, data: Partial<DbStripeCustomer>): Promise<DbStripeCustomer | null>;
}

// ─── Payment Method Repository ────────────────────────────────────────────────

export interface PaymentMethodRepository {
  findByCustomer(stripeCustomerLocalId: string): Promise<DbPaymentMethod[]>;
  findDefault(stripeCustomerLocalId: string): Promise<DbPaymentMethod | null>;
  findByStripeId(stripePaymentMethodId: string): Promise<DbPaymentMethod | null>;
  create(data: Omit<DbPaymentMethod, "id" | "createdAt" | "updatedAt">): Promise<DbPaymentMethod>;
  setDefault(id: string, stripeCustomerLocalId: string): Promise<void>;
  softDelete(id: string): Promise<void>;
}

// ─── Subscription Repository ──────────────────────────────────────────────────

export interface SubscriptionRepository {
  findByCustomer(stripeCustomerLocalId: string): Promise<DbSubscription | null>;
  findByStripeId(stripeSubscriptionId: string): Promise<DbSubscription | null>;
  findActive(stripeCustomerLocalId: string): Promise<DbSubscription | null>;
  create(data: Omit<DbSubscription, "id" | "createdAt" | "updatedAt">): Promise<DbSubscription>;
  update(id: string, data: Partial<DbSubscription>): Promise<DbSubscription | null>;
}

// ─── Invoice Repository ───────────────────────────────────────────────────────

export interface InvoiceRepository {
  findByCustomer(stripeCustomerLocalId: string, limit?: number): Promise<DbInvoice[]>;
  findByStripeId(stripeInvoiceId: string): Promise<DbInvoice | null>;
  findBySubscription(subscriptionId: string): Promise<DbInvoice[]>;
  findOpen(stripeCustomerLocalId: string): Promise<DbInvoice[]>;
  upsert(data: Omit<DbInvoice, "id" | "createdAt" | "updatedAt">): Promise<DbInvoice>;
}

// ─── Webhook Event Repository ─────────────────────────────────────────────────

export interface WebhookEventRepository {
  findByStripeEventId(stripeEventId: string): Promise<DbWebhookEvent | null>;
  createIfNotExists(data: Omit<DbWebhookEvent, "id" | "createdAt">): Promise<{ event: DbWebhookEvent; alreadyProcessed: boolean }>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  findUnprocessed(limit?: number): Promise<DbWebhookEvent[]>;
}

// ─── Plan Tier Repository ─────────────────────────────────────────────────────

export interface PlanTierRepository {
  findAll(): Promise<DbPlanTier[]>;
  findById(id: string): Promise<DbPlanTier | null>;
}

// ─── Implementations ──────────────────────────────────────────────────────────

type CustomerRow = {
  id: string; user_id: string; stripe_customer_id: string;
  email: string; name: string | null; currency: string;
  created_at: Date; updated_at: Date;
};

function customerRowToDb(r: CustomerRow): DbStripeCustomer {
  return {
    id: r.id, userId: r.user_id, stripeCustomerId: r.stripe_customer_id,
    email: r.email, name: r.name ?? undefined, currency: r.currency,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export function createStripeCustomerRepository(tx?: SqlClient): StripeCustomerRepository {
  const q: SqlClient = tx ?? sql;

  return {
    async findByUserId(userId) {
      const rows = await q<CustomerRow[]>`SELECT * FROM stripe_customers WHERE user_id = ${userId} LIMIT 1`;
      return rows[0] ? customerRowToDb(rows[0]) : null;
    },
    async findByStripeId(stripeCustomerId) {
      const rows = await q<CustomerRow[]>`SELECT * FROM stripe_customers WHERE stripe_customer_id = ${stripeCustomerId} LIMIT 1`;
      return rows[0] ? customerRowToDb(rows[0]) : null;
    },
    async create(data) {
      const rows = await q<CustomerRow[]>`
        INSERT INTO stripe_customers (user_id, stripe_customer_id, email, name, currency)
        VALUES (${data.userId}, ${data.stripeCustomerId}, ${data.email}, ${data.name || null}, ${data.currency})
        RETURNING *
      `;
      return customerRowToDb(rows[0]);
    },
    async update(id, data) {
      if (data.name !== undefined) {
        const rows = await q<CustomerRow[]>`
          UPDATE stripe_customers SET name = ${data.name}, updated_at = NOW()
          WHERE id = ${id} RETURNING *
        `;
        return rows[0] ? customerRowToDb(rows[0]) : null;
      }
      const rows = await q<CustomerRow[]>`SELECT * FROM stripe_customers WHERE id = ${id} LIMIT 1`;
      return rows[0] ? customerRowToDb(rows[0]) : null;
    },
  };
}

// ─── Subscription impl ────────────────────────────────────────────────────────

type SubscriptionRow = {
  id: string; stripe_customer_id: string; stripe_subscription_id: string;
  stripe_price_id: string; plan_tier: string; status: string;
  current_period_start: Date; current_period_end: Date; cancel_at_period_end: boolean;
  canceled_at: Date | null; cancel_at: Date | null; trial_start: Date | null; trial_end: Date | null;
  quantity: number; metadata: Record<string, unknown>; created_at: Date; updated_at: Date;
};

function subscriptionRowToDb(r: SubscriptionRow): DbSubscription {
  return {
    id: r.id, stripeCustomerId: r.stripe_customer_id, stripeSubscriptionId: r.stripe_subscription_id,
    stripePriceId: r.stripe_price_id, planTier: r.plan_tier, status: r.status as SubscriptionStatus,
    currentPeriodStart: r.current_period_start.toISOString(), currentPeriodEnd: r.current_period_end.toISOString(),
    cancelAtPeriodEnd: r.cancel_at_period_end,
    canceledAt: r.canceled_at?.toISOString(), cancelAt: r.cancel_at?.toISOString(),
    trialStart: r.trial_start?.toISOString(), trialEnd: r.trial_end?.toISOString(),
    quantity: r.quantity, metadata: r.metadata,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export function createSubscriptionRepository(tx?: SqlClient): SubscriptionRepository {
  const q: SqlClient = tx ?? sql;

  return {
    async findByCustomer(stripeCustomerLocalId) {
      const rows = await q<SubscriptionRow[]>`
        SELECT * FROM subscriptions WHERE stripe_customer_id = ${stripeCustomerLocalId}
        ORDER BY created_at DESC LIMIT 1
      `;
      return rows[0] ? subscriptionRowToDb(rows[0]) : null;
    },
    async findByStripeId(stripeSubscriptionId) {
      const rows = await q<SubscriptionRow[]>`
        SELECT * FROM subscriptions WHERE stripe_subscription_id = ${stripeSubscriptionId} LIMIT 1
      `;
      return rows[0] ? subscriptionRowToDb(rows[0]) : null;
    },
    async findActive(stripeCustomerLocalId) {
      const rows = await q<SubscriptionRow[]>`
        SELECT * FROM subscriptions
        WHERE stripe_customer_id = ${stripeCustomerLocalId}
          AND status IN ('active', 'trialing')
        ORDER BY created_at DESC LIMIT 1
      `;
      return rows[0] ? subscriptionRowToDb(rows[0]) : null;
    },
    async create(data) {
      const rows = await q<SubscriptionRow[]>`
        INSERT INTO subscriptions (
          stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_tier,
          status, current_period_start, current_period_end, cancel_at_period_end,
          trial_start, trial_end, quantity, metadata
        ) VALUES (
          ${data.stripeCustomerId}, ${data.stripeSubscriptionId}, ${data.stripePriceId}, ${data.planTier},
          ${data.status}, ${data.currentPeriodStart}, ${data.currentPeriodEnd}, ${data.cancelAtPeriodEnd},
          ${data.trialStart || null}, ${data.trialEnd || null}, ${data.quantity}, ${JSON.stringify(data.metadata)}
        ) RETURNING *
      `;
      return subscriptionRowToDb(rows[0]);
    },
    async update(id, data) {
      const rows = await q<SubscriptionRow[]>`
        UPDATE subscriptions
        SET
          status = COALESCE(${data.status || null}, status),
          current_period_start = COALESCE(${data.currentPeriodStart || null}, current_period_start),
          current_period_end = COALESCE(${data.currentPeriodEnd || null}, current_period_end),
          cancel_at_period_end = COALESCE(${data.cancelAtPeriodEnd ?? null}, cancel_at_period_end),
          canceled_at = COALESCE(${data.canceledAt || null}, canceled_at),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] ? subscriptionRowToDb(rows[0]) : null;
    },
  };
}

// ─── Webhook Event impl ───────────────────────────────────────────────────────

type WebhookRow = {
  id: string; stripe_event_id: string; type: string; api_version: string | null;
  payload: Record<string, unknown>; processed_at: Date | null; processing_error: string | null;
  retry_count: number; created_at: Date;
};

function webhookRowToDb(r: WebhookRow): DbWebhookEvent {
  return {
    id: r.id, stripeEventId: r.stripe_event_id, type: r.type,
    apiVersion: r.api_version ?? undefined, payload: r.payload,
    processedAt: r.processed_at?.toISOString(), processingError: r.processing_error ?? undefined,
    retryCount: r.retry_count, createdAt: r.created_at.toISOString(),
  };
}

export function createWebhookEventRepository(tx?: SqlClient): WebhookEventRepository {
  const q: SqlClient = tx ?? sql;

  return {
    async findByStripeEventId(stripeEventId) {
      const rows = await q<WebhookRow[]>`
        SELECT * FROM webhook_events WHERE stripe_event_id = ${stripeEventId} LIMIT 1
      `;
      return rows[0] ? webhookRowToDb(rows[0]) : null;
    },
    async createIfNotExists(data) {
      // Use INSERT ... ON CONFLICT DO NOTHING for idempotency
      const rows = await q<WebhookRow[]>`
        INSERT INTO webhook_events (stripe_event_id, type, api_version, payload, retry_count)
        VALUES (${data.stripeEventId}, ${data.type}, ${data.apiVersion || null}, ${JSON.stringify(data.payload)}, 0)
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING *
      `;
      if (rows[0]) {
        return { event: webhookRowToDb(rows[0]), alreadyProcessed: false };
      }
      // Already existed — fetch and return
      const existing = await q<WebhookRow[]>`
        SELECT * FROM webhook_events WHERE stripe_event_id = ${data.stripeEventId} LIMIT 1
      `;
      return {
        event: webhookRowToDb(existing[0]),
        alreadyProcessed: existing[0].processed_at !== null,
      };
    },
    async markProcessed(id) {
      await q`UPDATE webhook_events SET processed_at = NOW() WHERE id = ${id}`;
    },
    async markFailed(id, error) {
      await q`
        UPDATE webhook_events
        SET processing_error = ${error}, retry_count = retry_count + 1
        WHERE id = ${id}
      `;
    },
    async findUnprocessed(limit = 50) {
      const rows = await q<WebhookRow[]>`
        SELECT * FROM webhook_events
        WHERE processed_at IS NULL
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;
      return rows.map(webhookRowToDb);
    },
  };
}

// ─── Plan Tier impl ───────────────────────────────────────────────────────────

type PlanTierRow = {
  id: string; display_name: string; stripe_price_id: string | null;
  monthly_price_cents: number; annual_price_id: string | null; annual_price_cents: number;
  features: string[]; max_children: number | null; max_documents: number | null;
  is_active: boolean; created_at: Date;
};

function planTierRowToDb(r: PlanTierRow): DbPlanTier {
  return {
    id: r.id, displayName: r.display_name, stripePriceId: r.stripe_price_id ?? undefined,
    monthlyPriceCents: r.monthly_price_cents, annualPriceId: r.annual_price_id ?? undefined,
    annualPriceCents: r.annual_price_cents, features: r.features,
    maxChildren: r.max_children ?? undefined, maxDocuments: r.max_documents ?? undefined,
    isActive: r.is_active, createdAt: r.created_at.toISOString(),
  };
}

export function createPlanTierRepository(tx?: SqlClient): PlanTierRepository {
  const q: SqlClient = tx ?? sql;

  return {
    async findAll() {
      const rows = await q<PlanTierRow[]>`
        SELECT * FROM plan_tiers WHERE is_active = true ORDER BY monthly_price_cents ASC
      `;
      return rows.map(planTierRowToDb);
    },
    async findById(id) {
      const rows = await q<PlanTierRow[]>`SELECT * FROM plan_tiers WHERE id = ${id} LIMIT 1`;
      return rows[0] ? planTierRowToDb(rows[0]) : null;
    },
  };
}
