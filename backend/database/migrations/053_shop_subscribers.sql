-- Migration: Add shop_subscribers table for invite links
-- Users can subscribe to shops via invite links (t.me/bot?start=shop_123)

CREATE TABLE IF NOT EXISTS shop_subscribers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_shop_subscribers_user ON shop_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_subscribers_shop ON shop_subscribers(shop_id);

COMMENT ON TABLE shop_subscribers IS 'Tracks user subscriptions to shops via invite links';
COMMENT ON COLUMN shop_subscribers.user_id IS 'User who subscribed';
COMMENT ON COLUMN shop_subscribers.shop_id IS 'Shop being subscribed to';
