-- Migration: 0010_blog_engagement
-- Tracks article reading sessions and engagement

CREATE TABLE blog_reading_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  reader_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL if anonymous
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scroll_percentage INT NOT NULL DEFAULT 0 CHECK (scroll_percentage BETWEEN 0 AND 100),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  time_spent_seconds INT NOT NULL DEFAULT 0,
  
  -- Session identification (for anonymous users)
  session_fingerprint TEXT
);

CREATE INDEX idx_blog_reading_sessions_post ON blog_reading_sessions(post_id, started_at DESC);
CREATE INDEX idx_blog_reading_sessions_reader ON blog_reading_sessions(reader_id) WHERE reader_id IS NOT NULL;

-- Materialized view for engagement metrics (refreshed hourly)
CREATE MATERIALIZED VIEW blog_engagement_metrics AS
SELECT 
  post_id,
  COUNT(*) AS view_count,
  COUNT(DISTINCT COALESCE(reader_id::TEXT, session_fingerprint)) AS unique_viewers,
  AVG(scroll_percentage) AS avg_scroll_percentage,
  AVG(time_spent_seconds) AS avg_time_spent_seconds,
  COUNT(*) FILTER (WHERE is_completed) AS completion_count
FROM blog_reading_sessions
GROUP BY post_id;

CREATE UNIQUE INDEX idx_blog_engagement_metrics_post ON blog_engagement_metrics(post_id);

-- Refresh function (called by cron job)
CREATE OR REPLACE FUNCTION refresh_blog_engagement_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY blog_engagement_metrics;
END;
$$ LANGUAGE plpgsql;