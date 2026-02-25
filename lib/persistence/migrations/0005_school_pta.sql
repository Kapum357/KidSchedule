-- Migration: 0005_school_pta
-- Creates tables for school events, volunteer tasks, contacts, and documents
-- Rollback: DROP TABLE school_vault_documents, school_contacts, volunteer_tasks, school_events CASCADE;

-- ─── School Events Table ──────────────────────────────────────────────────────

CREATE TABLE school_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL, -- 'meeting', 'deadline', 'activity', 'holiday', etc.
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  attending_parent_ids JSONB NOT NULL DEFAULT '[]',
  action_required BOOLEAN NOT NULL DEFAULT FALSE,
  action_deadline TIMESTAMPTZ,
  action_description TEXT,
  volunteer_task_ids JSONB NOT NULL DEFAULT '[]',
  accent_color TEXT,
  icon TEXT,
  -- External sync fields
  source TEXT, -- 'manual', 'ical_import', 'google_sync'
  external_id TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate external events
  CONSTRAINT unique_school_external_event UNIQUE (family_id, external_id, start_at)
);

-- Index for family + date queries
CREATE INDEX idx_school_events_family_date 
  ON school_events(family_id, start_at);

-- Index for upcoming events with action required
CREATE INDEX idx_school_events_action_required 
  ON school_events(family_id, action_deadline) 
  WHERE action_required = TRUE;

-- Trigger for updated_at
CREATE TRIGGER school_events_updated_at
  BEFORE UPDATE ON school_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Volunteer Tasks Table ────────────────────────────────────────────────────

CREATE TABLE volunteer_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES school_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' 
    CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
  estimated_hours DECIMAL(4, 2) NOT NULL DEFAULT 1.0,
  scheduled_for TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  icon TEXT,
  icon_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for family tasks
CREATE INDEX idx_volunteer_tasks_family_id ON volunteer_tasks(family_id);

-- Index for event tasks
CREATE INDEX idx_volunteer_tasks_event_id ON volunteer_tasks(event_id);

-- Index for unassigned tasks (volunteer opportunities)
CREATE INDEX idx_volunteer_tasks_unassigned 
  ON volunteer_tasks(family_id, scheduled_for) 
  WHERE assigned_parent_id IS NULL AND status = 'open';

-- Trigger for updated_at
CREATE TRIGGER volunteer_tasks_updated_at
  BEFORE UPDATE ON volunteer_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── School Contacts Table ────────────────────────────────────────────────────

CREATE TABLE school_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  role TEXT NOT NULL, -- 'teacher', 'principal', 'counselor', 'nurse', etc.
  role_label TEXT NOT NULL, -- Human-readable label
  email TEXT,
  phone TEXT,
  avatar_color TEXT NOT NULL DEFAULT '#6366f1', -- Tailwind color
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for family contacts
CREATE INDEX idx_school_contacts_family_id ON school_contacts(family_id);

-- ─── School Vault Documents Table ─────────────────────────────────────────────

CREATE TABLE school_vault_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf', 'doc', 'img', etc.
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'expired', 'archived')),
  status_label TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID NOT NULL REFERENCES parents(id),
  size_bytes BIGINT,
  url TEXT,
  action_deadline TIMESTAMPTZ
);

-- Index for family documents
CREATE INDEX idx_school_vault_documents_family_id ON school_vault_documents(family_id);

-- Index for documents requiring action
CREATE INDEX idx_school_vault_documents_pending 
  ON school_vault_documents(family_id, action_deadline) 
  WHERE status = 'pending';

-- ─── Lunch Menus Table (for meal planning features) ───────────────────────────

CREATE TABLE lunch_menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')),
  menu_item TEXT NOT NULL,
  menu_type TEXT NOT NULL DEFAULT 'hot', -- 'hot', 'cold', 'vegetarian'
  price_cents INT NOT NULL DEFAULT 0,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  week_start DATE NOT NULL, -- Monday of the week
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, day_of_week, week_start)
);

-- Index for family weekly menus
CREATE INDEX idx_lunch_menus_family_week 
  ON lunch_menus(family_id, week_start);

-- ─── DOWN Migration ───────────────────────────────────────────────────────────
-- To rollback:
-- DROP TABLE IF EXISTS lunch_menus CASCADE;
-- DROP TABLE IF EXISTS school_vault_documents CASCADE;
-- DROP TABLE IF EXISTS school_contacts CASCADE;
-- DROP TRIGGER IF EXISTS volunteer_tasks_updated_at ON volunteer_tasks;
-- DROP TABLE IF EXISTS volunteer_tasks CASCADE;
-- DROP TRIGGER IF EXISTS school_events_updated_at ON school_events;
-- DROP TABLE IF EXISTS school_events CASCADE;
