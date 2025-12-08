-- Migration: Add is_admin column to users table
-- For admin panel access control
-- Created: 2025-12-07

BEGIN;

-- Add is_admin column
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create index for admin users lookup
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN users.is_admin IS 'Whether user has admin privileges for payment review and system management';

COMMIT;

-- ============================================
-- ROLLBACK (run manually if needed)
-- ============================================
-- BEGIN;
-- DROP INDEX IF EXISTS idx_users_is_admin;
-- ALTER TABLE users DROP COLUMN IF EXISTS is_admin;
-- COMMIT;
