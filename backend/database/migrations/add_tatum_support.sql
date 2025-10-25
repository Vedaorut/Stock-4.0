-- Migration: Add Tatum support
-- Date: 2025-01-25
-- Description: Add invoices table for address-per-payment tracking and update schema for Tatum

-- 1. Create invoices table (address-per-payment architecture)
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    chain VARCHAR(10) NOT NULL CHECK (chain IN ('BTC', 'ETH', 'LTC', 'TRON')),
    address VARCHAR(255) NOT NULL UNIQUE,
    address_index INTEGER NOT NULL,
    expected_amount DECIMAL(18, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
    tatum_subscription_id VARCHAR(255),  -- Webhook subscription ID
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Update payments table to support LTC
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_check;
ALTER TABLE payments ADD CONSTRAINT payments_currency_check
    CHECK (currency IN ('BTC', 'ETH', 'LTC', 'USDT'));

-- 3. Add tatum_subscription_id to payments (for tracking)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tatum_subscription_id VARCHAR(255);

-- 4. Add confirmations to payments (if not exists from previous version)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmations INTEGER DEFAULT 0;

-- 5. Add verified_at timestamp to payments (if not exists)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

-- 6. Create indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_address ON invoices(address);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_chain_status ON invoices(chain, status);

-- 7. Create indexes for payments (optimize webhook lookups)
CREATE INDEX IF NOT EXISTS idx_payments_tx_hash ON payments(tx_hash);
CREATE INDEX IF NOT EXISTS idx_payments_order_status ON payments(order_id, status);

-- 8. Update orders table - remove payment_hash (legacy field)
ALTER TABLE orders DROP COLUMN IF EXISTS payment_hash;

-- 9. Ensure orders.payment_address exists (for backward compatibility)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_address VARCHAR(255);

-- 10. Add migration metadata
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO schema_migrations (migration_name)
VALUES ('add_tatum_support')
ON CONFLICT (migration_name) DO NOTHING;

-- Rollback SQL (save this separately if needed):
/*
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
ALTER TABLE payments DROP COLUMN IF EXISTS tatum_subscription_id;
-- Restore old CHECK constraint:
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_check;
ALTER TABLE payments ADD CONSTRAINT payments_currency_check
    CHECK (currency IN ('BTC', 'ETH', 'USDT'));
*/
