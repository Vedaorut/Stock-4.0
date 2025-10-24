-- ============================================
-- Telegram E-Commerce Platform Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if exist (for clean migrations)
DROP TABLE IF EXISTS synced_products CASCADE;
DROP TABLE IF EXISTS shop_follows CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS shops CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- Users table
-- ============================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  selected_role VARCHAR(20) CHECK (selected_role IN ('buyer', 'seller')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Stores all platform users';
COMMENT ON COLUMN users.telegram_id IS 'Unique Telegram user ID';

-- ============================================
-- Shops table
-- ============================================
CREATE TABLE shops (
  id SERIAL PRIMARY KEY,
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registration_paid BOOLEAN DEFAULT false,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  logo TEXT,
  wallet_btc VARCHAR(255),
  wallet_eth VARCHAR(255),
  wallet_usdt VARCHAR(255),
  wallet_ton VARCHAR(255),
  tier VARCHAR(20) DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  is_active BOOLEAN DEFAULT true,
  subscription_status VARCHAR(20) DEFAULT 'active' CHECK (subscription_status IN ('active', 'grace_period', 'inactive')),
  next_payment_due TIMESTAMP,
  grace_period_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE shops IS 'Stores shops - any user with a shop becomes a seller';
COMMENT ON COLUMN shops.owner_id IS 'Reference to shop owner (user becomes seller by creating shop)';
COMMENT ON COLUMN shops.registration_paid IS 'Whether initial subscription payment was confirmed';
COMMENT ON COLUMN shops.is_active IS 'Shop activation status (deactivated after grace period expires)';
COMMENT ON COLUMN shops.tier IS 'Subscription tier: free ($25/month) or pro ($35/month)';
COMMENT ON COLUMN shops.subscription_status IS 'active: paid, grace_period: 2 days after expiry, inactive: deactivated';
COMMENT ON COLUMN shops.next_payment_due IS 'Next monthly subscription payment due date';
COMMENT ON COLUMN shops.grace_period_until IS 'Grace period end date (2 days after payment due)';

-- ============================================
-- Products table
-- ============================================
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(18, 8) NOT NULL CHECK (price > 0),
  currency VARCHAR(10) DEFAULT 'USD',
  stock_quantity INT DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE products IS 'Stores products for each shop';
COMMENT ON COLUMN products.price IS 'Product price in USD (8 decimal precision)';
COMMENT ON COLUMN products.currency IS 'Legacy field - products are priced in USD only';
COMMENT ON COLUMN products.stock_quantity IS 'Available stock quantity';

-- ============================================
-- Shop follows table
-- ============================================
CREATE TABLE shop_follows (
  id SERIAL PRIMARY KEY,
  follower_shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  source_shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('monitor', 'resell')),
  markup_percentage DECIMAL(5, 2) DEFAULT 0 CHECK (markup_percentage >= 0 AND markup_percentage <= 500),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_shop_id, source_shop_id),
  CHECK (follower_shop_id != source_shop_id)
);

COMMENT ON TABLE shop_follows IS 'Tracks follower→source shop relationships for dropshipping/reseller functionality';
COMMENT ON COLUMN shop_follows.mode IS 'monitor: just watch, resell: auto-copy with markup';
COMMENT ON COLUMN shop_follows.markup_percentage IS 'Markup percentage for resell mode (1-500%)';

-- ============================================
-- Synced products table
-- ============================================
CREATE TABLE synced_products (
  id SERIAL PRIMARY KEY,
  follow_id INT NOT NULL REFERENCES shop_follows(id) ON DELETE CASCADE,
  synced_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  conflict_status VARCHAR(20) DEFAULT 'synced' CHECK (conflict_status IN ('synced', 'conflict', 'manual_override')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(synced_product_id),
  UNIQUE(follow_id, source_product_id),
  CHECK (synced_product_id != source_product_id)
);

COMMENT ON TABLE synced_products IS 'Tracks synced products between follower and source shops';
COMMENT ON COLUMN synced_products.conflict_status IS 'synced: in sync, conflict: manual edits detected, manual_override: user kept manual edits';

-- Indexes for follow tables
CREATE INDEX idx_shop_follows_follower ON shop_follows(follower_shop_id);
CREATE INDEX idx_shop_follows_source ON shop_follows(source_shop_id);
CREATE INDEX idx_shop_follows_status ON shop_follows(status);
CREATE INDEX idx_shop_follows_mode ON shop_follows(mode);

CREATE INDEX idx_synced_products_follow ON synced_products(follow_id);
CREATE INDEX idx_synced_products_source ON synced_products(source_product_id);
CREATE INDEX idx_synced_products_synced ON synced_products(synced_product_id);
CREATE INDEX idx_synced_products_conflict ON synced_products(conflict_status);

-- ============================================
-- Orders table
-- ============================================
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  buyer_id INT REFERENCES users(id) ON DELETE SET NULL,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_price DECIMAL(18, 8) NOT NULL CHECK (total_price > 0),
  currency VARCHAR(10) NOT NULL,
  delivery_address VARCHAR(255),
  payment_hash VARCHAR(255),
  payment_address VARCHAR(255),
  status VARCHAR(20) CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP,
  completed_at TIMESTAMP
);

COMMENT ON TABLE orders IS 'Stores customer orders';
COMMENT ON COLUMN orders.payment_hash IS 'Blockchain transaction hash';
COMMENT ON COLUMN orders.status IS 'Order status: pending, confirmed, shipped, delivered, cancelled';

-- ============================================
-- Order items table
-- ============================================
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT DEFAULT 1 CHECK (quantity > 0),
  price DECIMAL(18, 8) NOT NULL CHECK (price > 0),
  currency VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE order_items IS 'Stores individual items in each order';
COMMENT ON COLUMN order_items.product_name IS 'Cached product name (in case product is deleted)';

-- ============================================
-- Subscriptions table
-- ============================================
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  telegram_id BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);

COMMENT ON TABLE subscriptions IS 'Stores user subscriptions to shops for notifications';

-- ============================================
-- Payments table (for crypto payment verification)
-- ============================================
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tx_hash VARCHAR(255) UNIQUE NOT NULL,
    amount DECIMAL(18, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT', 'TON')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
    confirmations INTEGER DEFAULT 0,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'Stores crypto payment verification records';
COMMENT ON COLUMN payments.tx_hash IS 'Blockchain transaction hash';
COMMENT ON COLUMN payments.confirmations IS 'Number of blockchain confirmations';

-- ============================================
-- Channel Migrations table (PRO feature)
-- ============================================
CREATE TABLE channel_migrations (
  id SERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  old_channel_url TEXT,
  new_channel_url TEXT NOT NULL,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

COMMENT ON TABLE channel_migrations IS 'Logs channel migration broadcasts for PRO shop owners';
COMMENT ON COLUMN channel_migrations.sent_count IS 'Number of successfully sent messages';
COMMENT ON COLUMN channel_migrations.failed_count IS 'Number of failed message deliveries';

-- ============================================
-- Shop Subscriptions table (Recurring Payments)
-- ============================================
CREATE TABLE shop_subscriptions (
  id SERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('free', 'pro')),
  amount DECIMAL(10, 2) NOT NULL,
  tx_hash VARCHAR(255) UNIQUE NOT NULL,
  currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT', 'TON')),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);

COMMENT ON TABLE shop_subscriptions IS 'Stores monthly subscription payments for shops (free $25/mo, pro $35/mo)';
COMMENT ON COLUMN shop_subscriptions.tier IS 'Subscription tier: free ($25) or pro ($35)';
COMMENT ON COLUMN shop_subscriptions.amount IS 'Payment amount in USD';
COMMENT ON COLUMN shop_subscriptions.tx_hash IS 'Blockchain transaction hash for verification';
COMMENT ON COLUMN shop_subscriptions.period_start IS 'Start date of subscription period';
COMMENT ON COLUMN shop_subscriptions.period_end IS 'End date of subscription period (30 days from start)';
COMMENT ON COLUMN shop_subscriptions.status IS 'active: valid, expired: period ended, cancelled: refunded';

-- ============================================
-- Functions for updated_at timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- Triggers for updated_at
-- ============================================
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shops_updated_at BEFORE UPDATE ON shops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Indexes to improve query performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_selected_role ON users(selected_role);
CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_tier ON shops(tier);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_active ON products(shop_id, is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_shop ON subscriptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_telegram_id ON subscriptions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_status ON payments(order_id, status);
CREATE INDEX IF NOT EXISTS idx_channel_migrations_shop ON channel_migrations(shop_id);
CREATE INDEX IF NOT EXISTS idx_channel_migrations_status ON channel_migrations(status);
CREATE INDEX IF NOT EXISTS idx_channel_migrations_created ON channel_migrations(created_at);
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_shop ON shop_subscriptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_status ON shop_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_period_end ON shop_subscriptions(period_end);
CREATE INDEX IF NOT EXISTS idx_shops_subscription_status ON shops(subscription_status);
CREATE INDEX IF NOT EXISTS idx_shops_next_payment_due ON shops(next_payment_due);
