/**
 * SMS Subscriptions Table
 *
 * Tracks SMS subscription status for phone numbers.
 * Records when users opt out via STOP messages.
 *
 * Fields:
 *   - id: UUID primary key
 *   - family_id: Foreign key to families table
 *   - phone_number: E.164 format phone number (e.g., +15551234567)
 *   - opted_out: Boolean flag for opt-out status
 *   - opted_out_at: Timestamp when user opted out (NULL if not opted out)
 *   - created_at: When subscription was created
 *   - updated_at: When subscription was last updated
 */

CREATE TABLE IF NOT EXISTS sms_subscriptions (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id         UUID        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  phone_number      TEXT        NOT NULL,                           -- E.164 format
  opted_out         BOOLEAN     NOT NULL DEFAULT false,
  opted_out_at      TIMESTAMPTZ,                                    -- NULL until opted out
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(family_id, phone_number)
);

-- Index for quick lookup by phone number
CREATE INDEX IF NOT EXISTS idx_sms_subscriptions_phone
  ON sms_subscriptions (phone_number);

-- Index for finding opted-out subscriptions
CREATE INDEX IF NOT EXISTS idx_sms_subscriptions_opted_out
  ON sms_subscriptions (opted_out, opted_out_at DESC);

-- Index for family lookup
CREATE INDEX IF NOT EXISTS idx_sms_subscriptions_family
  ON sms_subscriptions (family_id);
