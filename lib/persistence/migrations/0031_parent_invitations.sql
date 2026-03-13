-- Migration: 0031_parent_invitations
-- Adds pending co-parent invitation persistence for settings family management.

CREATE TABLE parent_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_name TEXT,
  email CITEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'secondary' CHECK (role IN ('secondary')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parent_invitations_family_id ON parent_invitations(family_id);
CREATE INDEX idx_parent_invitations_email ON parent_invitations(email);
CREATE UNIQUE INDEX idx_parent_invitations_family_email_pending
  ON parent_invitations(family_id, email)
  WHERE status = 'pending';

CREATE TRIGGER parent_invitations_updated_at
  BEFORE UPDATE ON parent_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── DOWN Migration ─────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS parent_invitations_updated_at ON parent_invitations;
-- DROP TABLE IF EXISTS parent_invitations CASCADE;
