-- CrystalPay invoice support
-- Allow CRYSTALPAY as chain type and make address/address_index nullable

-- Step 1: Add CRYSTALPAY to chain constraint
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_chain_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_chain_check
  CHECK (chain IN ('BTC', 'ETH', 'LTC', 'USDT_TRC20', 'CRYSTALPAY'));

-- Step 2: Make address and address_index nullable (for CrystalPay invoices)
ALTER TABLE invoices ALTER COLUMN address DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN address_index DROP NOT NULL;

-- Step 3: Drop unique constraint on address (allow NULL duplicates)
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_address_key;

-- Step 4: Re-add unique index only for non-null addresses
DROP INDEX IF EXISTS idx_invoices_address_unique;
CREATE UNIQUE INDEX idx_invoices_address_unique
ON invoices(address)
WHERE address IS NOT NULL;

-- Step 5: Add subscription_new and subscription_renewal to purpose constraint
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_purpose_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_purpose_check
  CHECK (purpose IN (
    'order',
    'subscription',
    'subscription_upgrade',
    'subscription_new',
    'subscription_renewal'
  ));

-- Step 6: Add constraint for CrystalPay invoices (no address needed)
-- For CRYSTALPAY chain: address and address_index can be NULL
-- For other chains: address and address_index must be present
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS check_chain_address_consistency;
ALTER TABLE invoices ADD CONSTRAINT check_chain_address_consistency
  CHECK (
    (chain = 'CRYSTALPAY' AND address IS NULL AND address_index IS NULL)
    OR
    (chain != 'CRYSTALPAY' AND address IS NOT NULL AND address_index IS NOT NULL)
  );

COMMENT ON CONSTRAINT check_chain_address_consistency ON invoices IS
  'CrystalPay invoices have no address, HD wallet invoices require address';
