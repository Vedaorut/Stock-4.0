-- Migration: Add performance indexes
-- HIGH priority bottleneck fixes from performance audit

-- Index for orders by buyer (findByBuyerId queries)
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created
ON orders(buyer_id, created_at DESC);

-- Index for pending payments lookup (payment verification worker)
CREATE INDEX IF NOT EXISTS idx_payments_pending_order
ON payments(status, order_id, created_at)
WHERE status IN ('pending', 'processing');

-- Index for subscription payments lookup
CREATE INDEX IF NOT EXISTS idx_payments_pending_sub
ON payments(status, subscription_id, created_at)
WHERE subscription_id IS NOT NULL AND status IN ('pending', 'processing');

-- Index for shop subscription status checks (expiration checker)
CREATE INDEX IF NOT EXISTS idx_shops_sub_status_payment
ON shops(subscription_status, next_payment_due)
WHERE subscription_status IN ('active', 'grace_period', 'trial');

-- Index for invoices by crystalpay_id (webhook lookups)
CREATE INDEX IF NOT EXISTS idx_invoices_crystalpay_id
ON invoices(crystalpay_id)
WHERE crystalpay_id IS NOT NULL;

-- Index for shop follows by follower (getMyFollows)
CREATE INDEX IF NOT EXISTS idx_shop_follows_follower_status
ON shop_follows(follower_shop_id, status)
WHERE status = 'active';

-- Index for synced products by follow (getFollowProducts)
CREATE INDEX IF NOT EXISTS idx_synced_products_follow
ON synced_products(follow_id, created_at DESC);

-- Add comment for documentation
COMMENT ON INDEX idx_orders_buyer_created IS 'Performance: Speeds up buyer order history queries';
COMMENT ON INDEX idx_payments_pending_order IS 'Performance: Speeds up payment verification worker';
COMMENT ON INDEX idx_shops_sub_status_payment IS 'Performance: Speeds up subscription expiration checks';
