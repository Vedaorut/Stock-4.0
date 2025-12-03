-- Migration: 052_add_payment_worker_index.sql
-- Add index for payment verification worker Smart Polling queries
--
-- Problem: Payment worker uses last_checked_at in WHERE clause but no index exists:
-- WHERE p2.status = 'pending'
--   AND p2.subscription_id IS NULL
--   AND (p2.last_checked_at IS NULL
--     OR (p2.currency IN ('BTC', 'LTC') AND p2.last_checked_at < NOW() - INTERVAL '10 minutes')
--     OR (p2.currency NOT IN ('BTC', 'LTC') AND p2.last_checked_at < NOW() - INTERVAL '2 minutes')
--   )
--
-- Solution: Partial composite index on (status, last_checked_at, currency)
-- with WHERE clause matching worker query filters

-- Create partial index for Smart Polling optimization
-- Uses CONCURRENTLY to avoid locking the table during creation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_worker_poll
ON payments(status, last_checked_at, currency)
WHERE status = 'pending' AND subscription_id IS NULL;

-- Add comment explaining the index purpose
COMMENT ON INDEX idx_payments_worker_poll IS 'Optimizes payment verification worker Smart Polling queries - filters pending order payments by last_checked_at and currency';
