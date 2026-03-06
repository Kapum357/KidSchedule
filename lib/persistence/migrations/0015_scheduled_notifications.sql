-- Migration: 0015_scheduled_notifications
-- Creates scheduled notifications for custody transitions

CREATE TABLE scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('transition_24h', 'transition_same_day', 'transition_reminder')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'cancelled')),
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('sms', 'email', 'push')),
  message_id TEXT, -- External provider message ID
  error_message TEXT,
  transition_at TIMESTAMPTZ NOT NULL, -- When the actual transition happens
  from_parent_id UUID NOT NULL REFERENCES parents(id),
  to_parent_id UUID NOT NULL REFERENCES parents(id),
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_scheduled_notifications_family_scheduled ON scheduled_notifications(family_id, scheduled_at);
CREATE INDEX idx_scheduled_notifications_parent_pending ON scheduled_notifications(parent_id, delivery_status) WHERE delivery_status = 'pending';
CREATE INDEX idx_scheduled_notifications_scheduled_status ON scheduled_notifications(scheduled_at, delivery_status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scheduled_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generic update_timestamp function for other tables
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scheduled_notifications_updated_at
  BEFORE UPDATE ON scheduled_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_notifications_updated_at();