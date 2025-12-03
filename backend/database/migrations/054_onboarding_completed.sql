-- Migration: Add onboarding_completed flag to users table
-- Tracks if user has completed the seller onboarding tutorial

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.onboarding_completed IS 'Whether user has completed the seller onboarding tutorial';
