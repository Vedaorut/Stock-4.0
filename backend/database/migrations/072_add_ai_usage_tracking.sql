-- Migration: Add AI usage tracking for cost limits
-- Purpose: Track AI API usage per user with daily cost limits ($5/day default)

-- ============================================
-- AI Usage Log table
-- ============================================
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INT REFERENCES shops(id) ON DELETE SET NULL,
  model VARCHAR(50) NOT NULL DEFAULT 'deepseek-chat',
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
  request_type VARCHAR(50) DEFAULT 'product_ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_usage_log IS 'Tracks AI API usage per user for cost management';
COMMENT ON COLUMN ai_usage_log.user_id IS 'User who made the AI request';
COMMENT ON COLUMN ai_usage_log.shop_id IS 'Shop context for the AI request (if applicable)';
COMMENT ON COLUMN ai_usage_log.model IS 'AI model used (deepseek-chat, gpt-4, etc)';
COMMENT ON COLUMN ai_usage_log.prompt_tokens IS 'Number of input tokens';
COMMENT ON COLUMN ai_usage_log.completion_tokens IS 'Number of output tokens';
COMMENT ON COLUMN ai_usage_log.total_tokens IS 'Total tokens used';
COMMENT ON COLUMN ai_usage_log.cost_usd IS 'Calculated cost in USD based on model pricing';
COMMENT ON COLUMN ai_usage_log.request_type IS 'Type of AI request (product_ai, description_gen, etc)';

-- Indexes for efficient daily cost aggregation
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_log(created_at);

-- Note: Partial index with NOW() removed (NOW() is not IMMUTABLE)
-- The idx_ai_usage_user_date index is sufficient for daily limit checks

-- ============================================
-- AI User Settings table (for custom limits)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_user_settings (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_limit_usd DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
  is_unlimited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_user_settings IS 'Per-user AI cost limit settings';
COMMENT ON COLUMN ai_user_settings.daily_limit_usd IS 'Daily AI spending limit in USD (default $5)';
COMMENT ON COLUMN ai_user_settings.is_unlimited IS 'If true, user has no daily limit (premium users)';

CREATE INDEX IF NOT EXISTS idx_ai_user_settings_user ON ai_user_settings(user_id);
