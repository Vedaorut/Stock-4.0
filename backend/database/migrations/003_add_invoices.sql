-- ============================================
-- Migration: 003_add_invoices
-- Description: Add invoices table for Tatum address-per-payment system
-- Author: Database Designer
-- Date: 2025-10-25
-- Dependencies: 002_add_shop_workers
-- ============================================

-- UP
BEGIN;

CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  chain VARCHAR(20) NOT NULL CHECK (chain IN ('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'LTC', 'TON')),
  address VARCHAR(255) UNIQUE NOT NULL,
  address_index INT NOT NULL,
  expected_amount DECIMAL(18, 8) NOT NULL CHECK (expected_amount > 0),
  currency VARCHAR(10) NOT NULL,
  tatum_subscription_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE invoices IS 'Payment invoices with unique addresses generated via Tatum';
COMMENT ON COLUMN invoices.chain IS 'Blockchain: BTC, ETH, USDT_ERC20, USDT_TRC20, LTC, TON';
COMMENT ON COLUMN invoices.address IS 'Unique payment address generated from HD wallet';
COMMENT ON COLUMN invoices.address_index IS 'Derivation index for HD wallet (m/44''/0''/0''/0/{index})';
COMMENT ON COLUMN invoices.expected_amount IS 'Expected payment amount in crypto units';
COMMENT ON COLUMN invoices.tatum_subscription_id IS 'Tatum webhook subscription ID for monitoring';
COMMENT ON COLUMN invoices.expires_at IS 'Invoice expiration time (typically 1 hour)';

-- Indexes
CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_invoices_address ON invoices(address);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_chain ON invoices(chain);
CREATE INDEX idx_invoices_expires_at ON invoices(expires_at);
CREATE INDEX idx_invoices_status_expires ON invoices(status, expires_at);

-- Trigger for updated_at
CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- DOWN
BEGIN;
DROP TABLE IF EXISTS invoices CASCADE;
COMMIT;
