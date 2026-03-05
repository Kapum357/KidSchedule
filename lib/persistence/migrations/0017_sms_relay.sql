-- SMS Relay Participants Table
--
-- Tracks parent enrollment in SMS relay for families.
-- Each enrolled parent gets a deterministic proxy number from the Twilio pool.
-- When a parent sends a message via the app, SMS is sent to all enrolled family members.
-- When a parent replies via SMS, the message is inserted into the app thread.

CREATE TABLE sms_relay_participants (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id    UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  parent_id    UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  phone        TEXT NOT NULL,          -- E.164 format real phone of the parent (e.g., +14155552671)
  proxy_number TEXT NOT NULL,          -- from pool; assigned on enrollment (e.g., +14155552671)
  is_active    BOOLEAN NOT NULL DEFAULT true,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, parent_id)
);

-- Index for incoming SMS webhook lookup: find family by proxy number
CREATE INDEX idx_sms_relay_proxy ON sms_relay_participants (proxy_number) WHERE is_active = true;

-- Index for incoming SMS webhook lookup: find parent by phone + family context
CREATE INDEX idx_sms_relay_phone  ON sms_relay_participants (phone, family_id) WHERE is_active = true;
