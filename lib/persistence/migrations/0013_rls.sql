-- Migration: 0013_rls
-- Enables Row-Level Security (RLS) on sensitive tables

-- Calendar Events
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_events_isolation 
ON calendar_events FOR ALL 
USING (family_id = current_setting('app.current_family_id')::UUID);

-- Expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_isolation 
ON expenses FOR ALL 
USING (family_id = current_setting('app.current_family_id')::UUID);

-- Messages
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_threads_isolation 
ON message_threads FOR ALL 
USING (family_id = current_setting('app.current_family_id')::UUID);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_isolation 
ON messages FOR ALL 
USING (family_id = current_setting('app.current_family_id')::UUID);

-- Moments
ALTER TABLE moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY moments_isolation 
ON moments FOR ALL 
USING (family_id = current_setting('app.current_family_id')::UUID);

-- School
ALTER TABLE school_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_contacts_isolation 
ON school_contacts FOR ALL 
USING (family_id = current_setting('app.current_family_id')::UUID);

ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_documents_isolation 
ON vault_documents FOR ALL 
USING (family_id = current_setting('app.current_family_id')::UUID);
