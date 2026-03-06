/**
 * Export Metadata & Hash Chain Verification
 *
 * Stores export metadata and links to hash chain verification results
 * for court-admissible document tracking and integrity validation.
 */

-- Export metadata table: links exports to verification results
CREATE TABLE export_metadata (
  id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  export_id                      UUID NOT NULL REFERENCES export_jobs(id) ON DELETE CASCADE,
  family_id                      UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  report_type                    VARCHAR(50) NOT NULL,
  hash_chain_verification_id     UUID REFERENCES hash_chain_verifications(id),
  included_message_ids           UUID[] DEFAULT '{}',
  custody_period_start           TIMESTAMPTZ,
  custody_period_end             TIMESTAMPTZ,
  pdf_hash                       TEXT,
  pdf_size_bytes                 BIGINT,
  created_at                     TIMESTAMPTZ DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_export_metadata_export_id
  ON export_metadata(export_id);

CREATE INDEX idx_export_metadata_family_id
  ON export_metadata(family_id);

CREATE INDEX idx_export_metadata_verification_id
  ON export_metadata(hash_chain_verification_id);

CREATE INDEX idx_export_metadata_report_type
  ON export_metadata(report_type, family_id);

-- Auto-update timestamp trigger
CREATE TRIGGER update_export_metadata_timestamp
  BEFORE UPDATE ON export_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- Extend hash_chain_verifications to link back to export metadata
ALTER TABLE hash_chain_verifications
  ADD COLUMN export_metadata_id UUID REFERENCES export_metadata(id) ON DELETE SET NULL;

-- Index for reverse lookup
CREATE INDEX idx_hash_chain_verification_export_metadata
  ON hash_chain_verifications(export_metadata_id);

-- Add context field to store PDF-specific verification details
ALTER TABLE hash_chain_verifications
  ADD COLUMN verification_context JSONB;

-- Document metadata: stores per-message hashes as they appeared in export
CREATE TABLE export_message_hashes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  export_metadata_id    UUID NOT NULL REFERENCES export_metadata(id) ON DELETE CASCADE,
  message_id            UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  chain_index           INTEGER NOT NULL,
  message_hash          TEXT NOT NULL,
  previous_hash         TEXT NOT NULL,
  sent_at               TIMESTAMPTZ NOT NULL,
  sender_id             UUID NOT NULL,
  message_preview       TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for hash verification lookups
CREATE INDEX idx_export_message_hashes_export_id
  ON export_message_hashes(export_metadata_id);

CREATE INDEX idx_export_message_hashes_message_id
  ON export_message_hashes(message_id);

CREATE INDEX idx_export_message_hashes_chain_index
  ON export_message_hashes(export_metadata_id, chain_index);

-- Verification audit log: track all verification attempts
CREATE TABLE export_verification_attempts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  export_metadata_id    UUID NOT NULL REFERENCES export_metadata(id) ON DELETE CASCADE,
  verified_by           UUID NOT NULL REFERENCES parents(id),
  verified_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_status   VARCHAR(20) NOT NULL,
  is_valid              BOOLEAN NOT NULL,
  integrity_status      VARCHAR(20),
  pdf_hash_match        BOOLEAN,
  errors_detected       TEXT[],
  ip_address            INET,
  user_agent            TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit trail queries
CREATE INDEX idx_export_verification_attempts_export_id
  ON export_verification_attempts(export_metadata_id);

CREATE INDEX idx_export_verification_attempts_parent_id
  ON export_verification_attempts(verified_by);

CREATE INDEX idx_export_verification_attempts_timestamp
  ON export_verification_attempts(verified_at DESC);
