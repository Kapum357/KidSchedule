-- 002_change_request_enhancements.sql
-- Extends schedule_change_requests table and adds discussion messages table.

-- Extend schedule_change_requests with new columns
ALTER TABLE schedule_change_requests
  ADD COLUMN IF NOT EXISTS responded_by UUID REFERENCES parents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS change_type VARCHAR(20) NOT NULL DEFAULT 'swap'
    CHECK (change_type IN ('swap', 'cancel', 'extra'));

CREATE INDEX IF NOT EXISTS idx_scr_family_status
  ON schedule_change_requests(family_id, status);

CREATE INDEX IF NOT EXISTS idx_scr_requested_by
  ON schedule_change_requests(requested_by);

-- Discussion messages for change requests
CREATE TABLE IF NOT EXISTS schedule_change_request_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES schedule_change_requests(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  sender_parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrm_request_id
  ON schedule_change_request_messages(request_id, created_at);
