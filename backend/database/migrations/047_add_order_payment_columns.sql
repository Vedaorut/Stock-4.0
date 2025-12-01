-- Migration 047: Add payment_address and payment_hash columns to orders
-- These columns are required for direct crypto payment flow
-- Fixes: "column payment_address of relation orders does not exist" error

-- Add payment_address column (stores seller's wallet address for this order)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_address VARCHAR(100);

-- Add payment_hash column (stores buyer's transaction hash after payment)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_hash VARCHAR(100);

-- Update payments currency constraint to include USDT_TRC20
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_check;
ALTER TABLE payments ADD CONSTRAINT payments_currency_check
  CHECK (currency IN ('BTC', 'ETH', 'USDT', 'LTC', 'USDT_TRC20'));

-- Update payments status constraint to include 'processing' (used by verification worker)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'processing', 'confirmed', 'failed'));

-- Add index for payment_hash lookups (used in verification)
CREATE INDEX IF NOT EXISTS idx_orders_payment_hash ON orders(payment_hash) WHERE payment_hash IS NOT NULL;

COMMENT ON COLUMN orders.payment_address IS 'Seller wallet address assigned for this order payment';
COMMENT ON COLUMN orders.payment_hash IS 'Buyer transaction hash submitted after payment';
