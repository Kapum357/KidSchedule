-- Create mediation_topics table
CREATE TABLE IF NOT EXISTS mediation_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'resolved')),
  draft_suggestion TEXT,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mediation_topics_family_id ON mediation_topics(family_id);
CREATE INDEX idx_mediation_topics_status ON mediation_topics(status);
CREATE INDEX idx_mediation_topics_updated_at ON mediation_topics(updated_at DESC);

-- Create mediation_warnings table
CREATE TABLE IF NOT EXISTS mediation_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  sender_parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  flagged_at TIMESTAMP NOT NULL,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_at TIMESTAMP,
  dismissed_by UUID REFERENCES parents(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mediation_warnings_family_id ON mediation_warnings(family_id);
CREATE INDEX idx_mediation_warnings_dismissed ON mediation_warnings(dismissed);
CREATE INDEX idx_mediation_warnings_severity ON mediation_warnings(severity);
CREATE INDEX idx_mediation_warnings_flagged_at ON mediation_warnings(flagged_at DESC);
