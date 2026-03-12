/**
 * TWILIO-001 — Twilio Webhook Events Storage
 *
 * Stores Twilio webhook events for status updates (MessageReceived, DeliveryReceipt, OptOutChange)
 * and enables idempotency checks to prevent duplicate processing.
 *
 * Design decisions:
 *   - Separate table from webhook_events (Stripe-specific) for cleaner schema
 *   - message_sid (Twilio-provided) as PRIMARY KEY for strong idempotency
 *   - phone_number + event_type + timestamp for efficient lookup by family/event
 *   - JSONB payload for flexibility across Twilio event types
 *   - processed_at NULL until event successfully processes
 *   - Indexes for fast idempotency checks and log retention cleanup
 */

-- Create table with idempotency via message_sid
CREATE TABLE IF NOT EXISTS twilio_webhook_events (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_sid       TEXT        NOT NULL UNIQUE,                    -- Twilio MessageSid — strong idempotency key
  phone_number      TEXT        NOT NULL,                           -- E.164 format (e.g., +15551234567)
  event_type        TEXT        NOT NULL,                           -- 'MessageReceived', 'DeliveryReceipt', 'OptOutChange'
  timestamp         TIMESTAMPTZ NOT NULL,                           -- From Twilio webhook (event creation time)
  payload           JSONB       NOT NULL,                           -- Full webhook body
  processed_at      TIMESTAMPTZ,                                    -- NULL until successfully processed
  error_message     TEXT,                                           -- NULL unless processing failed
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for idempotency checks: (phone_number, event_type, timestamp)
-- Used to find existing events during dedup and idempotent reprocessing
CREATE INDEX IF NOT EXISTS idx_twilio_webhook_events_phone_event_time
  ON twilio_webhook_events (phone_number, event_type, timestamp DESC);

-- Index for log retention cleanup: created_at for old records
CREATE INDEX IF NOT EXISTS idx_twilio_webhook_events_created
  ON twilio_webhook_events (created_at DESC);

-- Index for pending events: processed_at IS NULL
-- Used to find unprocessed events for retry/cleanup
CREATE INDEX IF NOT EXISTS idx_twilio_webhook_events_unprocessed
  ON twilio_webhook_events (created_at ASC) WHERE processed_at IS NULL;

-- Index for quick lookups by message_sid
CREATE INDEX IF NOT EXISTS idx_twilio_webhook_events_message_sid
  ON twilio_webhook_events (message_sid);
