-- ============================================
-- Migration 043: Direct Crypto Payments Support
-- ============================================

-- 1. Add verification fields to payments table
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS blockchain_confirmations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS verification_error VARCHAR(255),
ADD COLUMN IF NOT EXISTS recipient_address VARCHAR(255),
ADD COLUMN IF NOT EXISTS expected_crypto_amount DECIMAL(20, 8);

-- Add constraint for verification_status
DO $$ BEGIN
  ALTER TABLE payments ADD CONSTRAINT payments_verification_status_check
    CHECK (verification_status IN ('pending', 'verifying', 'confirmed', 'failed', 'expired'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add crypto details to orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS crypto_amount DECIMAL(20, 8),
ADD COLUMN IF NOT EXISTS crypto_currency VARCHAR(10);

-- 3. Indexes for worker performance
CREATE INDEX IF NOT EXISTS idx_payments_pending_verification
ON payments(status, created_at) WHERE status = 'pending' AND subscription_id IS NULL;

-- 4. Unique index for tx_hash (double-spend protection)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tx_hash_unique 
ON payments(tx_hash) WHERE tx_hash IS NOT NULL;

-- 5. Index for order crypto payment lookup
CREATE INDEX IF NOT EXISTS idx_orders_crypto_payment
ON orders(id, crypto_currency) WHERE crypto_currency IS NOT NULL;

COMMENT ON COLUMN payments.verification_status IS 'Blockchain verification status';
COMMENT ON COLUMN payments.blockchain_confirmations IS 'Number of blockchain confirmations';
COMMENT ON COLUMN orders.crypto_amount IS 'Amount in cryptocurrency';
COMMENT ON COLUMN orders.crypto_currency IS 'Selected cryptocurrency (BTC, ETH, LTC, USDT_TRC20)';
