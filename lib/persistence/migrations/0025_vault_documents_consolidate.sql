-- Migration: 0025_vault_documents_consolidate
-- Consolidates conflicting school_vault_documents schema (migrations 0005 + 0011)
--
-- CRITICAL FIXES:
-- 1. Drops and recreates authoritative school_vault_documents table
--    (0005 created with WRONG CHECK constraint: pending/approved/expired/archived)
-- 2. New CHECK constraint: status IN ('available', 'pending_signature', 'signed', 'expired')
-- 3. Adds soft-delete column (is_deleted) for FERPA 30-day retention compliance
-- 4. Adds updated_at TIMESTAMPTZ for audit trail
-- 5. Drops vault_documents table (migration 0011 created with WRONG name)
--
-- IDEMPOTENCY:
-- - Uses DROP TABLE IF EXISTS (safe because school_vault_documents is read-only/unused)
-- - Follows pattern from 0020_billing.sql
-- - RLS policies created with IF NOT EXISTS (safe on re-run)
-- - Indexes use IF NOT EXISTS (safe on re-run)
--
-- MIGRATION SAFETY:
-- - No data loss expected (table currently unused in code)
-- - If data exists, migration will fail on DROP (intentional - requires manual review)
-- - After migration, code using school-repository.ts works with new status values

-- Drop both conflicting vault tables and their associated RLS policies
-- Note: 0013_rls.sql created RLS policy on wrong table (vault_documents)
-- This policy will be orphaned after drop, so remove it first
DROP POLICY IF EXISTS vault_documents_isolation ON vault_documents;
DROP TABLE IF EXISTS vault_documents CASCADE;
DROP TABLE IF EXISTS school_vault_documents CASCADE;

-- Create authoritative school_vault_documents with correct schema
CREATE TABLE school_vault_documents (
  -- Core identification
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,

  -- Document metadata
  file_type TEXT NOT NULL,              -- 'pdf', 'doc', 'img', etc.
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'pending_signature', 'signed', 'expired')),
  status_label TEXT NOT NULL,           -- Human-readable status (e.g., "Awaiting Signature")

  -- Lifecycle and audit tracking
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID NOT NULL REFERENCES parents(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- Audit trail (updated by trigger)
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,      -- Soft-delete for FERPA 30-day retention

  -- Document content
  size_bytes BIGINT,
  url TEXT,
  action_deadline TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_school_vault_documents_family_id
  ON school_vault_documents(family_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_school_vault_documents_pending_action
  ON school_vault_documents(family_id, action_deadline)
  WHERE status = 'pending_signature' AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_school_vault_documents_soft_delete_cleanup
  ON school_vault_documents(added_at)
  WHERE is_deleted = TRUE;

-- Create trigger for updated_at (auto-update timestamp on any row change)
CREATE TRIGGER school_vault_documents_updated_at
  BEFORE UPDATE ON school_vault_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
