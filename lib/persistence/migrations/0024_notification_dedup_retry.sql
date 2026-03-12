-- Migration: 0024_notification_dedup_retry
-- Add unique constraint to prevent duplicate notifications and retry tracking columns

-- Add new columns for retry tracking
ALTER TABLE scheduled_notifications
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

-- Add unique constraint on (moment_id, parent_id, type) to prevent duplicates
-- Note: The migration renames moment_id concept to the actual constraint we need
-- For custody transitions, we use (transition_at, parent_id, notification_type) as the unique key
-- This ensures only one notification of each type is scheduled for a parent per transition
ALTER TABLE scheduled_notifications
ADD CONSTRAINT unique_notification_per_transition_and_type
UNIQUE (
  transition_at,
  parent_id,
  notification_type
);

-- Create index for retry queries (find notifications that need retry)
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_retry_needed
ON scheduled_notifications(
  delivery_status,
  retry_count,
  last_retry_at
)
WHERE delivery_status = 'failed' AND retry_count < 3;
