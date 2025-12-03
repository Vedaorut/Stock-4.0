-- Migration 057: Fix ALL schema mismatches between code and database
-- Run: psql -d statusstock -f backend/database/migrations/057_fix_all_schema_mismatches.sql

BEGIN;

-- =============================================================================
-- ISSUE 1: shops.tier constraint missing 'max'
-- Code uses: ['pro', 'max']
-- DB has: ['basic', 'pro']
-- Impact: Cannot create shops with tier='max' (500 error)
-- =============================================================================
ALTER TABLE shops
  DROP CONSTRAINT IF EXISTS shops_tier_check;

ALTER TABLE shops
  ADD CONSTRAINT shops_tier_check
  CHECK (tier::text = ANY (ARRAY['basic', 'pro', 'max']::text[]));

-- =============================================================================
-- ISSUE 2: users.onboarding_completed column missing
-- Code: userQueries.markOnboardingCompleted() uses this column
-- Impact: 500 error when marking onboarding completed
-- =============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.onboarding_completed IS 'Whether user has completed the seller onboarding tutorial';

-- =============================================================================
-- ISSUE 3: shop_subscribers table missing
-- Code: shopSubscriberQueries.js uses this table for invite links
-- Impact: 500 error on shop invite link subscriptions
-- =============================================================================
CREATE TABLE IF NOT EXISTS shop_subscribers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_shop_subscribers_user ON shop_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_subscribers_shop ON shop_subscribers(shop_id);

COMMENT ON TABLE shop_subscribers IS 'Tracks user subscriptions to shops via invite links';
COMMENT ON COLUMN shop_subscribers.user_id IS 'User who subscribed';
COMMENT ON COLUMN shop_subscribers.shop_id IS 'Shop being subscribed to';

-- =============================================================================
-- VERIFICATION: Check constraints are correct
-- =============================================================================
DO $$
BEGIN
  -- Verify shops_tier_check includes 'max'
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shops_tier_check'
    AND pg_get_constraintdef(oid) LIKE '%max%'
  ) THEN
    RAISE EXCEPTION 'shops_tier_check constraint does not include max!';
  END IF;

  -- Verify shop_subscriptions_tier_check includes 'max'
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_subscriptions_tier_check'
    AND pg_get_constraintdef(oid) LIKE '%max%'
  ) THEN
    RAISE EXCEPTION 'shop_subscriptions_tier_check constraint does not include max!';
  END IF;

  -- Verify onboarding_completed column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'onboarding_completed'
  ) THEN
    RAISE EXCEPTION 'users.onboarding_completed column does not exist!';
  END IF;

  -- Verify shop_subscribers table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'shop_subscribers'
  ) THEN
    RAISE EXCEPTION 'shop_subscribers table does not exist!';
  END IF;

  RAISE NOTICE 'All schema fixes verified successfully!';
END $$;

COMMIT;

-- =============================================================================
-- POST-MIGRATION SUMMARY
-- =============================================================================
-- 1. shops.tier now accepts: basic, pro, max
-- 2. users.onboarding_completed column added (default: false)
-- 3. shop_subscribers table created with indexes
-- =============================================================================
