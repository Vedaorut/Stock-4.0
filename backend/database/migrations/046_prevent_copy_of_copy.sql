-- Migration 046: Prevent chain copying (copy of copy)
-- Defense in Depth: Database-level protection against copying synced products

-- 1. Diagnostic: Find existing "copy of copy" records
DO $$
DECLARE
  copy_count INT;
BEGIN
  SELECT COUNT(*) INTO copy_count
  FROM synced_products sp_copy
  JOIN synced_products sp_original
    ON sp_copy.source_product_id = sp_original.synced_product_id;

  RAISE NOTICE 'Found % copy-of-copy records to fix', copy_count;
END $$;

-- 2. Fix existing data: Re-link copies to true originals
-- This preserves products in shops while fixing the sync chain
UPDATE synced_products sp_copy
SET source_product_id = sp_original.source_product_id
FROM synced_products sp_original
WHERE sp_copy.source_product_id = sp_original.synced_product_id;

-- 3. Create trigger function to prevent future chain copies
CREATE OR REPLACE FUNCTION check_source_not_copy()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM synced_products
    WHERE synced_product_id = NEW.source_product_id
  ) THEN
    RAISE EXCEPTION 'Cannot sync product %: it is already a synced copy (chain copying not allowed)',
      NEW.source_product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger on synced_products table
DROP TRIGGER IF EXISTS prevent_copy_of_copy ON synced_products;
CREATE TRIGGER prevent_copy_of_copy
BEFORE INSERT ON synced_products
FOR EACH ROW EXECUTE FUNCTION check_source_not_copy();

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 046 complete: Chain copy protection enabled';
END $$;
