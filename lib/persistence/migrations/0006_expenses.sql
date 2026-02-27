-- Migration: 0006_expenses
-- Creates tables for expense tracking and settlement
-- Rollback: DROP TABLE expenses CASCADE;

-- ─── Expenses Table ───────────────────────────────────────────────────────────

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('medical', 'education', 'clothing', 'activity', 'childcare', 'other')),
  total_amount BIGINT NOT NULL CHECK (total_amount >= 0), -- cents
  currency TEXT NOT NULL DEFAULT 'USD',
  split_method TEXT NOT NULL CHECK (split_method IN ('50-50', 'custom', 'one-parent')),
  split_ratio JSONB, -- { "parentId1": 0.6, "parentId2": 0.4 }
  paid_by UUID NOT NULL REFERENCES parents(id),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'disputed')),
  receipt_url TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for family expenses
CREATE INDEX idx_expenses_family_id ON expenses(family_id);

-- Index for date range queries (most common query pattern)
CREATE INDEX idx_expenses_date ON expenses(family_id, date DESC);

-- Trigger for updated_at
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── DOWN Migration ───────────────────────────────────────────────────────────
-- To rollback:
-- DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
-- DROP TABLE IF EXISTS expenses CASCADE;
