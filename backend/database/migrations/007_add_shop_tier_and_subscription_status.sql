-- Migration: Add tier and subscription_status columns to shops table
-- Purpose: Support PRO tier features (workspace, unlimited follows, etc.)
-- Date: 2025-10-25

-- Add tier column (basic = FREE tier, pro = PRO tier)
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'basic' CHECK (tier IN ('basic', 'pro'));

-- Add subscription_status column (payment status)
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'active' CHECK (subscription_status IN ('active', 'grace_period', 'inactive'));

-- Add subscription payment dates
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS next_payment_due TIMESTAMP,
ADD COLUMN IF NOT EXISTS grace_period_until TIMESTAMP;

-- Add comments
COMMENT ON COLUMN shops.tier IS 'Subscription tier: basic ($25/month, limited features) or pro ($35/month, workspace + unlimited follows)';
COMMENT ON COLUMN shops.subscription_status IS 'Payment status: active (paid), grace_period (2 days after expiry), inactive (deactivated)';
COMMENT ON COLUMN shops.next_payment_due IS 'Next monthly subscription payment due date';
COMMENT ON COLUMN shops.grace_period_until IS 'Grace period end date (2 days after payment due)';

-- Update existing shops to basic tier by default
UPDATE shops SET tier = 'basic' WHERE tier IS NULL;
UPDATE shops SET subscription_status = 'active' WHERE subscription_status IS NULL;
