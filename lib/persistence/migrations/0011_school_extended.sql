-- Migration: 0011_school_extended
-- Adds school contacts, vault documents, and lunch accounts

CREATE TABLE school_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'teacher', 'principal', 'nurse', 'counselor'
  email TEXT,
  phone TEXT,
  office_location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vault_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL, -- 'permission_slip', 'report_card', 'medical_form'
  file_url TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES parents(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  signed_by UUID[] DEFAULT '{}', -- Array of parent IDs
  due_date DATE
);

CREATE TABLE lunch_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  account_number TEXT,
  balance_cents INT NOT NULL DEFAULT 0,
  last_transaction_at TIMESTAMPTZ,
  auto_reload_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reload_threshold_cents INT,
  auto_reload_amount_cents INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, child_id)
);

CREATE TABLE lunch_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES lunch_accounts(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL, -- negative for purchases, positive for deposits
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'deposit', 'refund')),
  description TEXT,
  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_school_contacts_family ON school_contacts(family_id);
CREATE INDEX idx_vault_documents_family ON vault_documents(family_id, uploaded_at DESC);
CREATE INDEX idx_lunch_accounts_family ON lunch_accounts(family_id);
CREATE INDEX idx_lunch_transactions_account ON lunch_transactions(account_id, transaction_date DESC);
