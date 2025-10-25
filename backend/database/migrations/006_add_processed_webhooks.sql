-- ============================================
-- Migration: 006_add_processed_webhooks
-- Description: Add processed_webhooks table for replay attack protection
-- Author: Claude Code
-- Date: 2025-10-25
-- Dependencies: 005_prevent_circular_follows
-- ============================================

-- UP
BEGIN;

CREATE TABLE processed_webhooks (
  id SERIAL PRIMARY KEY,
  webhook_id VARCHAR(255) UNIQUE NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('blockcypher', 'etherscan', 'trongrid')),
  tx_hash VARCHAR(255) NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  payload JSONB
);

COMMENT ON TABLE processed_webhooks IS 'Webhook deduplication table to prevent replay attacks';
COMMENT ON COLUMN processed_webhooks.webhook_id IS 'Unique identifier from webhook (tx_hash + source)';
COMMENT ON COLUMN processed_webhooks.source IS 'Webhook source: blockcypher, etherscan, trongrid';
COMMENT ON COLUMN processed_webhooks.tx_hash IS 'Transaction hash from blockchain';

-- Indexes
CREATE INDEX idx_processed_webhooks_webhook_id ON processed_webhooks(webhook_id);
CREATE INDEX idx_processed_webhooks_tx_hash ON processed_webhooks(tx_hash);
CREATE INDEX idx_processed_webhooks_processed_at ON processed_webhooks(processed_at);

-- Cleanup old webhooks (older than 7 days) - prevents table bloat
-- This will be called by cron job or manually
CREATE OR REPLACE FUNCTION cleanup_old_webhooks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM processed_webhooks
  WHERE processed_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- DOWN
BEGIN;
DROP FUNCTION IF EXISTS cleanup_old_webhooks();
DROP TABLE IF EXISTS processed_webhooks CASCADE;
COMMIT;
