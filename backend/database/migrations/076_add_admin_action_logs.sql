-- ============================================
-- Migration 076: Admin Action Logs
-- Purpose: Audit trail for all admin actions
-- Date: 2025-01-16
-- ============================================

-- Create admin_action_logs table
CREATE TABLE IF NOT EXISTS admin_action_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(20),
  target_id INTEGER,
  reason TEXT,
  notes TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_admin_id ON admin_action_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at ON admin_action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action ON admin_action_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_target ON admin_action_logs(target_type, target_id);

-- Table and column comments
COMMENT ON TABLE admin_action_logs IS 'Audit trail of all admin actions for accountability and compliance';
COMMENT ON COLUMN admin_action_logs.admin_id IS 'User ID of admin who performed the action';
COMMENT ON COLUMN admin_action_logs.action IS 'Type of action: view_users, ban_user, suspend_shop, grant_subscription, etc.';
COMMENT ON COLUMN admin_action_logs.target_type IS 'Type of target entity: user, shop, order, subscription, payment';
COMMENT ON COLUMN admin_action_logs.target_id IS 'ID of the affected entity';
COMMENT ON COLUMN admin_action_logs.reason IS 'Admin-provided reason for the action (required for ban/suspend)';
COMMENT ON COLUMN admin_action_logs.notes IS 'Optional additional notes from admin';
COMMENT ON COLUMN admin_action_logs.metadata IS 'JSONB field for flexible context (e.g., previous state, new state, duration)';
COMMENT ON COLUMN admin_action_logs.ip_address IS 'IP address of the admin who performed the action';
COMMENT ON COLUMN admin_action_logs.user_agent IS 'User agent string (browser/client info)';
COMMENT ON COLUMN admin_action_logs.created_at IS 'Timestamp when the action was performed';

-- Grant permissions (if using role-based access)
-- GRANT SELECT ON admin_action_logs TO readonly_role;
-- GRANT INSERT ON admin_action_logs TO admin_role;
