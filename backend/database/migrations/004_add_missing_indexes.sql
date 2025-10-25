-- ============================================
-- Migration: 004_add_missing_indexes
-- Description: Add performance indexes for orders and order_items
-- Author: Database Designer
-- Date: 2025-10-25
-- Dependencies: 003_add_invoices
-- ============================================

-- UP
BEGIN;

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_status ON orders(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Order items indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Shop follows composite indexes (for dropshipping queries)
CREATE INDEX IF NOT EXISTS idx_shop_follows_follower_status ON shop_follows(follower_shop_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_follows_source_status ON shop_follows(source_shop_id, status);

COMMIT;

-- DOWN
BEGIN;
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_orders_buyer_status;
DROP INDEX IF EXISTS idx_orders_created_at;
DROP INDEX IF EXISTS idx_order_items_order_id;
DROP INDEX IF EXISTS idx_order_items_product_id;
DROP INDEX IF EXISTS idx_shop_follows_follower_status;
DROP INDEX IF EXISTS idx_shop_follows_source_status;
COMMIT;
