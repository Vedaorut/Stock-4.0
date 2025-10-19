-- ============================================
-- Database Indexes for Performance Optimization
-- ============================================

-- ============================================
-- Users table indexes
-- ============================================
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- ============================================
-- Shops table indexes
-- ============================================
CREATE INDEX idx_shops_owner_id ON shops(owner_id);
CREATE INDEX idx_shops_name ON shops(name);
CREATE INDEX idx_shops_is_active ON shops(is_active);
CREATE INDEX idx_shops_created_at ON shops(created_at DESC);

-- Composite index for active shops by owner
CREATE INDEX idx_shops_owner_active ON shops(owner_id, is_active);

-- ============================================
-- Products table indexes
-- ============================================
CREATE INDEX idx_products_shop_id ON products(shop_id);
CREATE INDEX idx_products_is_available ON products(is_available);
CREATE INDEX idx_products_currency ON products(currency);
CREATE INDEX idx_products_created_at ON products(created_at DESC);

-- Composite index for available products by shop
CREATE INDEX idx_products_shop_available ON products(shop_id, is_available);

-- Index for price range queries
CREATE INDEX idx_products_price ON products(price);

-- Full-text search index for product names
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);

-- ============================================
-- Orders table indexes
-- ============================================
CREATE INDEX idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX idx_orders_shop_id ON orders(shop_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_hash ON orders(payment_hash);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_orders_buyer_status ON orders(buyer_id, status);
CREATE INDEX idx_orders_shop_status ON orders(shop_id, status);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);

-- Index for payment tracking
CREATE INDEX idx_orders_payment_status ON orders(payment_hash, status) WHERE payment_hash IS NOT NULL;

-- ============================================
-- Order items table indexes
-- ============================================
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Composite index for order items by product
CREATE INDEX idx_order_items_product_order ON order_items(product_id, order_id);

-- ============================================
-- Subscriptions table indexes
-- ============================================
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_shop_id ON subscriptions(shop_id);
CREATE INDEX idx_subscriptions_created_at ON subscriptions(created_at DESC);

-- Composite index for subscription lookups
CREATE INDEX idx_subscriptions_user_shop ON subscriptions(user_id, shop_id);

-- ============================================
-- Shop payments table indexes
-- ============================================
CREATE INDEX idx_shop_payments_user_id ON shop_payments(user_id);
CREATE INDEX idx_shop_payments_shop_id ON shop_payments(shop_id);
CREATE INDEX idx_shop_payments_payment_hash ON shop_payments(payment_hash);
CREATE INDEX idx_shop_payments_status ON shop_payments(status);
CREATE INDEX idx_shop_payments_created_at ON shop_payments(created_at DESC);

-- Composite index for pending payments
CREATE INDEX idx_shop_payments_status_created ON shop_payments(status, created_at DESC);

-- Index for payment verification
CREATE INDEX idx_shop_payments_hash_status ON shop_payments(payment_hash, status) WHERE payment_hash IS NOT NULL;

-- ============================================
-- Payments table indexes
-- ============================================
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_tx_hash ON payments(tx_hash);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_currency ON payments(currency);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Composite indexes for payment verification
CREATE INDEX idx_payments_status_created ON payments(status, created_at DESC);
CREATE INDEX idx_payments_hash_status ON payments(tx_hash, status);

-- Index for pending payment verification
CREATE INDEX idx_payments_pending ON payments(status, updated_at) WHERE status = 'pending';

-- ============================================
-- Performance Tips
-- ============================================
-- 1. Run ANALYZE after bulk data loads
-- 2. Monitor slow queries with pg_stat_statements
-- 3. Use EXPLAIN ANALYZE to check query plans
-- 4. Consider partitioning orders table by date for large datasets
-- 5. Enable pg_trgm extension for fuzzy text search:
--    CREATE EXTENSION IF NOT EXISTS pg_trgm;
