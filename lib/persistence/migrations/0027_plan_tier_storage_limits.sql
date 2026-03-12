-- Migration: 0027_plan_tier_storage_limits
-- Adds storage quota limits to subscription plan tiers for school vault documents
--
-- Changes:
-- 1. Adds max_storage_bytes column to plan_tiers table
-- 2. Column initialized to NULL (unlimited) for existing tiers
-- 3. Defines storage limits per subscription tier
--
-- Storage tier definitions:
-- - free: 100 MB (104857600 bytes)
-- - starter: 2 GB (2147483648 bytes)
-- - professional: unlimited (NULL)
--
-- IDEMPOTENCY:
-- - Uses ALTER TABLE IF NOT EXISTS (safe on re-run)
-- - Non-destructive (only adds column)

ALTER TABLE plan_tiers ADD COLUMN IF NOT EXISTS max_storage_bytes BIGINT;

-- Update existing plan tiers with storage limits
UPDATE plan_tiers SET max_storage_bytes = 104857600 WHERE id = 'free' AND max_storage_bytes IS NULL;
UPDATE plan_tiers SET max_storage_bytes = 2147483648 WHERE id = 'starter' AND max_storage_bytes IS NULL;
-- professional tier remains NULL (unlimited)

-- Index for quota enforcement queries
CREATE INDEX IF NOT EXISTS idx_plan_tiers_max_storage
  ON plan_tiers(max_storage_bytes)
  WHERE is_active = true;
