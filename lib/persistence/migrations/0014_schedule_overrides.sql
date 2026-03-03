-- Migration: 0014_schedule_overrides
-- Creates tables for schedule overrides, holiday definitions, and holiday exception rules
-- Rollback: DROP TABLE holiday_exception_rules, holiday_definitions, schedule_overrides CASCADE;

-- ─── Schedule Overrides Table ────────────────────────────────────────────────

CREATE TABLE schedule_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('holiday', 'swap', 'mediation', 'manual')),
  title TEXT NOT NULL,
  description TEXT,
  effective_start TIMESTAMPTZ NOT NULL,
  effective_end TIMESTAMPTZ NOT NULL,
  custodian_parent_id UUID NOT NULL REFERENCES parents(id),
  source_event_id TEXT,     -- For holiday/calendar events
  source_request_id UUID REFERENCES schedule_change_requests(id),
  source_mediation_id TEXT, -- For mediation session IDs
  priority INT NOT NULL DEFAULT 10 CHECK (priority BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'superseded', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES parents(id),
  notes TEXT,

  -- Prevent invalid time ranges
  CONSTRAINT valid_time_range CHECK (effective_end > effective_start)

  -- Note: Overlapping check removed for simplicity - can be added later with a trigger if needed
);

-- Index for family + time range queries
CREATE INDEX idx_schedule_overrides_family_time
  ON schedule_overrides(family_id, effective_start, effective_end);

-- Index for active overrides lookup
CREATE INDEX idx_schedule_overrides_active
  ON schedule_overrides(family_id, status)
  WHERE status = 'active';

-- Trigger for updated_at (not needed since no updated_at column)

-- ─── Holiday Definitions Table ───────────────────────────────────────────────

CREATE TABLE holiday_definitions (
  id TEXT PRIMARY KEY, -- e.g., "us-thanksgiving-2024"
  name TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('federal', 'state', 'religious', 'cultural')),
  jurisdiction TEXT NOT NULL, -- e.g., "US", "US-CA", "US-NY"
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

  -- Ensure unique holiday per jurisdiction per year
  -- Note: Using index instead of constraint due to function usage
);

-- Create unique index for holiday per jurisdiction per year
CREATE UNIQUE INDEX idx_holiday_definitions_unique_per_year
  ON holiday_definitions(name, jurisdiction, EXTRACT(YEAR FROM date));

-- Index for jurisdiction + date queries
CREATE INDEX idx_holiday_definitions_jurisdiction_date
  ON holiday_definitions(jurisdiction, date);

-- ─── Holiday Exception Rules Table ───────────────────────────────────────────

CREATE TABLE holiday_exception_rules (
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  holiday_id TEXT NOT NULL REFERENCES holiday_definitions(id) ON DELETE CASCADE,
  custodian_parent_id UUID NOT NULL REFERENCES parents(id),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (family_id, holiday_id)
);

-- Index for family lookups
CREATE INDEX idx_holiday_exception_rules_family
  ON holiday_exception_rules(family_id);

-- Trigger for updated_at
CREATE TRIGGER holiday_exception_rules_updated_at
  BEFORE UPDATE ON holiday_exception_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Insert Common US Holidays ───────────────────────────────────────────────

INSERT INTO holiday_definitions (id, name, date, type, jurisdiction, description) VALUES
  ('us-new-years-day-2024', 'New Year''s Day', '2024-01-01', 'federal', 'US', 'Federal holiday'),
  ('us-martin-luther-king-day-2024', 'Martin Luther King Jr. Day', '2024-01-15', 'federal', 'US', 'Federal holiday'),
  ('us-washington-birthday-2024', 'Washington''s Birthday', '2024-02-19', 'federal', 'US', 'Federal holiday'),
  ('us-memorial-day-2024', 'Memorial Day', '2024-05-27', 'federal', 'US', 'Federal holiday'),
  ('us-independence-day-2024', 'Independence Day', '2024-07-04', 'federal', 'US', 'Federal holiday'),
  ('us-labor-day-2024', 'Labor Day', '2024-09-02', 'federal', 'US', 'Federal holiday'),
  ('us-columbus-day-2024', 'Columbus Day', '2024-10-14', 'federal', 'US', 'Federal holiday'),
  ('us-veterans-day-2024', 'Veterans Day', '2024-11-11', 'federal', 'US', 'Federal holiday'),
  ('us-thanksgiving-2024', 'Thanksgiving Day', '2024-11-28', 'federal', 'US', 'Federal holiday'),
  ('us-christmas-day-2024', 'Christmas Day', '2024-12-25', 'federal', 'US', 'Federal holiday'),

  ('us-new-years-day-2025', 'New Year''s Day', '2025-01-01', 'federal', 'US', 'Federal holiday'),
  ('us-martin-luther-king-day-2025', 'Martin Luther King Jr. Day', '2025-01-20', 'federal', 'US', 'Federal holiday'),
  ('us-washington-birthday-2025', 'Washington''s Birthday', '2025-02-17', 'federal', 'US', 'Federal holiday'),
  ('us-memorial-day-2025', 'Memorial Day', '2025-05-26', 'federal', 'US', 'Federal holiday'),
  ('us-independence-day-2025', 'Independence Day', '2025-07-04', 'federal', 'US', 'Federal holiday'),
  ('us-labor-day-2025', 'Labor Day', '2025-09-01', 'federal', 'US', 'Federal holiday'),
  ('us-columbus-day-2025', 'Columbus Day', '2025-10-13', 'federal', 'US', 'Federal holiday'),
  ('us-veterans-day-2025', 'Veterans Day', '2025-11-11', 'federal', 'US', 'Federal holiday'),
  ('us-thanksgiving-2025', 'Thanksgiving Day', '2025-11-27', 'federal', 'US', 'Federal holiday'),
  ('us-christmas-day-2025', 'Christmas Day', '2025-12-25', 'federal', 'US', 'Federal holiday'),

  ('us-new-years-day-2026', 'New Year''s Day', '2026-01-01', 'federal', 'US', 'Federal holiday'),
  ('us-martin-luther-king-day-2026', 'Martin Luther King Jr. Day', '2026-01-19', 'federal', 'US', 'Federal holiday'),
  ('us-washington-birthday-2026', 'Washington''s Birthday', '2026-02-16', 'federal', 'US', 'Federal holiday'),
  ('us-memorial-day-2026', 'Memorial Day', '2026-05-25', 'federal', 'US', 'Federal holiday'),
  ('us-independence-day-2026', 'Independence Day', '2026-07-04', 'federal', 'US', 'Federal holiday'),
  ('us-labor-day-2026', 'Labor Day', '2026-09-07', 'federal', 'US', 'Federal holiday'),
  ('us-columbus-day-2026', 'Columbus Day', '2026-10-12', 'federal', 'US', 'Federal holiday'),
  ('us-veterans-day-2026', 'Veterans Day', '2026-11-11', 'federal', 'US', 'Federal holiday'),
  ('us-thanksgiving-2026', 'Thanksgiving Day', '2026-11-26', 'federal', 'US', 'Federal holiday'),
  ('us-christmas-day-2026', 'Christmas Day', '2026-12-25', 'federal', 'US', 'Federal holiday');

-- ─── DOWN Migration ───────────────────────────────────────────────────────────
-- To rollback:
-- DELETE FROM holiday_exception_rules;
-- DELETE FROM holiday_definitions WHERE jurisdiction = 'US';
-- DROP TRIGGER IF EXISTS holiday_exception_rules_updated_at ON holiday_exception_rules;
-- DROP TABLE IF EXISTS holiday_exception_rules CASCADE;
-- DROP TABLE IF EXISTS holiday_definitions CASCADE;
-- DROP TABLE IF EXISTS schedule_overrides CASCADE;