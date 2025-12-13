-- ============================================
-- Telegram E-Commerce Platform Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if exist (for clean migrations)
DROP TABLE IF EXISTS synced_products CASCADE;
DROP TABLE IF EXISTS shop_follows CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS shop_subscriptions CASCADE;
DROP TABLE IF EXISTS channel_migrations CASCADE;
DROP TABLE IF EXISTS shop_workers CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS processed_webhooks CASCADE;
DROP TABLE IF EXISTS promo_activations CASCADE;
DROP TABLE IF EXISTS promo_codes CASCADE;
DROP TABLE IF EXISTS shop_subscribers CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
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
  selected_role VARCHAR(20) CHECK (selected_role IN ('buyer', 'seller', 'worker')),
  language VARCHAR(10) DEFAULT 'ru',
  has_used_trial BOOLEAN DEFAULT false,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Stores all platform users';
COMMENT ON COLUMN users.telegram_id IS 'Unique Telegram user ID';

-- ============================================
-- Shops table
-- ============================================
CREATE TABLE shops (
  id SERIAL PRIMARY KEY,
  -- P0 SEC FIX: Changed CASCADE to RESTRICT to prevent accidental data loss
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  registration_paid BOOLEAN DEFAULT false,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo TEXT,
  wallet_btc VARCHAR(255),
  wallet_eth VARCHAR(255),
  wallet_usdt VARCHAR(255),
  wallet_ltc VARCHAR(255),
  channel_url VARCHAR(255),
  invite_code VARCHAR(50),
  tier VARCHAR(20) NOT NULL DEFAULT 'pro' CHECK (tier IN ('pro', 'max')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_trial BOOLEAN DEFAULT false,
  trial_ends_at TIMESTAMP,
  subscription_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'pending', 'grace_period', 'inactive')),
  next_payment_due TIMESTAMP,
  grace_period_until TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE shops IS 'Stores shops - any user with a shop becomes a seller';
COMMENT ON COLUMN shops.owner_id IS 'Reference to shop owner (user becomes seller by creating shop)';
COMMENT ON COLUMN shops.registration_paid IS 'Whether initial subscription payment was confirmed';
COMMENT ON COLUMN shops.invite_code IS 'Personalized invite code for deep links (e.g., CoolGadgets_x7k instead of shop_123)';
COMMENT ON COLUMN shops.channel_url IS 'Telegram channel URL for shop notifications (format: @channel_name or https://t.me/channel_name)';
COMMENT ON COLUMN shops.is_active IS 'Shop activation status (deactivated after grace period expires)';
COMMENT ON COLUMN shops.tier IS 'Subscription tier: basic ($25/month, 4 products max) or pro ($35/month, unlimited)';
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
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  discount_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  original_price DECIMAL(18, 8),
  discount_expires_at TIMESTAMP,
  is_preorder BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT check_available_stock CHECK (stock_quantity >= reserved_quantity)
);

COMMENT ON TABLE products IS 'Stores products for each shop';
COMMENT ON COLUMN products.price IS 'Product price in USD (8 decimal precision)';
COMMENT ON COLUMN products.currency IS 'Legacy field - products are priced in USD only';
COMMENT ON COLUMN products.stock_quantity IS 'Total stock quantity';
COMMENT ON COLUMN products.reserved_quantity IS 'Reserved stock for pending orders (decreased after payment confirmation)';
COMMENT ON COLUMN products.discount_percentage IS 'Discount percentage (0-100). 0 = no discount';
COMMENT ON COLUMN products.original_price IS 'Original price before discount. NULL if no discount applied';
COMMENT ON COLUMN products.discount_expires_at IS 'When discount expires. NULL = permanent discount';
COMMENT ON COLUMN products.is_preorder IS 'Indicates if product is available for preorder only (not in stock yet)';

-- ============================================
-- Shop follows table
-- ============================================
CREATE TABLE shop_follows (
  id SERIAL PRIMARY KEY,
  follower_shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  source_shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('monitor', 'resell')),
  markup_type VARCHAR(20) DEFAULT 'percentage' CHECK (markup_type IN ('percentage', 'fixed')),
  markup_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
  markup_fixed DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(follower_shop_id, source_shop_id),
  CHECK (follower_shop_id != source_shop_id),
  -- Monitor mode allows 0 markup, resell requires valid markup
  CHECK (
    (mode = 'monitor' AND markup_percentage >= 0) OR
    (mode = 'resell' AND markup_percentage >= 0.1 AND markup_percentage <= 500)
  )
);

COMMENT ON TABLE shop_follows IS 'Tracks follower→source shop relationships for dropshipping/reseller functionality';
COMMENT ON COLUMN shop_follows.mode IS 'monitor: just watch, resell: auto-copy with markup';
COMMENT ON COLUMN shop_follows.markup_percentage IS 'Markup percentage for resell mode (0.1-200%) - P1-SEC-007';

-- ============================================
-- Synced products table
-- ============================================
CREATE TABLE synced_products (
  id SERIAL PRIMARY KEY,
  follow_id INT NOT NULL REFERENCES shop_follows(id) ON DELETE CASCADE,
  synced_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  conflict_status VARCHAR(20) NOT NULL DEFAULT 'synced' CHECK (conflict_status IN ('synced', 'conflict', 'manual_override')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMP,
  completed_at TIMESTAMP,
  -- Direct crypto payment fields (migration 043)
  crypto_amount DECIMAL(20, 8),
  crypto_currency VARCHAR(10),
  notification_sent BOOLEAN DEFAULT false
);

COMMENT ON TABLE orders IS 'Stores customer orders';
COMMENT ON COLUMN orders.payment_hash IS 'Blockchain transaction hash';
COMMENT ON COLUMN orders.status IS 'Order status: pending, confirmed, shipped, delivered, cancelled';
COMMENT ON COLUMN orders.crypto_amount IS 'Amount in cryptocurrency';
COMMENT ON COLUMN orders.crypto_currency IS 'Selected cryptocurrency (BTC, ETH, LTC, USDT_TRC20)';
COMMENT ON COLUMN orders.notification_sent IS 'Prevents duplicate order confirmation notifications';

CREATE INDEX idx_orders_crypto_payment
ON orders(id, crypto_currency) WHERE crypto_currency IS NOT NULL;

-- ============================================
-- Order items table
-- ============================================
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price DECIMAL(18, 8) NOT NULL CHECK (price > 0),
  currency VARCHAR(10) NOT NULL,
  stock_deducted BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE order_items IS 'Stores individual items in each order';
COMMENT ON COLUMN order_items.product_name IS 'Cached product name (in case product is deleted)';
COMMENT ON COLUMN order_items.stock_deducted IS 'Tracks if stock was actually deducted for this item (prevents double deduction on race conditions)';

-- ============================================
-- Shop Subscribers table (unified subscription system)
-- ============================================
CREATE TABLE shop_subscribers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);

COMMENT ON TABLE shop_subscribers IS 'Stores user subscriptions to shops for notifications (unified system)';
COMMENT ON COLUMN shop_subscribers.user_id IS 'User who subscribes to the shop';
COMMENT ON COLUMN shop_subscribers.shop_id IS 'Shop being subscribed to';

CREATE INDEX IF NOT EXISTS idx_shop_subscribers_user ON shop_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_subscribers_shop ON shop_subscribers(shop_id);

-- ============================================
-- Refresh Tokens table (for JWT refresh)
-- ============================================
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE refresh_tokens IS 'Stores hashed refresh tokens for JWT authentication';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA256 hash of the refresh token';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'Token expiration timestamp';

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ============================================
-- Shop Subscriptions table (Recurring Payments)
-- ============================================
CREATE TABLE shop_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INT REFERENCES shops(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('basic', 'pro', 'max')),
  amount DECIMAL(10, 2) NOT NULL,
  tx_hash VARCHAR(255) UNIQUE NOT NULL,
  currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT', 'LTC')),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'expired', 'cancelled', 'paid')),
  is_trial BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMP
);

COMMENT ON TABLE shop_subscriptions IS 'Stores monthly subscription payments for shops (basic $25/mo, pro $35/mo)';
COMMENT ON COLUMN shop_subscriptions.user_id IS 'User who created subscription (before shop is created)';
COMMENT ON COLUMN shop_subscriptions.shop_id IS 'Shop associated with subscription (NULL until payment confirmed)';
COMMENT ON COLUMN shop_subscriptions.tier IS 'Subscription tier: basic ($25, 4 products max) or pro ($35, unlimited)';
COMMENT ON COLUMN shop_subscriptions.amount IS 'Payment amount in USD';
COMMENT ON COLUMN shop_subscriptions.tx_hash IS 'Blockchain transaction hash for verification';
COMMENT ON COLUMN shop_subscriptions.period_start IS 'Start date of subscription period';
COMMENT ON COLUMN shop_subscriptions.period_end IS 'End date of subscription period (30 days from start)';
COMMENT ON COLUMN shop_subscriptions.status IS 'pending: awaiting confirmation, active: valid, expired: period ended, cancelled: refunded';

CREATE INDEX idx_shop_subscriptions_user_id ON shop_subscriptions(user_id);
CREATE INDEX idx_shop_subscriptions_shop ON shop_subscriptions(shop_id);
CREATE INDEX idx_shop_subscriptions_status ON shop_subscriptions(status);
CREATE INDEX idx_shop_subscriptions_period_end ON shop_subscriptions(period_end);
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_tx_hash ON shop_subscriptions(tx_hash);

-- ============================================
-- Payments table (for crypto payment verification)
-- ============================================
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES shop_subscriptions(id) ON DELETE CASCADE,
    tx_hash VARCHAR(255),
    amount DECIMAL(18, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT', 'LTC', 'USDT_TRC20')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'confirmed', 'failed', 'needs_review')),
    confirmations INTEGER NOT NULL DEFAULT 0,
    verified_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    -- Direct crypto verification fields (migration 043)
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verifying', 'confirmed', 'failed', 'expired', 'late_confirmed', 'tx_not_found')),
    last_checked_at TIMESTAMP,
    blockchain_confirmations INTEGER DEFAULT 0,
    check_count INTEGER DEFAULT 0,
    verification_error VARCHAR(255),
    recipient_address VARCHAR(255),
    expected_crypto_amount DECIMAL(20, 8),
    -- Admin review fields (migration 062)
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES users(id),
    review_notes TEXT,
    CONSTRAINT check_payment_reference CHECK (
        (order_id IS NOT NULL AND subscription_id IS NULL) OR
        (order_id IS NULL AND subscription_id IS NOT NULL)
    )
);

COMMENT ON TABLE payments IS 'Stores crypto payment verification records';
COMMENT ON COLUMN payments.order_id IS 'Reference to order payment (mutually exclusive with subscription_id)';
COMMENT ON COLUMN payments.subscription_id IS 'Reference to subscription payment (mutually exclusive with order_id)';
COMMENT ON COLUMN payments.tx_hash IS 'Blockchain transaction hash';
COMMENT ON COLUMN payments.confirmations IS 'Number of blockchain confirmations';
COMMENT ON COLUMN payments.verification_status IS 'Blockchain verification status';
COMMENT ON COLUMN payments.blockchain_confirmations IS 'Number of blockchain confirmations';
COMMENT ON COLUMN payments.recipient_address IS 'Payment address used for the invoice';
COMMENT ON COLUMN payments.expected_crypto_amount IS 'Expected crypto amount for verification';
COMMENT ON COLUMN payments.reviewed_at IS 'When admin reviewed the late payment';
COMMENT ON COLUMN payments.reviewed_by IS 'Admin user who reviewed the payment';
COMMENT ON COLUMN payments.review_notes IS 'Admin notes about the review decision';
COMMENT ON COLUMN payments.check_count IS 'Number of blockchain verification attempts';

CREATE INDEX idx_payments_pending_verification
ON payments(status, created_at) WHERE status = 'pending' AND subscription_id IS NULL;

CREATE UNIQUE INDEX idx_payments_tx_hash_unique
ON payments(tx_hash) WHERE tx_hash IS NOT NULL;

CREATE INDEX idx_payments_needs_review
ON payments(status) WHERE status = 'needs_review';


-- ============================================
-- Promo Codes table (migration 022)
-- ============================================
CREATE TABLE promo_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_percentage DECIMAL(5, 2) NOT NULL CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  tier VARCHAR(10) NOT NULL CHECK (tier IN ('basic', 'pro', 'max')),
  max_uses INT DEFAULT NULL,
  used_count INT DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMP DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_max_uses CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT check_used_count_limit CHECK (max_uses IS NULL OR used_count <= max_uses)
);

CREATE INDEX idx_promo_codes_code ON promo_codes(code) WHERE is_active = true;
CREATE INDEX idx_promo_codes_active ON promo_codes(is_active, expires_at);

COMMENT ON TABLE promo_codes IS 'Database-driven promo codes for subscription discounts';
COMMENT ON COLUMN promo_codes.code IS 'Promo code string (case-insensitive)';
COMMENT ON COLUMN promo_codes.discount_percentage IS 'Discount percentage (0-100)';
COMMENT ON COLUMN promo_codes.tier IS 'Tier this promo applies to: basic or pro';
COMMENT ON COLUMN promo_codes.max_uses IS 'Maximum number of uses. NULL = unlimited';
COMMENT ON COLUMN promo_codes.used_count IS 'Current usage count';
COMMENT ON COLUMN promo_codes.expires_at IS 'Expiration timestamp. NULL = never expires';
COMMENT ON COLUMN promo_codes.is_active IS 'Whether promo code is active';

CREATE OR REPLACE FUNCTION update_promo_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_promo_codes_updated_at
BEFORE UPDATE ON promo_codes
FOR EACH ROW
EXECUTE FUNCTION update_promo_codes_updated_at();

-- ============================================
-- Promo Activations table
-- ============================================
CREATE TABLE promo_activations (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  promo_code VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, promo_code)
);

COMMENT ON TABLE promo_activations IS 'Tracks promo code activations to prevent duplicate usage';
COMMENT ON COLUMN promo_activations.user_id IS 'User who activated the promo code';
COMMENT ON COLUMN promo_activations.shop_id IS 'Shop created with promo code';
COMMENT ON COLUMN promo_activations.promo_code IS 'Promo code used (e.g., comi9999)';

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


-- ============================================
-- Shop Workers table (Workspace - PRO feature)
-- ============================================
CREATE TABLE shop_workers (
  id SERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id BIGINT,
  added_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shop_id, worker_user_id)
);

COMMENT ON TABLE shop_workers IS 'Workers assigned to shops (PRO feature: owner can share shop access)';
COMMENT ON COLUMN shop_workers.worker_user_id IS 'User ID of the worker (must exist in users table)';
COMMENT ON COLUMN shop_workers.added_by IS 'User ID of the person who added this worker (usually shop owner)';

-- ============================================
-- Invoices table (HD wallet address-per-payment)
-- ============================================
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  subscription_id INT REFERENCES shop_subscriptions(id) ON DELETE CASCADE,
  chain VARCHAR(20) NOT NULL CHECK (chain IN ('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'LTC', 'CRYSTALPAY')),
  address VARCHAR(255),
  address_index INT,
  expected_amount DECIMAL(18, 8) NOT NULL CHECK (expected_amount > 0),
  crypto_amount DECIMAL(20, 8),
  usd_rate DECIMAL(20, 2),
  currency VARCHAR(10) NOT NULL,
  tatum_subscription_id VARCHAR(255),
  crystalpay_id VARCHAR(255),
  crystalpay_url TEXT,
  paid_at TIMESTAMP,
  tx_hash VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  purpose VARCHAR(50),
  CONSTRAINT check_invoice_reference CHECK (
    (order_id IS NOT NULL AND subscription_id IS NULL) OR
    (order_id IS NULL AND subscription_id IS NOT NULL)
  )
);

COMMENT ON TABLE invoices IS 'Payment invoices with unique addresses generated via HD wallet (BIP44 derivation)';
COMMENT ON COLUMN invoices.order_id IS 'Reference to order (mutually exclusive with subscription_id)';
COMMENT ON COLUMN invoices.subscription_id IS 'Reference to subscription payment (mutually exclusive with order_id)';
COMMENT ON COLUMN invoices.chain IS 'Blockchain: BTC, ETH, USDT_ERC20, USDT_TRC20, LTC, or CRYSTALPAY (external gateway)';
COMMENT ON COLUMN invoices.address IS 'Unique payment address generated from HD wallet';
COMMENT ON COLUMN invoices.address_index IS 'Derivation index for HD wallet (m/44''/0''/0''/0/{index})';
COMMENT ON COLUMN invoices.expected_amount IS 'Expected payment amount (USD for subscriptions, crypto for orders)';
COMMENT ON COLUMN invoices.crypto_amount IS 'Exact crypto amount to pay (USD converted at invoice creation)';
COMMENT ON COLUMN invoices.usd_rate IS 'USD exchange rate at invoice creation time';
COMMENT ON COLUMN invoices.tatum_subscription_id IS 'Webhook subscription ID for payment monitoring (BlockCypher for BTC/LTC)';
COMMENT ON COLUMN invoices.expires_at IS 'Invoice expiration time (30 minutes for subscriptions, 1 hour for orders)';

-- ============================================
-- Processed Webhooks table (Replay protection)
-- ============================================
CREATE TABLE processed_webhooks (
  id SERIAL PRIMARY KEY,
  webhook_id VARCHAR(255) UNIQUE NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('blockcypher', 'etherscan', 'trongrid')),
  tx_hash VARCHAR(255) NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  payload JSONB
);

COMMENT ON TABLE processed_webhooks IS 'Webhook deduplication table to prevent replay attacks';
COMMENT ON COLUMN processed_webhooks.webhook_id IS 'Unique identifier from webhook (tx_hash + source)';
COMMENT ON COLUMN processed_webhooks.source IS 'Webhook source: blockcypher, etherscan, trongrid';
COMMENT ON COLUMN processed_webhooks.tx_hash IS 'Transaction hash from blockchain';

CREATE INDEX idx_processed_webhooks_webhook_id ON processed_webhooks(webhook_id);
CREATE INDEX idx_processed_webhooks_tx_hash ON processed_webhooks(tx_hash);
CREATE INDEX idx_processed_webhooks_processed_at ON processed_webhooks(processed_at);

CREATE OR REPLACE FUNCTION cleanup_old_webhooks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM processed_webhooks
  WHERE processed_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Views
-- ============================================

-- Products with calculated available quantity
CREATE OR REPLACE VIEW products_with_availability AS
SELECT 
  p.*,
  (p.stock_quantity - p.reserved_quantity) AS available_quantity
FROM products p;

COMMENT ON VIEW products_with_availability IS 'Convenience view showing products with calculated available_quantity field (stock_quantity - reserved_quantity)';

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

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Indexes to improve query performance
-- ============================================
-- Auth optimization: composite index for telegram_id + selected_role
CREATE INDEX IF NOT EXISTS idx_users_telegram_role ON users(telegram_id, selected_role);
CREATE INDEX IF NOT EXISTS idx_users_selected_role ON users(selected_role);
CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_tier ON shops(tier);
CREATE INDEX IF NOT EXISTS idx_shops_channel_url ON shops(channel_url);
-- Invite code uniqueness for personalized deep links
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_invite_code ON shops(invite_code) WHERE invite_code IS NOT NULL;
-- Shop name uniqueness: case-insensitive unique constraint via functional index
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_name_unique_lower ON shops(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_active ON products(shop_id, is_active);
-- Partial index for active products only (20-30% faster, smaller index)
CREATE INDEX IF NOT EXISTS idx_products_shop_active_partial ON products(shop_id) WHERE is_active = true;
-- Composite index for availability checks (stock reservation system)
CREATE INDEX IF NOT EXISTS idx_products_availability ON products(id, stock_quantity, reserved_quantity) WHERE is_active = true;
-- Partial index for active discounts (filtering products with discounts)
CREATE INDEX IF NOT EXISTS idx_products_discount_active ON products(shop_id, discount_percentage, discount_expires_at) WHERE discount_percentage > 0;
-- Partial index for preorder products
CREATE INDEX IF NOT EXISTS idx_products_preorder ON products(shop_id, is_preorder) WHERE is_preorder = true;
-- shop_subscribers indexes are created with table definition above
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_status ON payments(order_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
-- Payment verification optimization: tx_hash lookup (40-60ms faster)
CREATE INDEX IF NOT EXISTS idx_payments_tx_hash ON payments(tx_hash);
-- Direct crypto payment verification indexes (migration 043)
CREATE INDEX IF NOT EXISTS idx_payments_pending_verification ON payments(status, created_at) WHERE status = 'pending' AND subscription_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tx_hash_unique ON payments(tx_hash) WHERE tx_hash IS NOT NULL;
-- Order crypto payment lookup (migration 043)
CREATE INDEX IF NOT EXISTS idx_orders_crypto_payment ON orders(id, crypto_currency) WHERE crypto_currency IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_migrations_shop ON channel_migrations(shop_id);
CREATE INDEX IF NOT EXISTS idx_channel_migrations_status ON channel_migrations(status);
CREATE INDEX IF NOT EXISTS idx_channel_migrations_created ON channel_migrations(created_at);

CREATE INDEX IF NOT EXISTS idx_shops_subscription_status ON shops(subscription_status);
CREATE INDEX IF NOT EXISTS idx_shops_next_payment_due ON shops(next_payment_due);

-- Shop workers indexes
CREATE INDEX IF NOT EXISTS idx_shop_workers_shop ON shop_workers(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_workers_user ON shop_workers(worker_user_id);
CREATE INDEX IF NOT EXISTS idx_shop_workers_added_by ON shop_workers(added_by);

-- Promo activations indexes
CREATE INDEX IF NOT EXISTS idx_promo_activations_user ON promo_activations(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_activations_shop ON promo_activations(shop_id);
CREATE INDEX IF NOT EXISTS idx_promo_activations_code ON promo_activations(promo_code);

-- Invoices indexes
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_address ON invoices(address);
-- Note: idx_invoices_status removed (redundant with idx_invoices_status_expires)
CREATE INDEX IF NOT EXISTS idx_invoices_chain ON invoices(chain);
CREATE INDEX IF NOT EXISTS idx_invoices_expires_at ON invoices(expires_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status_expires ON invoices(status, expires_at);

-- Additional performance indexes (from audit)
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_status ON orders(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
-- Notification tracking index (migration 059)
CREATE INDEX IF NOT EXISTS idx_orders_notification_pending ON orders(status, notification_sent) WHERE notification_sent = false AND status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_shop_follows_follower_status ON shop_follows(follower_shop_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_follows_source_status ON shop_follows(source_shop_id, status);
-- Partial index for active shop follows (faster dropshipping queries)
CREATE INDEX IF NOT EXISTS idx_shop_follows_active_partial ON shop_follows(follower_shop_id, source_shop_id) WHERE status = 'active';

-- ============================================
-- Circular Follow Prevention Trigger
-- ============================================
CREATE OR REPLACE FUNCTION check_circular_follow()
RETURNS TRIGGER AS $$
BEGIN
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

-- ============================================
-- Chain Copy Prevention Trigger
-- Prevents copying products that are already synced copies
-- ============================================
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

CREATE TRIGGER prevent_copy_of_copy
BEFORE INSERT ON synced_products
FOR EACH ROW EXECUTE FUNCTION check_source_not_copy();
