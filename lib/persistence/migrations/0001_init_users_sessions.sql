-- Migration: 0001_init_users_sessions
-- Creates the core auth tables: users, sessions, families, family_members
-- Rollback: DROP TABLE family_members, families, sessions, users CASCADE;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─── Users Table ──────────────────────────────────────────────────────────────

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email CITEXT UNIQUE NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified_at TIMESTAMPTZ,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  last_login_ip INET
);

-- Index for email lookups (case-insensitive)
CREATE INDEX idx_users_email ON users(email);

-- Index for phone lookups
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- ─── Sessions Table ───────────────────────────────────────────────────────────

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ,
  ip INET,
  user_agent TEXT,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);

-- Index for refresh token lookups (primary auth path)
CREATE INDEX idx_sessions_refresh_token_hash ON sessions(refresh_token_hash);

-- Index for user session management
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Index for cleanup jobs (finding expired/revoked sessions)
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at) WHERE NOT is_revoked;

-- ─── Families Table ───────────────────────────────────────────────────────────

CREATE TABLE families (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  custody_anchor_date DATE NOT NULL,
  schedule_id UUID, -- References custody_schedules, added in later migration
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Family Members (Junction Table) ──────────────────────────────────────────

CREATE TABLE family_members (
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (family_id, user_id)
);

-- Index for finding families by user
CREATE INDEX idx_family_members_user_id ON family_members(user_id);

-- ─── Trigger: Update updated_at on modification ───────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER families_updated_at
  BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── DOWN Migration ───────────────────────────────────────────────────────────
-- To rollback:
-- DROP TRIGGER IF EXISTS families_updated_at ON families;
-- DROP TRIGGER IF EXISTS users_updated_at ON users;
-- DROP FUNCTION IF EXISTS update_updated_at_column();
-- DROP TABLE IF EXISTS family_members CASCADE;
-- DROP TABLE IF EXISTS families CASCADE;
-- DROP TABLE IF EXISTS sessions CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
