-- Migration 070: Convert TIMESTAMP to TIMESTAMPTZ
-- STATUS: SCHEDULED - DO NOT APPLY without staging test
--
-- This migration converts all timestamp columns to timestamptz for proper
-- timezone handling. It includes backfill to interpret existing values as UTC.
--
-- RISK: LOW (data preserving, but requires testing)
-- DOWNTIME: NONE (ALTER TYPE is instant in PostgreSQL 12+)
-- ROLLBACK: Included below
--
-- Prerequisites:
-- 1. Backup database before applying
-- 2. Test on staging environment first
-- 3. Verify all comparisons use UTC after migration

-- ============================================================================
-- STEP 1: SHOPS TABLE (CRITICAL - subscription expiry)
-- ============================================================================

-- Convert next_payment_due (used in checkExpiredSubscriptions)
ALTER TABLE shops
  ALTER COLUMN next_payment_due TYPE TIMESTAMPTZ
  USING next_payment_due AT TIME ZONE 'UTC';

-- Convert grace_period_until (used in checkExpiredSubscriptions)
ALTER TABLE shops
  ALTER COLUMN grace_period_until TYPE TIMESTAMPTZ
  USING grace_period_until AT TIME ZONE 'UTC';

-- Convert trial_ends_at (used in checkExpiredTrials)
ALTER TABLE shops
  ALTER COLUMN trial_ends_at TYPE TIMESTAMPTZ
  USING trial_ends_at AT TIME ZONE 'UTC';

-- Convert created_at and updated_at (non-critical, for consistency)
ALTER TABLE shops
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE shops
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ
  USING updated_at AT TIME ZONE 'UTC';

-- ============================================================================
-- STEP 2: REFRESH_TOKENS TABLE (CRITICAL - JWT expiry)
-- ============================================================================

ALTER TABLE refresh_tokens
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ
  USING expires_at AT TIME ZONE 'UTC';

ALTER TABLE refresh_tokens
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

-- ============================================================================
-- STEP 3: SHOP_SUBSCRIPTIONS TABLE (CRITICAL - billing period)
-- ============================================================================

ALTER TABLE shop_subscriptions
  ALTER COLUMN period_start TYPE TIMESTAMPTZ
  USING period_start AT TIME ZONE 'UTC';

ALTER TABLE shop_subscriptions
  ALTER COLUMN period_end TYPE TIMESTAMPTZ
  USING period_end AT TIME ZONE 'UTC';

ALTER TABLE shop_subscriptions
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE shop_subscriptions
  ALTER COLUMN verified_at TYPE TIMESTAMPTZ
  USING verified_at AT TIME ZONE 'UTC';

-- ============================================================================
-- STEP 4: PRODUCTS TABLE (MEDIUM - discount expiry)
-- ============================================================================

ALTER TABLE products
  ALTER COLUMN discount_expires_at TYPE TIMESTAMPTZ
  USING discount_expires_at AT TIME ZONE 'UTC';

ALTER TABLE products
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE products
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ
  USING updated_at AT TIME ZONE 'UTC';

-- ============================================================================
-- STEP 5: ORDERS TABLE (MEDIUM - cleanup logic)
-- ============================================================================

ALTER TABLE orders
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE orders
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ
  USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE orders
  ALTER COLUMN paid_at TYPE TIMESTAMPTZ
  USING paid_at AT TIME ZONE 'UTC';

ALTER TABLE orders
  ALTER COLUMN completed_at TYPE TIMESTAMPTZ
  USING completed_at AT TIME ZONE 'UTC';

-- ============================================================================
-- STEP 6: PAYMENTS TABLE (MEDIUM - verification worker)
-- ============================================================================

ALTER TABLE payments
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE payments
  ALTER COLUMN last_checked_at TYPE TIMESTAMPTZ
  USING last_checked_at AT TIME ZONE 'UTC';

-- ============================================================================
-- STEP 7: OTHER TABLES (LOW priority - audit trails)
-- ============================================================================

-- Users
ALTER TABLE users
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

-- Order items
ALTER TABLE order_items
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

-- Promo codes (if expires_at exists)
-- ALTER TABLE promo_codes
--   ALTER COLUMN expires_at TYPE TIMESTAMPTZ
--   USING expires_at AT TIME ZONE 'UTC';

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================

-- Check column types after migration:
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND data_type LIKE '%timestamp%'
-- ORDER BY table_name, column_name;

-- ============================================================================
-- ROLLBACK (if needed - converts back to TIMESTAMP)
-- ============================================================================

-- WARNING: Rollback loses timezone info!
-- Only use if critical issues discovered.

-- ALTER TABLE shops ALTER COLUMN next_payment_due TYPE TIMESTAMP;
-- ALTER TABLE shops ALTER COLUMN grace_period_until TYPE TIMESTAMP;
-- ALTER TABLE shops ALTER COLUMN trial_ends_at TYPE TIMESTAMP;
-- ALTER TABLE refresh_tokens ALTER COLUMN expires_at TYPE TIMESTAMP;
-- ALTER TABLE shop_subscriptions ALTER COLUMN period_start TYPE TIMESTAMP;
-- ALTER TABLE shop_subscriptions ALTER COLUMN period_end TYPE TIMESTAMP;
-- (etc. for all columns)

-- ============================================================================
-- POST-MIGRATION CHECKLIST
-- ============================================================================

-- [ ] Verify subscription expiry works correctly
-- [ ] Verify token refresh works correctly
-- [ ] Verify trial expiry works correctly
-- [ ] Verify discount expiry works correctly
-- [ ] Verify order cleanup works correctly
-- [ ] Run integration tests
-- [ ] Monitor logs for timezone-related errors
