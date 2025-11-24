-- ============================================
-- Migration: 040_add_invoice_purpose
-- Description: Track invoice purpose (order vs subscription vs upgrade)
-- ============================================

BEGIN;

-- Add purpose column to invoices to distinguish flows
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS purpose VARCHAR(32);

-- Backfill existing rows based on reference
UPDATE invoices
SET purpose = CASE
  WHEN purpose IS NOT NULL THEN purpose
  WHEN subscription_id IS NOT NULL THEN 'subscription'
  ELSE 'order'
END
WHERE purpose IS NULL;

-- Enforce not null and allowed values
ALTER TABLE invoices
ALTER COLUMN purpose SET NOT NULL,
ALTER COLUMN purpose SET DEFAULT 'order';

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_purpose_check,
  ADD CONSTRAINT invoices_purpose_check
  CHECK (purpose IN ('order', 'subscription', 'subscription_upgrade'));

-- Helpful index for polling/diagnostics
CREATE INDEX IF NOT EXISTS idx_invoices_purpose ON invoices(purpose);

COMMIT;
