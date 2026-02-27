-- Migration: 0007_messaging
-- Creates tables for messages, threads, and cryptographic hash chain for tamper detection
-- Rollback: DROP TABLE hash_chain_verifications, messages, message_threads CASCADE;

-- ─── Message Threads Table ────────────────────────────────────────────────────

CREATE TABLE message_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for family threads
CREATE INDEX idx_message_threads_family_id ON message_threads(family_id, last_message_at DESC);

-- ─── Messages Table ───────────────────────────────────────────────────────────

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES parents(id),
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  attachment_ids TEXT[] DEFAULT '{}',
  tone_analysis JSONB,
  message_hash TEXT NOT NULL,
  previous_hash TEXT,
  chain_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate chain indices
  CONSTRAINT unique_chain_index UNIQUE (thread_id, chain_index)
);

-- Index for thread messages ordered by chain index
CREATE INDEX idx_messages_thread_chain ON messages(thread_id, chain_index);

-- Index for family messages ordered by date
CREATE INDEX idx_messages_family_sent ON messages(family_id, sent_at DESC);

-- Index for unread message queries
CREATE INDEX idx_messages_unread ON messages(family_id, read_at) WHERE read_at IS NULL;

-- Trigger for updated_at
CREATE TRIGGER messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Hash Chain Verifications Table ───────────────────────────────────────────

CREATE TABLE hash_chain_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by UUID REFERENCES parents(id),
  is_valid BOOLEAN NOT NULL,
  tamper_detected_at_index INT,
  verification_report JSONB
);

-- Index for thread verification history
CREATE INDEX idx_hash_chain_verifications_thread ON hash_chain_verifications(thread_id, verified_at DESC);

-- Index for integrity checks
CREATE INDEX idx_hash_chain_verifications_invalid ON hash_chain_verifications(thread_id, is_valid) WHERE is_valid = FALSE;

-- ─── DOWN Migration ───────────────────────────────────────────────────────────
-- To rollback:
-- DROP TRIGGER IF EXISTS messages_updated_at ON messages;
-- DROP TABLE IF EXISTS hash_chain_verifications CASCADE;
-- DROP TABLE IF EXISTS messages CASCADE;
-- DROP TABLE IF EXISTS message_threads CASCADE;
