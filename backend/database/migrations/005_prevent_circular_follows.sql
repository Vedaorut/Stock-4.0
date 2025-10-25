-- ============================================
-- Migration: 005_prevent_circular_follows
-- Description: Add trigger to prevent circular shop_follows relationships
-- Author: Database Designer
-- Date: 2025-10-25
-- Dependencies: 004_add_missing_indexes
-- ============================================

-- UP
BEGIN;

CREATE OR REPLACE FUNCTION check_circular_follow()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if reverse follow exists (B→A when inserting A→B)
  IF EXISTS (
    SELECT 1 FROM shop_follows
    WHERE follower_shop_id = NEW.source_shop_id
    AND source_shop_id = NEW.follower_shop_id
    AND status != 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Circular follow relationship not allowed: Shop % already follows Shop %',
      NEW.source_shop_id, NEW.follower_shop_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_circular_follows
BEFORE INSERT OR UPDATE ON shop_follows
FOR EACH ROW EXECUTE FUNCTION check_circular_follow();

COMMIT;

-- DOWN
BEGIN;
DROP TRIGGER IF EXISTS prevent_circular_follows ON shop_follows;
DROP FUNCTION IF EXISTS check_circular_follow();
COMMIT;
