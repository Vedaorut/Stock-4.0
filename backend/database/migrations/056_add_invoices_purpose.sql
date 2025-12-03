-- Migration 056: Add 'purpose' column to invoices table
-- Fixes: "column 'purpose' of relation 'invoices' does not exist" error

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(50);

-- Add index for querying invoices by purpose
CREATE INDEX IF NOT EXISTS idx_invoices_purpose ON invoices(purpose);
