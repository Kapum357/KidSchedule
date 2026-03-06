-- Export Jobs Queue Table
--
-- Manages async export requests for PDF schedules, invoices, messages, media archives.
-- Jobs are enqueued to Redis (lib/export-queue.ts) and processed by workers.
-- Database stores job state for auditability and retriability.

CREATE TABLE export_jobs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id    UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,        -- schedule-pdf, invoices-pdf, messages-csv, moments-archive
  params       JSONB,                        -- type-specific parameters (date range, filters, etc)
  status       VARCHAR(20) NOT NULL DEFAULT 'queued',  -- queued, processing, complete, failed
  result_url   TEXT,                         -- signed URL to download exported file
  mime_type    VARCHAR(100),                 -- application/pdf, text/csv, etc
  size_bytes   BIGINT,                       -- file size in bytes
  error        TEXT,                         -- error message if status = failed
  retry_count  INTEGER NOT NULL DEFAULT 0,   -- number of retry attempts
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ                   -- timestamp when processing finished
);

-- Index for queue polling: find queued/processing jobs
CREATE INDEX idx_export_jobs_status ON export_jobs (status)
WHERE status IN ('queued', 'processing');

-- Index for user retrieval: list user's exports
CREATE INDEX idx_export_jobs_user ON export_jobs (user_id, created_at DESC);

-- Index for family context: list family's exports
CREATE INDEX idx_export_jobs_family ON export_jobs (family_id, created_at DESC);

-- Update trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_export_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_export_jobs_updated_at
  BEFORE UPDATE ON export_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_export_jobs_updated_at();
