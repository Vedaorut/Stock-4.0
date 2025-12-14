-- Migration: Add admin_deactivated flag to shops
-- BUG-002 FIX: Track whether shop was forcibly deactivated by admin
-- Late payments can reactivate shops after grace period, but admin blocks are permanent

-- Add column (nullable, defaults to false)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS admin_deactivated BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN shops.admin_deactivated IS 'If true, shop was forcibly deactivated by admin and cannot be reactivated via payment';

-- Index for potential admin queries
CREATE INDEX IF NOT EXISTS idx_shops_admin_deactivated ON shops (admin_deactivated) WHERE admin_deactivated = true;
