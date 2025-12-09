-- Migration: Add has_used_trial column to users table
-- Purpose: Track if user has already used free trial (prevents trial abuse via shop deletion)

ALTER TABLE users ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN DEFAULT false;

-- Backfill: Mark users who already have shops with trial as having used trial
UPDATE users u
SET has_used_trial = true
WHERE EXISTS (
  SELECT 1 FROM shops s
  WHERE s.owner_id = u.id
  AND (s.is_trial = true OR s.trial_ends_at IS NOT NULL)
);

-- Add index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_users_has_used_trial ON users(has_used_trial) WHERE has_used_trial = true;

COMMENT ON COLUMN users.has_used_trial IS 'Tracks if user has already used free trial (PAY-P1-003 fix)';
