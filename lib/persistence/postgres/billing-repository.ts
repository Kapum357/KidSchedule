/**
 * Billing Repository (BILL-001)
 *
 * Manages Stripe customers, payment methods, subscriptions,
 * invoices, and webhook event processing.
 *
 * Interfaces are defined in ../repositories. This file contains only implementations.
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
import type {
  StripeCustomerRepository,
  PaymentMethodRepository,
  SubscriptionRepository,
  InvoiceRepository,
  WebhookEventRepository,
  PlanTierRepository,
} from "../repositories";
import { sql, type SqlClient } from "./client";

// ─── Stripe Customer impl ─────────────────────────────────────────────────────

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
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

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

// ─── Payment Method impl ──────────────────────────────────────────────────────

type PaymentMethodRow = {
  id: string; stripe_customer_id: string; stripe_payment_method_id: string;
  type: string; last4: string | null; brand: string | null;
  exp_month: number | null; exp_year: number | null;
  is_default: boolean; is_deleted: boolean; deleted_at: Date | null;
  created_at: Date; updated_at: Date;
};

function paymentMethodRowToDb(r: PaymentMethodRow): DbPaymentMethod {
  return {
    id: r.id,
    stripeCustomerId: r.stripe_customer_id,
    stripePaymentMethodId: r.stripe_payment_method_id,
    type: r.type,
    last4: r.last4 ?? undefined,
    brand: r.brand ?? undefined,
    expMonth: r.exp_month ?? undefined,
    expYear: r.exp_year ?? undefined,
    isDefault: r.is_default,
    isDeleted: r.is_deleted,
    deletedAt: r.deleted_at?.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export function createPaymentMethodRepository(tx?: SqlClient): PaymentMethodRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findByCustomer(stripeCustomerLocalId) {
      const rows = await q<PaymentMethodRow[]>`
        SELECT * FROM payment_methods
        WHERE stripe_customer_id = ${stripeCustomerLocalId} AND is_deleted = false
        ORDER BY is_default DESC, created_at DESC
      `;
      return rows.map(paymentMethodRowToDb);
    },

    async findDefault(stripeCustomerLocalId) {
      const rows = await q<PaymentMethodRow[]>`
        SELECT * FROM payment_methods
        WHERE stripe_customer_id = ${stripeCustomerLocalId} AND is_default = true AND is_deleted = false
        LIMIT 1
      `;
      return rows[0] ? paymentMethodRowToDb(rows[0]) : null;
    },

    async findByStripeId(stripePaymentMethodId) {
      const rows = await q<PaymentMethodRow[]>`
        SELECT * FROM payment_methods
        WHERE stripe_payment_method_id = ${stripePaymentMethodId} AND is_deleted = false
        LIMIT 1
      `;
      return rows[0] ? paymentMethodRowToDb(rows[0]) : null;
    },

    async create(data) {
      const rows = await q<PaymentMethodRow[]>`
        INSERT INTO payment_methods (
          stripe_customer_id, stripe_payment_method_id, type,
          last4, brand, exp_month, exp_year, is_default, is_deleted
        ) VALUES (
          ${data.stripeCustomerId}, ${data.stripePaymentMethodId}, ${data.type},
          ${data.last4 ?? null}, ${data.brand ?? null}, ${data.expMonth ?? null},
          ${data.expYear ?? null}, ${data.isDefault}, ${data.isDeleted}
        )
        RETURNING *
      `;
      return paymentMethodRowToDb(rows[0]);
    },

    async setDefault(id, stripeCustomerLocalId) {
      // If using a transaction, use it directly; otherwise wrap in one
      if (tx) {
        // Already in a transaction, use it directly
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txAny = tx as any;
        await txAny`
          UPDATE payment_methods SET is_default = false, updated_at = NOW()
          WHERE stripe_customer_id = ${stripeCustomerLocalId} AND is_default = true
        `;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx as any)`
          UPDATE payment_methods SET is_default = true, updated_at = NOW()
          WHERE id = ${id} AND stripe_customer_id = ${stripeCustomerLocalId}
        `;
      } else {
        // Not in a transaction, create one
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sql as any).begin(async (txInner: SqlClient) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (txInner as any)`
            UPDATE payment_methods SET is_default = false, updated_at = NOW()
            WHERE stripe_customer_id = ${stripeCustomerLocalId} AND is_default = true
          `;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (txInner as any)`
            UPDATE payment_methods SET is_default = true, updated_at = NOW()
            WHERE id = ${id} AND stripe_customer_id = ${stripeCustomerLocalId}
          `;
        });
      }
    },

    async softDelete(id) {
      // If using a transaction, use it directly; otherwise wrap in one
      const performSoftDelete = async (txOrQ: SqlClient) => {
        // Cast to postgres.Sql for TypeScript generic inference
        const query = txOrQ as typeof sql;

        // Check if this is the default method before soft-delete
        type MethodRow = { stripeCustomerId: string; isDefault: boolean };
        const methodRows = await query<MethodRow[]>`
          SELECT stripe_customer_id, is_default FROM payment_methods
          WHERE id = ${id}
          LIMIT 1
        `;

        if (!methodRows[0]) {
          return; // Payment method not found
        }

        const { stripeCustomerId, isDefault: wasDefault } = methodRows[0];

        // Soft delete
        await query`
          UPDATE payment_methods SET is_deleted = true, deleted_at = NOW(), is_default = false, updated_at = NOW()
          WHERE id = ${id}
        `;

        // If was default, auto-select the oldest active method
        if (wasDefault) {
          const remainingMethods = await query<{ id: string }[]>`
            SELECT id FROM payment_methods
            WHERE stripe_customer_id = ${stripeCustomerId} AND is_deleted = false
            ORDER BY created_at ASC
            LIMIT 1
          `;

          if (remainingMethods[0]) {
            await query`
              UPDATE payment_methods
              SET is_default = true, updated_at = NOW()
              WHERE id = ${remainingMethods[0].id}
            `;
          }
        }
      };

      if (tx) {
        // Already in a transaction, use it directly
        await performSoftDelete(tx);
      } else {
        // Not in a transaction, create one
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sql as any).begin(performSoftDelete);
      }
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
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

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

// ─── Invoice impl ─────────────────────────────────────────────────────────────

type InvoiceRow = {
  id: string; stripe_customer_id: string; subscription_id: string | null;
  stripe_invoice_id: string; status: string; billing_reason: string | null;
  currency: string; subtotal: number; total: number; amount_due: number;
  amount_paid: number; amount_remaining: number; tax: number;
  due_date: Date | null; paid_at: Date | null; voided_at: Date | null;
  invoice_pdf: string | null; hosted_invoice_url: string | null;
  metadata: Record<string, unknown>; created_at: Date; updated_at: Date;
};

function invoiceRowToDb(r: InvoiceRow): DbInvoice {
  return {
    id: r.id,
    stripeCustomerId: r.stripe_customer_id,
    subscriptionId: r.subscription_id ?? undefined,
    stripeInvoiceId: r.stripe_invoice_id,
    status: r.status as InvoiceStatus,
    billingReason: r.billing_reason ?? undefined,
    currency: r.currency,
    subtotal: r.subtotal,
    total: r.total,
    amountDue: r.amount_due,
    amountPaid: r.amount_paid,
    amountRemaining: r.amount_remaining,
    tax: r.tax,
    dueDate: r.due_date?.toISOString(),
    paidAt: r.paid_at?.toISOString(),
    voidedAt: r.voided_at?.toISOString(),
    invoicePdf: r.invoice_pdf ?? undefined,
    hostedInvoiceUrl: r.hosted_invoice_url ?? undefined,
    metadata: r.metadata,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export function createInvoiceRepository(tx?: SqlClient): InvoiceRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findByCustomer(stripeCustomerLocalId, limit = 50) {
      const rows = await q<InvoiceRow[]>`
        SELECT * FROM invoices
        WHERE stripe_customer_id = ${stripeCustomerLocalId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return rows.map(invoiceRowToDb);
    },

    async findByStripeId(stripeInvoiceId) {
      const rows = await q<InvoiceRow[]>`
        SELECT * FROM invoices WHERE stripe_invoice_id = ${stripeInvoiceId} LIMIT 1
      `;
      return rows[0] ? invoiceRowToDb(rows[0]) : null;
    },

    async findBySubscription(subscriptionId) {
      const rows = await q<InvoiceRow[]>`
        SELECT * FROM invoices WHERE subscription_id = ${subscriptionId} ORDER BY created_at DESC
      `;
      return rows.map(invoiceRowToDb);
    },

    async findOpen(stripeCustomerLocalId) {
      const rows = await q<InvoiceRow[]>`
        SELECT * FROM invoices
        WHERE stripe_customer_id = ${stripeCustomerLocalId} AND status IN ('open', 'draft')
        ORDER BY created_at DESC
      `;
      return rows.map(invoiceRowToDb);
    },

    async upsert(data) {
      const rows = await q<InvoiceRow[]>`
        INSERT INTO invoices (
          stripe_customer_id, subscription_id, stripe_invoice_id, status, billing_reason,
          currency, subtotal, total, amount_due, amount_paid, amount_remaining, tax,
          due_date, paid_at, voided_at, invoice_pdf, hosted_invoice_url, metadata
        ) VALUES (
          ${data.stripeCustomerId}, ${data.subscriptionId ?? null}, ${data.stripeInvoiceId},
          ${data.status}, ${data.billingReason ?? null},
          ${data.currency}, ${data.subtotal}, ${data.total}, ${data.amountDue},
          ${data.amountPaid}, ${data.amountRemaining}, ${data.tax},
          ${data.dueDate ? new Date(data.dueDate) : null},
          ${data.paidAt ? new Date(data.paidAt) : null},
          ${data.voidedAt ? new Date(data.voidedAt) : null},
          ${data.invoicePdf ?? null}, ${data.hostedInvoiceUrl ?? null},
          ${JSON.stringify(data.metadata)}
        )
        ON CONFLICT (stripe_invoice_id) DO UPDATE SET
          status           = EXCLUDED.status,
          billing_reason   = EXCLUDED.billing_reason,
          subtotal         = EXCLUDED.subtotal,
          total            = EXCLUDED.total,
          amount_due       = EXCLUDED.amount_due,
          amount_paid      = EXCLUDED.amount_paid,
          amount_remaining = EXCLUDED.amount_remaining,
          tax              = EXCLUDED.tax,
          due_date         = EXCLUDED.due_date,
          paid_at          = EXCLUDED.paid_at,
          voided_at        = EXCLUDED.voided_at,
          invoice_pdf      = EXCLUDED.invoice_pdf,
          hosted_invoice_url = EXCLUDED.hosted_invoice_url,
          metadata         = EXCLUDED.metadata,
          updated_at       = NOW()
        RETURNING *
      `;
      return invoiceRowToDb(rows[0]);
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
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findByStripeEventId(stripeEventId) {
      const rows = await q<WebhookRow[]>`
        SELECT * FROM webhook_events WHERE stripe_event_id = ${stripeEventId} LIMIT 1
      `;
      return rows[0] ? webhookRowToDb(rows[0]) : null;
    },
    async createIfNotExists(data) {
      const rows = await q<WebhookRow[]>`
        INSERT INTO webhook_events (stripe_event_id, type, api_version, payload, retry_count)
        VALUES (${data.stripeEventId}, ${data.type}, ${data.apiVersion || null}, ${JSON.stringify(data.payload)}, 0)
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING *
      `;
      if (rows[0]) {
        return { event: webhookRowToDb(rows[0]), alreadyProcessed: false };
      }
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
  is_active: boolean; created_at?: Date;
};

function planTierRowToDb(r: PlanTierRow): DbPlanTier {
  return {
    id: r.id, displayName: r.display_name, stripePriceId: r.stripe_price_id ?? undefined,
    monthlyPriceCents: r.monthly_price_cents, annualPriceId: r.annual_price_id ?? undefined,
    annualPriceCents: r.annual_price_cents, features: r.features,
    maxChildren: r.max_children ?? undefined, maxDocuments: r.max_documents ?? undefined,
    isActive: r.is_active, createdAt: (r.created_at ?? new Date()).toISOString(),
  };
}

export function createPlanTierRepository(tx?: SqlClient): PlanTierRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

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
