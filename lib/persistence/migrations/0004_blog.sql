-- Migration: 0004_blog
-- Creates tables for blog posts and categories
-- Rollback: DROP TABLE blog_posts, blog_categories CASCADE;

-- ─── Blog Categories Table ────────────────────────────────────────────────────

CREATE TABLE blog_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial categories
INSERT INTO blog_categories (slug, name, description) VALUES
  ('custody-basics', 'Custody Basics', 'Foundational knowledge about custody arrangements'),
  ('schedules', 'Schedules', 'Custody schedule patterns and templates'),
  ('coparenting', 'Co-Parenting', 'Tips for effective co-parenting'),
  ('legal', 'Legal', 'Legal considerations and resources'),
  ('wellness', 'Wellness', 'Mental health and self-care for parents');

-- ─── Blog Posts Table ─────────────────────────────────────────────────────────

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  preview TEXT NOT NULL,
  content TEXT NOT NULL, -- Markdown or HTML content
  categories JSONB NOT NULL DEFAULT '[]', -- Array of category slugs
  author_name TEXT NOT NULL,
  author_title TEXT,
  author_avatar_url TEXT,
  featured_image_url TEXT,
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  read_time_minutes INT NOT NULL DEFAULT 5,
  view_count INT NOT NULL DEFAULT 0,
  share_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE
);

-- Index for slug lookups (primary access path)
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);

-- Index for published posts listing
CREATE INDEX idx_blog_posts_published 
  ON blog_posts(published_at DESC) 
  WHERE is_published = TRUE;

-- Index for featured post lookup
CREATE INDEX idx_blog_posts_featured 
  ON blog_posts(published_at DESC) 
  WHERE is_featured = TRUE AND is_published = TRUE;

-- Index for category filtering (GIN for JSONB contains queries)
CREATE INDEX idx_blog_posts_categories ON blog_posts USING GIN(categories);

-- ─── DOWN Migration ───────────────────────────────────────────────────────────
-- To rollback:
-- DROP TABLE IF EXISTS blog_posts CASCADE;
-- DROP TABLE IF EXISTS blog_categories CASCADE;
