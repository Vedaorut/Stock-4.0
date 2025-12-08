-- Migration: Add notification_status JSONB column to orders
-- Tracks payment notification delivery status for debugging
-- Example: {"buyer": "sent", "seller": "failed", "seller_error": "User blocked bot", "timestamp": "..."}

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS notification_status JSONB DEFAULT '{}';

COMMENT ON COLUMN orders.notification_status IS 'Tracks Telegram notification delivery status (buyer/seller sent/failed with errors)';

-- Index for finding orders with failed notifications (for debugging/retry)
CREATE INDEX IF NOT EXISTS idx_orders_notification_failed
ON orders USING gin (notification_status)
WHERE notification_status ? 'buyer_error' OR notification_status ? 'seller_error';
