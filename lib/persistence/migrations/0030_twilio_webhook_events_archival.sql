/**
 * TWILIO-002 — Event Archival with 90-Day TTL and In-Flight State Tracking
 *
 * Implements resilience layer for Twilio webhook processing:
 * 1. Add processing_state column to track event lifecycle
 * 2. Create archive table for aged events (90+ days old)
 * 3. Support cleanup job to move old events to archive
 *
 * Design decisions:
 *   - processing_state prevents concurrent handler execution
 *   - States: 'pending' (new), 'processing' (acquiring lock), 'processed' (success), 'failed' (error)
 *   - Archive table mirrors main table schema for auditing and compliance
 *   - Default 'pending' ensures backward compatibility with existing events
 *   - Indexes on created_at for archival queries and processing state for locking
 */

-- Add processing_state column to track event lifecycle
-- States: 'pending' (new), 'processing' (in handler), 'processed' (success), 'failed' (error)
-- Defaults to 'pending' for backward compatibility
ALTER TABLE twilio_webhook_events
ADD COLUMN IF NOT EXISTS processing_state TEXT DEFAULT 'pending';

-- Create archive table (same schema as main table, for 90+ day old events)
-- This preserves audit trail and enables compliance queries
CREATE TABLE IF NOT EXISTS archive_twilio_webhook_events (
  id                UUID        PRIMARY KEY,
  message_sid       TEXT        NOT NULL,
  phone_number      TEXT        NOT NULL,
  event_type        TEXT        NOT NULL,
  timestamp         TIMESTAMPTZ NOT NULL,
  payload           JSONB       NOT NULL,
  processed_at      TIMESTAMPTZ,
  error_message     TEXT,
  processing_state  TEXT        NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL
);

-- Index on archive table created_at for efficient retention queries
CREATE INDEX IF NOT EXISTS idx_archive_twilio_webhook_events_created
  ON archive_twilio_webhook_events (created_at DESC);

-- Index on archive table processing_state to check for in-flight events
CREATE INDEX IF NOT EXISTS idx_archive_twilio_webhook_events_state
  ON archive_twilio_webhook_events (processing_state);

-- Index on processing_state in main table for in-flight state checks
CREATE INDEX IF NOT EXISTS idx_twilio_webhook_events_processing_state
  ON twilio_webhook_events (processing_state);

-- Composite index on created_at and processing_state for archival queries
-- Helps query: SELECT * WHERE created_at < cutoff AND processing_state != 'processing'
CREATE INDEX IF NOT EXISTS idx_twilio_webhook_events_created_state
  ON twilio_webhook_events (created_at DESC, processing_state);
