-- Migration 050: Add shop_id snapshot to orders to preserve shop context when products are deleted

BEGIN;

-- 1) Add column with FK (allows NULL to keep legacy orders)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shop_id INT REFERENCES shops(id) ON DELETE SET NULL;

-- 2) Backfill from products where possible
UPDATE orders o
SET shop_id = p.shop_id
FROM products p
WHERE o.product_id = p.id
  AND o.shop_id IS NULL;

-- 3) Index for shop filters / owner queries
CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON orders(shop_id);

COMMIT;
