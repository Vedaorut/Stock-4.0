-- Migration 049: Add refresh_tokens table
-- Stores refresh tokens for JWT token rotation
-- Enables secure token refresh flow without storing passwords

-- Create refresh_tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Partial index for active (non-revoked) tokens that haven't expired
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active
  ON refresh_tokens(expires_at)
  WHERE revoked_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE refresh_tokens IS 'Stores refresh tokens for JWT rotation and session management';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of the actual token (never store raw tokens)';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'Token expiration time in UTC';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Timestamp when token was explicitly revoked (logout, password change)';
