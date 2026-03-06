-- 0016_holiday_rule_approval.sql
-- Adds approval workflow to holiday_exception_rules and support for custom holidays

-- Step 1: Create holiday_type enum if it doesn't exist, or alter existing TEXT column
DO $$
BEGIN
  -- Check if the enum type exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'holiday_type') THEN
    -- Drop the existing CHECK constraint
    ALTER TABLE holiday_definitions DROP CONSTRAINT IF EXISTS holiday_definitions_type_check;
    -- Create the enum type with existing values
    CREATE TYPE holiday_type AS ENUM ('federal', 'state', 'religious', 'cultural', 'custom');
    -- Alter the column to use the enum (values are already valid)
    ALTER TABLE holiday_definitions ALTER COLUMN type TYPE holiday_type USING type::holiday_type;
  ELSE
    -- If enum exists, just add the value
    ALTER TYPE holiday_type ADD VALUE IF NOT EXISTS 'custom' BEFORE 'federal';
  END IF;
END $$;

-- Step 2: Add family_id column to holiday_definitions for custom holiday scoping
ALTER TABLE holiday_definitions
ADD COLUMN family_id uuid REFERENCES families(id) ON DELETE CASCADE;

-- Step 3: Create index for efficient custom holiday lookup by family
CREATE INDEX idx_holiday_definitions_custom_by_family
ON holiday_definitions(family_id)
WHERE family_id IS NOT NULL;

-- Step 4: Add approval workflow columns to holiday_exception_rules
ALTER TABLE holiday_exception_rules
ADD COLUMN approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN proposed_by uuid NOT NULL REFERENCES parents(id) ON DELETE RESTRICT,
ADD COLUMN proposed_at timestamp with time zone NOT NULL DEFAULT now(),
ADD COLUMN confirmed_by uuid REFERENCES parents(id) ON DELETE SET NULL,
ADD COLUMN confirmed_at timestamp with time zone,
ADD COLUMN change_log jsonb DEFAULT '[]'::jsonb;

-- Step 5: Create index for efficient pending rule lookup by family
CREATE INDEX idx_holiday_exception_rules_pending_by_family
ON holiday_exception_rules(family_id)
WHERE approval_status = 'pending';

-- Step 6: Rename custodian_parent_id to make role clearer (it's the parent who gets the override)
-- Actually, keeping custodian_parent_id as-is since it's already in use elsewhere
-- But adding a comment to clarify its meaning
COMMENT ON COLUMN holiday_exception_rules.custodian_parent_id IS 'The parent who receives the holiday custody override';

-- Step 7: Add constraint to ensure confirmed_by is only set when status is approved or rejected
ALTER TABLE holiday_exception_rules
ADD CONSTRAINT chk_confirmed_by_requires_resolution
CHECK (
  (approval_status = 'pending' AND confirmed_by IS NULL AND confirmed_at IS NULL)
  OR
  (approval_status IN ('approved', 'rejected') AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
);
