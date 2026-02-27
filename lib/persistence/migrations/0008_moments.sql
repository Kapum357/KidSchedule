-- Migration: 0008_moments
-- Creates tables for shared photo/video moments and reactions
-- Rollback: DROP TABLE moment_reactions, moments CASCADE;

-- ─── Moments Table ────────────────────────────────────────────────────────────

CREATE TABLE moments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES parents(id),
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  caption TEXT,
  taken_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for family moments ordered by recency
CREATE INDEX idx_moments_family_id ON moments(family_id, created_at DESC);

-- Index for uploader moments
CREATE INDEX idx_moments_uploaded_by ON moments(uploaded_by, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER moments_updated_at
  BEFORE UPDATE ON moments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Moment Reactions Table ───────────────────────────────────────────────────

CREATE TABLE moment_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id),
  emoji TEXT NOT NULL,
  reacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate reactions (one emoji per parent per moment)
  CONSTRAINT unique_moment_emoji_per_parent UNIQUE (moment_id, parent_id)
);

-- Index for moment reactions
CREATE INDEX idx_moment_reactions_moment_id ON moment_reactions(moment_id);

-- Index for parent reactions
CREATE INDEX idx_moment_reactions_parent_id ON moment_reactions(parent_id, reacted_at DESC);

-- ─── DOWN Migration ───────────────────────────────────────────────────────────
-- To rollback:
-- DROP TABLE IF EXISTS moment_reactions CASCADE;
-- DROP TRIGGER IF EXISTS moments_updated_at ON moments;
-- DROP TABLE IF EXISTS moments CASCADE;
