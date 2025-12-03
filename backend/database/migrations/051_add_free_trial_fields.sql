-- Migration: Add free trial fields for new shops
-- 7-day PRO trial for first-time sellers

ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_shops_trial ON shops(is_trial, trial_ends_at) WHERE is_trial = true;

COMMENT ON COLUMN shops.is_trial IS 'True if shop is on free trial period';
COMMENT ON COLUMN shops.trial_ends_at IS 'When the free trial expires';
