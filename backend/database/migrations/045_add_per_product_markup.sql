-- Migration: 045_add_per_product_markup
-- Description: Add custom markup columns to synced_products for per-product pricing
-- Date: 2025-11-29

-- Add custom_markup_type column (NULL = use follow's global markup)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'synced_products' AND column_name = 'custom_markup_type'
  ) THEN
    ALTER TABLE synced_products
    ADD COLUMN custom_markup_type VARCHAR(20) DEFAULT NULL
    CHECK (custom_markup_type IS NULL OR custom_markup_type IN ('percentage', 'fixed'));
  END IF;
END $$;

-- Add custom_markup_percentage column for percentage markup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'synced_products' AND column_name = 'custom_markup_percentage'
  ) THEN
    ALTER TABLE synced_products
    ADD COLUMN custom_markup_percentage DECIMAL(5,2) DEFAULT NULL
    CHECK (custom_markup_percentage IS NULL OR (custom_markup_percentage >= 0 AND custom_markup_percentage <= 500));
  END IF;
END $$;

-- Add custom_markup_fixed column for fixed markup amount
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'synced_products' AND column_name = 'custom_markup_fixed'
  ) THEN
    ALTER TABLE synced_products
    ADD COLUMN custom_markup_fixed DECIMAL(10,2) DEFAULT NULL
    CHECK (custom_markup_fixed IS NULL OR (custom_markup_fixed >= 0 AND custom_markup_fixed <= 10000));
  END IF;
END $$;

-- Create index for filtering products with custom markup
CREATE INDEX IF NOT EXISTS idx_synced_products_custom_markup
ON synced_products(custom_markup_type) WHERE custom_markup_type IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN synced_products.custom_markup_type IS 'Custom markup type for this product. NULL = use follow global markup';
COMMENT ON COLUMN synced_products.custom_markup_percentage IS 'Custom percentage markup (0-500%). NULL = use follow global';
COMMENT ON COLUMN synced_products.custom_markup_fixed IS 'Custom fixed markup ($0-$10000). NULL = use follow global';

-- ROLLBACK (uncomment to revert):
-- ALTER TABLE synced_products DROP COLUMN IF EXISTS custom_markup_type;
-- ALTER TABLE synced_products DROP COLUMN IF EXISTS custom_markup_percentage;
-- ALTER TABLE synced_products DROP COLUMN IF EXISTS custom_markup_fixed;
-- DROP INDEX IF EXISTS idx_synced_products_custom_markup;
