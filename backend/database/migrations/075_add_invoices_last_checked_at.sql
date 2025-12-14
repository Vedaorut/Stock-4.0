-- Migration 075: Add last_checked_at column to invoices table
--
-- Purpose: Enable CrystalPay subscription payment polling in paymentVerificationWorker
-- Without this column, we cannot track when each invoice was last checked to avoid
-- excessive API calls and respect rate limits.
--
-- Created: 2025-12-14

-- Add last_checked_at column for tracking poll times
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN invoices.last_checked_at IS 'Timestamp of last polling check for CrystalPay payment status';

-- Add index for efficient polling queries
-- Worker queries: WHERE chain = 'CRYSTALPAY' AND status = 'pending' AND subscription_id IS NOT NULL
-- AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '30 seconds')
CREATE INDEX IF NOT EXISTS idx_invoices_crystalpay_poll
ON invoices(chain, status, subscription_id, last_checked_at)
WHERE chain = 'CRYSTALPAY' AND status = 'pending' AND subscription_id IS NOT NULL;

COMMENT ON INDEX idx_invoices_crystalpay_poll IS 'Optimizes CrystalPay subscription payment polling queries';

-- Rollback:
-- DROP INDEX IF EXISTS idx_invoices_crystalpay_poll;
-- ALTER TABLE invoices DROP COLUMN IF EXISTS last_checked_at;
