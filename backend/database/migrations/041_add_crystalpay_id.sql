-- Add crystalpay_id for CrystalPay integration

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS crystalpay_id VARCHAR(255);

-- Unique index for non-null values
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_crystalpay_id 
ON invoices(crystalpay_id) 
WHERE crystalpay_id IS NOT NULL;

COMMENT ON COLUMN invoices.crystalpay_id IS 'CrystalPay external invoice ID';
