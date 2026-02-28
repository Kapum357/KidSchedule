-- Migration: 0009_reminders
-- Creates personal reminders

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id),
  text TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reminders_parent_id ON reminders(parent_id, completed, due_at);