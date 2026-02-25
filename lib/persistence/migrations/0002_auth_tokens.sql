-- Migration: 0002_auth_tokens
-- Creates tables for password resets, phone verifications, audit logs, and rate limiting
-- Rollback: DROP TABLE rate_limits, audit_logs, phone_verifications, password_reset_tokens CASCADE;

-- ─── Password Reset Tokens ────────────────────────────────────────────────────

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email CITEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip INET,
  user_agent TEXT
);

-- Index for token lookups (primary auth path)
CREATE INDEX idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);

-- Index for email lookups (rate limiting by email)
CREATE INDEX idx_password_reset_tokens_email ON password_reset_tokens(email);

-- Index for cleanup jobs
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at) 
  WHERE used_at IS NULL;

-- ─── Phone Verifications ──────────────────────────────────────────────────────

CREATE TABLE phone_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  ip INET,
  user_agent TEXT
);

-- One active verification per user
CREATE UNIQUE INDEX idx_phone_verifications_user_active 
  ON phone_verifications(user_id) 
  WHERE verified_at IS NULL;

-- Index for phone lookups (rate limiting)
CREATE INDEX idx_phone_verifications_phone ON phone_verifications(phone);

-- ─── Audit Logs ───────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user activity lookups
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id) WHERE user_id IS NOT NULL;

-- Index for action-based queries (security monitoring)
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Index for time-based queries (recent activity)
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- ─── Rate Limits ──────────────────────────────────────────────────────────────

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count INT NOT NULL DEFAULT 1,
  locked_until TIMESTAMPTZ
);

-- Index for cleanup (finding expired rate limits)
CREATE INDEX idx_rate_limits_window_started_at ON rate_limits(window_started_at);

-- ─── DOWN Migration ───────────────────────────────────────────────────────────
-- To rollback:
-- DROP TABLE IF EXISTS rate_limits CASCADE;
-- DROP TABLE IF EXISTS audit_logs CASCADE;
-- DROP TABLE IF EXISTS phone_verifications CASCADE;
-- DROP TABLE IF EXISTS password_reset_tokens CASCADE;
