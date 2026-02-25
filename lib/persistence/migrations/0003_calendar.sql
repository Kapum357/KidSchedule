-- Migration: 0003_calendar
-- Creates tables for custody schedules, calendar events, and change requests
-- Rollback: DROP TABLE schedule_change_requests, calendar_events, custody_schedules CASCADE;

-- ─── Parents Table ────────────────────────────────────────────────────────────

CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, family_id)
);

-- Index for family lookups
CREATE INDEX idx_parents_family_id ON parents(family_id);

-- ─── Children Table ───────────────────────────────────────────────────────────

CREATE TABLE children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for family lookups
CREATE INDEX idx_children_family_id ON children(family_id);

-- ─── Custody Schedules Table ──────────────────────────────────────────────────

CREATE TABLE custody_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  transition_hour INT NOT NULL DEFAULT 17 CHECK (transition_hour BETWEEN 0 AND 23),
  blocks JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for family schedule lookups
CREATE INDEX idx_custody_schedules_family_id ON custody_schedules(family_id);

-- Add foreign key from families to custody_schedules
ALTER TABLE families 
  ADD CONSTRAINT fk_families_schedule 
  FOREIGN KEY (schedule_id) REFERENCES custody_schedules(id);

-- Trigger for updated_at
CREATE TRIGGER custody_schedules_updated_at
  BEFORE UPDATE ON custody_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Calendar Events Table ────────────────────────────────────────────────────

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
  confirmation_status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES parents(id),
  source TEXT, -- 'manual', 'ical_import', 'google_sync'
  external_id TEXT, -- For synced events
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate external events
  CONSTRAINT unique_external_event UNIQUE (family_id, external_id, start_at)
);

-- Index for family + date range queries (primary calendar view)
CREATE INDEX idx_calendar_events_family_date 
  ON calendar_events(family_id, start_at, end_at);

-- Index for sync operations
CREATE INDEX idx_calendar_events_external 
  ON calendar_events(family_id, external_id) 
  WHERE external_id IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Schedule Change Requests Table ───────────────────────────────────────────

CREATE TABLE schedule_change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES parents(id),
  title TEXT NOT NULL,
  description TEXT,
  giving_up_period_start TIMESTAMPTZ NOT NULL,
  giving_up_period_end TIMESTAMPTZ NOT NULL,
  requested_make_up_start TIMESTAMPTZ NOT NULL,
  requested_make_up_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'declined', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  response_note TEXT
);

-- Index for family pending requests
CREATE INDEX idx_schedule_change_requests_family_status 
  ON schedule_change_requests(family_id, status);

-- ─── Conflict Windows Table ───────────────────────────────────────────────────

CREATE TABLE conflict_windows (
  family_id UUID PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  window_mins INT NOT NULL DEFAULT 120 CHECK (window_mins BETWEEN 0 AND 720),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER conflict_windows_updated_at
  BEFORE UPDATE ON conflict_windows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── DOWN Migration ───────────────────────────────────────────────────────────
-- To rollback:
-- DROP TRIGGER IF EXISTS conflict_windows_updated_at ON conflict_windows;
-- DROP TRIGGER IF EXISTS calendar_events_updated_at ON calendar_events;
-- DROP TRIGGER IF EXISTS custody_schedules_updated_at ON custody_schedules;
-- DROP TABLE IF EXISTS conflict_windows CASCADE;
-- DROP TABLE IF EXISTS schedule_change_requests CASCADE;
-- DROP TABLE IF EXISTS calendar_events CASCADE;
-- ALTER TABLE families DROP CONSTRAINT IF EXISTS fk_families_schedule;
-- DROP TABLE IF EXISTS custody_schedules CASCADE;
-- DROP TABLE IF EXISTS children CASCADE;
-- DROP TABLE IF EXISTS parents CASCADE;
