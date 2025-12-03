-- Migration 055: Add 'max' tier to shop_subscriptions constraint
-- Fixes: 500 error when creating subscription with tier='max'
-- Root cause: Constraint only allowed ['basic', 'pro'], but code uses ['pro', 'max']

-- Drop the old constraint
ALTER TABLE shop_subscriptions
  DROP CONSTRAINT IF EXISTS shop_subscriptions_tier_check;

-- Add new constraint including 'max' tier
ALTER TABLE shop_subscriptions
  ADD CONSTRAINT shop_subscriptions_tier_check
  CHECK (tier::text = ANY (ARRAY['basic', 'pro', 'max']::text[]));
