-- Migration: Add needs_review and late_confirmed statuses for late payment handling
-- These statuses are used when a payment is confirmed on-chain but invoice has expired
-- Created: 2025-12-07

BEGIN;

-- 1. Add needs_review to payment status constraint
-- First drop existing constraint, then add new one
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'processing', 'confirmed', 'failed', 'needs_review'));

-- 2. Add late_confirmed to verification_status constraint
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_verification_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_verification_status_check
  CHECK (verification_status IN ('pending', 'verifying', 'confirmed', 'failed', 'expired', 'late_confirmed'));

-- 3. Add index for finding needs_review payments (admin queries)
CREATE INDEX IF NOT EXISTS idx_payments_needs_review
  ON payments(status)
  WHERE status = 'needs_review';

-- 4. Add reviewed_at and reviewed_by columns for admin audit trail
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- 5. Add comment for documentation
COMMENT ON COLUMN payments.reviewed_at IS 'When admin reviewed the late payment';
COMMENT ON COLUMN payments.reviewed_by IS 'Admin user who reviewed the payment';
COMMENT ON COLUMN payments.review_notes IS 'Admin notes about the review decision';

COMMIT;

-- ============================================
-- ROLLBACK (run manually if needed)
-- ============================================
-- BEGIN;
-- ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
-- ALTER TABLE payments ADD CONSTRAINT payments_status_check
--   CHECK (status IN ('pending', 'processing', 'confirmed', 'failed'));
--
-- ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_verification_status_check;
-- ALTER TABLE payments ADD CONSTRAINT payments_verification_status_check
--   CHECK (verification_status IN ('pending', 'verifying', 'confirmed', 'failed', 'expired'));
--
-- DROP INDEX IF EXISTS idx_payments_needs_review;
-- ALTER TABLE payments DROP COLUMN IF EXISTS reviewed_at;
-- ALTER TABLE payments DROP COLUMN IF EXISTS reviewed_by;
-- ALTER TABLE payments DROP COLUMN IF EXISTS review_notes;
-- COMMIT;
