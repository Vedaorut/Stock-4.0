-- Migration: Add stock_deducted and notification_sent tracking fields
-- Fixes: C1 (stock deduction race conditions) and H2 (duplicate notifications)

-- ============================================
-- C1: Add stock_deducted field to order_items
-- Tracks if stock was actually deducted for this item
-- Prevents double deduction on race conditions
-- ============================================
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT false;

-- For existing confirmed/completed orders, stock was already deducted
UPDATE order_items oi
SET stock_deducted = true
FROM orders o
WHERE oi.order_id = o.id
AND o.status IN ('confirmed', 'shipped', 'delivered')
AND oi.stock_deducted = false;

COMMENT ON COLUMN order_items.stock_deducted IS 'Tracks if stock was actually deducted for this item (prevents double deduction on race conditions)';

-- ============================================
-- H2: Add notification_sent field to orders
-- Prevents duplicate order confirmation notifications
-- ============================================
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false;

-- For existing confirmed/completed orders, notification was likely sent
UPDATE orders
SET notification_sent = true
WHERE status IN ('confirmed', 'shipped', 'delivered')
AND notification_sent = false;

COMMENT ON COLUMN orders.notification_sent IS 'Prevents duplicate order confirmation notifications';

-- Index for finding orders that need notification (optimization for notification worker)
CREATE INDEX IF NOT EXISTS idx_orders_notification_pending
ON orders(status, notification_sent)
WHERE notification_sent = false AND status = 'confirmed';
