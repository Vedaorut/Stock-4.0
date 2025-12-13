-- Migration 073: Add check_count column to payments table
-- Tracks number of verification attempts for TX_NOT_FOUND handling
-- Prevents infinite retry for payments with fake tx_hash

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS check_count INTEGER DEFAULT 0;

COMMENT ON COLUMN payments.check_count IS 'Number of blockchain verification attempts';

-- Add verification_status value for tx_not_found
ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_verification_status_check;

ALTER TABLE payments
ADD CONSTRAINT payments_verification_status_check
CHECK (verification_status IN ('pending', 'verifying', 'confirmed', 'failed', 'expired', 'late_confirmed', 'tx_not_found'));
