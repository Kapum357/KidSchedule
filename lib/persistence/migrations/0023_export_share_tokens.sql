-- Export Share Tokens Table
--
-- Enables authenticated users to generate shareable tokens for public export verification.
-- Tokens are the only gatekeeper for public access to exports (no user auth needed).
-- Tokens have customizable expiration (1-30 days, default 7 days).

CREATE TABLE IF NOT EXISTS export_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id UUID NOT NULL REFERENCES export_jobs(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  scope VARCHAR(20) NOT NULL DEFAULT 'external', -- 'internal' or 'external'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_by_user_id VARCHAR(255) NOT NULL,
  CONSTRAINT valid_scope CHECK (scope IN ('internal', 'external'))
);

-- Index for token lookup (fastest path - public verification)
CREATE INDEX idx_export_share_tokens_token ON export_share_tokens(token);

-- Index for export-based queries (list user's share tokens)
CREATE INDEX idx_export_share_tokens_export_id ON export_share_tokens(export_id);

-- Index for expiration cleanup (deleteExpired operation)
CREATE INDEX idx_export_share_tokens_expires_at ON export_share_tokens(expires_at)
WHERE expires_at < NOW();
