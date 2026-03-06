/**
 * BILL-001 — Subscription Schema
 *
 * Tracks Stripe customers, payment methods, subscriptions, invoices,
 * invoice line items, and webhook events for billing reconciliation.
 *
 * Design decisions:
 *   - Stripe IDs stored alongside local UUIDs for two-way mapping
 *   - All monetary values in cents (BIGINT) — no floating-point
 *   - stripe_customers.id is the FK anchor; one customer per user
 *   - Soft-delete on payment_methods (is_deleted) to preserve history
 *   - webhook_events stores raw payload + processing status for idempotency
 */

-- Drop existing tables if they exist (for migration replay)
DROP TABLE IF EXISTS payment_methods CASCADE;
DROP TABLE IF EXISTS invoice_line_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS stripe_customers CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;

-- ─── Stripe Customers ─────────────────────────────────────────────────────────

CREATE TABLE stripe_customers (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id    TEXT        NOT NULL UNIQUE,
  email                 CITEXT      NOT NULL,
  name                  TEXT,
  currency              CHAR(3)     NOT NULL DEFAULT 'usd',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_stripe_customers_user_id
  ON stripe_customers (user_id);

CREATE INDEX idx_stripe_customers_stripe_id
  ON stripe_customers (stripe_customer_id);

CREATE TRIGGER update_stripe_customers_timestamp
  BEFORE UPDATE ON stripe_customers
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ─── Payment Methods ──────────────────────────────────────────────────────────

CREATE TABLE payment_methods (
  id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_customer_id        UUID        NOT NULL REFERENCES stripe_customers(id) ON DELETE CASCADE,
  stripe_payment_method_id  TEXT        NOT NULL UNIQUE,
  type                      TEXT        NOT NULL,           -- 'card', 'us_bank_account', etc.
  -- Card-specific fields (nullable for non-card types)
  last4                     CHAR(4),
  brand                     TEXT,                           -- 'visa', 'mastercard', etc.
  exp_month                 SMALLINT,
  exp_year                  SMALLINT,
  -- State
  is_default                BOOLEAN     NOT NULL DEFAULT false,
  is_deleted                BOOLEAN     NOT NULL DEFAULT false,
  deleted_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_card_fields CHECK (
    type != 'card' OR (last4 IS NOT NULL AND brand IS NOT NULL AND exp_month IS NOT NULL AND exp_year IS NOT NULL)
  )
);

CREATE INDEX idx_payment_methods_customer
  ON payment_methods (stripe_customer_id) WHERE is_deleted = false;

CREATE INDEX idx_payment_methods_stripe_id
  ON payment_methods (stripe_payment_method_id);

-- Only one default payment method per customer
CREATE UNIQUE INDEX idx_payment_methods_default
  ON payment_methods (stripe_customer_id)
  WHERE is_default = true AND is_deleted = false;

CREATE TRIGGER update_payment_methods_timestamp
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ─── Subscriptions ────────────────────────────────────────────────────────────

CREATE TYPE subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused'
);

CREATE TABLE subscriptions (
  id                        UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_customer_id        UUID                NOT NULL REFERENCES stripe_customers(id) ON DELETE RESTRICT,
  stripe_subscription_id    TEXT                NOT NULL UNIQUE,
  stripe_price_id           TEXT                NOT NULL,
  plan_tier                 TEXT                NOT NULL,  -- 'free', 'starter', 'professional'
  status                    subscription_status NOT NULL,
  -- Billing period
  current_period_start      TIMESTAMPTZ         NOT NULL,
  current_period_end        TIMESTAMPTZ         NOT NULL,
  -- Cancellation
  cancel_at_period_end      BOOLEAN             NOT NULL DEFAULT false,
  canceled_at               TIMESTAMPTZ,
  cancel_at                 TIMESTAMPTZ,
  -- Trial
  trial_start               TIMESTAMPTZ,
  trial_end                 TIMESTAMPTZ,
  -- Quantity (seats)
  quantity                  INTEGER             NOT NULL DEFAULT 1,
  -- Extensible metadata (plan features snapshot, proration flag, etc.)
  metadata                  JSONB               NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_customer
  ON subscriptions (stripe_customer_id);

CREATE INDEX idx_subscriptions_status
  ON subscriptions (status) WHERE status IN ('active', 'trialing', 'past_due');

CREATE INDEX idx_subscriptions_period_end
  ON subscriptions (current_period_end) WHERE status = 'active';

CREATE TRIGGER update_subscriptions_timestamp
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ─── Invoices ─────────────────────────────────────────────────────────────────

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'open',
  'paid',
  'uncollectible',
  'void'
);

CREATE TABLE invoices (
  id                    UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_customer_id    UUID            NOT NULL REFERENCES stripe_customers(id) ON DELETE RESTRICT,
  subscription_id       UUID            REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id     TEXT            NOT NULL UNIQUE,
  status                invoice_status  NOT NULL,
  billing_reason        TEXT,           -- 'subscription_create', 'subscription_cycle', 'manual', etc.
  -- Monetary (all in cents)
  currency              CHAR(3)         NOT NULL DEFAULT 'usd',
  subtotal              BIGINT          NOT NULL DEFAULT 0,
  total                 BIGINT          NOT NULL DEFAULT 0,
  amount_due            BIGINT          NOT NULL DEFAULT 0,
  amount_paid           BIGINT          NOT NULL DEFAULT 0,
  amount_remaining      BIGINT          NOT NULL DEFAULT 0,
  -- Tax
  tax                   BIGINT          NOT NULL DEFAULT 0,
  -- Dates
  due_date              TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  voided_at             TIMESTAMPTZ,
  -- PDF
  invoice_pdf           TEXT,           -- Stripe-hosted PDF URL
  hosted_invoice_url    TEXT,
  -- Metadata
  metadata              JSONB           NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Efficient user invoice history lookup
CREATE INDEX idx_invoices_customer_created
  ON invoices (stripe_customer_id, created_at DESC);

CREATE INDEX idx_invoices_subscription
  ON invoices (subscription_id);

CREATE INDEX idx_invoices_status
  ON invoices (status) WHERE status IN ('open', 'draft');

CREATE INDEX idx_invoices_stripe_id
  ON invoices (stripe_invoice_id);

CREATE TRIGGER update_invoices_timestamp
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ─── Invoice Line Items ───────────────────────────────────────────────────────

CREATE TABLE invoice_items (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id            UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stripe_invoice_item_id TEXT       NOT NULL UNIQUE,
  description           TEXT,
  quantity              INTEGER     NOT NULL DEFAULT 1,
  unit_amount           BIGINT      NOT NULL DEFAULT 0, -- cents
  amount                BIGINT      NOT NULL DEFAULT 0, -- quantity × unit_amount, cents
  currency              CHAR(3)     NOT NULL DEFAULT 'usd',
  period_start          TIMESTAMPTZ,
  period_end            TIMESTAMPTZ,
  proration             BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_items_invoice
  ON invoice_items (invoice_id);

-- ─── Webhook Events ───────────────────────────────────────────────────────────

CREATE TABLE webhook_events (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id   TEXT        NOT NULL UNIQUE,    -- Stripe event ID (evt_xxx) — idempotency key
  type              TEXT        NOT NULL,            -- e.g. 'customer.subscription.updated'
  api_version       TEXT,
  payload           JSONB       NOT NULL,            -- Raw Stripe event object
  processed_at      TIMESTAMPTZ,                     -- NULL = not yet processed
  processing_error  TEXT,                            -- Last error if processing failed
  retry_count       SMALLINT    NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_webhook_events_stripe_id
  ON webhook_events (stripe_event_id);

CREATE INDEX idx_webhook_events_type
  ON webhook_events (type);

CREATE INDEX idx_webhook_events_unprocessed
  ON webhook_events (created_at ASC) WHERE processed_at IS NULL;

-- ─── Plan Metadata ────────────────────────────────────────────────────────────
-- Static seed data: plan tiers and their Stripe price IDs.
-- Update these IDs after creating prices in the Stripe dashboard.

CREATE TABLE plan_tiers (
  id                TEXT    PRIMARY KEY,           -- 'free', 'starter', 'professional'
  display_name      TEXT    NOT NULL,
  stripe_price_id   TEXT,                          -- NULL for free tier
  monthly_price_cents BIGINT NOT NULL DEFAULT 0,   -- 0 for free
  annual_price_id   TEXT,                          -- Stripe annual price ID
  annual_price_cents BIGINT NOT NULL DEFAULT 0,
  features          JSONB   NOT NULL DEFAULT '[]', -- Feature list for UI
  max_children      INTEGER,                       -- NULL = unlimited
  max_documents     INTEGER,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plan_tiers (id, display_name, stripe_price_id, monthly_price_cents, features, max_children, max_documents)
VALUES
  ('free',         'Free',         NULL,         0,    '["Basic schedule","Message history (30 days)"]',  2, 10),
  ('starter',      'Starter',      NULL,      999,    '["Unlimited history","SMS relay","PDF exports"]',   4, 100),
  ('professional', 'Professional', NULL,     2499,    '["All Starter features","Communication reports","Priority support"]', NULL, NULL);
-- Note: Set stripe_price_id values after creating prices in Stripe dashboard.
