-- Migration: 044_add_markup_type
-- Description: Add markup_type and markup_fixed columns to shop_follows table
-- Date: 2025-11-29

-- Add markup_type column (percentage or fixed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shop_follows' AND column_name = 'markup_type'
  ) THEN
    ALTER TABLE shop_follows 
    ADD COLUMN markup_type VARCHAR(10) DEFAULT 'percentage' 
    CHECK (markup_type IN ('percentage', 'fixed'));
  END IF;
END $$;

-- Add markup_fixed column for fixed markup amount
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shop_follows' AND column_name = 'markup_fixed'
  ) THEN
    ALTER TABLE shop_follows 
    ADD COLUMN markup_fixed DECIMAL(18, 8) DEFAULT 0;
  END IF;
END $$;

-- Create index for filtering by markup_type (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_shop_follows_markup_type ON shop_follows(markup_type);

-- ROLLBACK (uncomment to revert):
-- ALTER TABLE shop_follows DROP COLUMN IF EXISTS markup_type;
-- ALTER TABLE shop_follows DROP COLUMN IF EXISTS markup_fixed;
-- DROP INDEX IF EXISTS idx_shop_follows_markup_type;
