-- 0022_change_request_status_constraint.sql
-- Updates the status CHECK constraint on schedule_change_requests to include
-- 'accepted', 'countered', and 'withdrawn' (replacing the original narrow set).

ALTER TABLE schedule_change_requests
  DROP CONSTRAINT IF EXISTS schedule_change_requests_status_check;

ALTER TABLE schedule_change_requests
  ADD CONSTRAINT schedule_change_requests_status_check
    CHECK (status IN ('pending', 'accepted', 'approved', 'declined', 'countered', 'withdrawn', 'cancelled', 'expired'));
