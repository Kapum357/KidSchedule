-- Migration: 0026_subscription_storage_quota
-- Adds storage quota tracking to subscriptions table for school vault document management
--
-- Changes:
-- 1. Adds used_storage_bytes column to track storage used by vault documents
-- 2. Column initialized to 0 for all existing subscriptions
-- 3. Soft-delete of vault documents reclaims quota
-- 4. Hard-delete only removes database record (quota already reclaimed)
--
-- Quota lifecycle:
-- - create() vault document: INSERT + UPDATE subscriptions.used_storage_bytes += size_bytes
-- - delete() vault document: UPDATE is_deleted=true + UPDATE subscriptions.used_storage_bytes -= size_bytes
-- - hardDelete() vault documents: DELETE record (quota already freed on soft-delete)
--
-- IDEMPOTENCY:
-- - Uses ALTER TABLE IF NOT EXISTS (safe on re-run)
-- - Sets DEFAULT 0 for new rows
-- - Non-destructive (only adds column)

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS used_storage_bytes BIGINT NOT NULL DEFAULT 0;

-- Index for quota monitoring queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_used_storage
  ON subscriptions(used_storage_bytes)
  WHERE status IN ('active', 'trialing');
