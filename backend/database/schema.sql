-- ============================================
-- Telegram E-Commerce Platform Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if exist (for clean migrations)
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS shop_payments CASCADE;
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
  wallet_btc VARCHAR(255),
  wallet_eth VARCHAR(255),
  wallet_usdt VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE shops IS 'Stores shops - any user with a shop becomes a seller';
COMMENT ON COLUMN shops.owner_id IS 'Reference to shop owner (user becomes seller by creating shop)';
COMMENT ON COLUMN shops.registration_paid IS 'Whether $25 registration payment was confirmed';
COMMENT ON COLUMN shops.is_active IS 'Shop activation status';

-- ============================================
-- Products table
-- ============================================
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 8) NOT NULL CHECK (price > 0),
  currency VARCHAR(10) CHECK (currency IN ('BTC', 'ETH', 'USDT')) NOT NULL,
  stock_quantity INT DEFAULT 0 CHECK (stock_quantity >= 0),
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE products IS 'Stores products for each shop';
COMMENT ON COLUMN products.price IS 'Product price in cryptocurrency (8 decimal precision)';
COMMENT ON COLUMN products.stock_quantity IS 'Available stock quantity';

-- ============================================
-- Orders table
-- ============================================
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  buyer_id INT REFERENCES users(id) ON DELETE SET NULL,
  shop_id INT REFERENCES shops(id) ON DELETE SET NULL,
  total_amount DECIMAL(10, 8) NOT NULL CHECK (total_amount > 0),
  currency VARCHAR(10) NOT NULL,
  payment_hash VARCHAR(255),
  payment_address VARCHAR(255),
  status VARCHAR(20) CHECK (status IN ('pending', 'paid', 'completed', 'cancelled')) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP,
  completed_at TIMESTAMP
);

COMMENT ON TABLE orders IS 'Stores customer orders';
COMMENT ON COLUMN orders.payment_hash IS 'Blockchain transaction hash';
COMMENT ON COLUMN orders.status IS 'Order status: pending, paid, completed, cancelled';

-- ============================================
-- Order items table
-- ============================================
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT DEFAULT 1 CHECK (quantity > 0),
  price DECIMAL(10, 8) NOT NULL CHECK (price > 0),
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
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);

COMMENT ON TABLE subscriptions IS 'Stores user subscriptions to shops for notifications';

-- ============================================
-- Shop payments table (for $25 seller activation)
-- ============================================
CREATE TABLE shop_payments (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INT REFERENCES shops(id) ON DELETE SET NULL,
  amount DECIMAL(10, 8) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL,
  payment_hash VARCHAR(255) UNIQUE,
  payment_address VARCHAR(255),
  status VARCHAR(20) CHECK (status IN ('pending', 'confirmed', 'failed')) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);

COMMENT ON TABLE shop_payments IS 'Stores $25 payments for shop activation';
COMMENT ON COLUMN shop_payments.status IS 'Payment status: pending, confirmed, failed';

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
