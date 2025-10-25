-- ============================================
-- Migration: 002_add_shop_workers
-- Description: Add shop_workers table for workspace functionality (PRO feature)
-- Author: Database Designer
-- Date: 2025-10-25
-- Dependencies: 001_initial_schema
-- ============================================

-- UP
BEGIN;

CREATE TABLE shop_workers (
  id SERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id BIGINT,
  added_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shop_id, worker_user_id)
);

COMMENT ON TABLE shop_workers IS 'Workers assigned to shops (PRO feature: owner can share shop access)';
COMMENT ON COLUMN shop_workers.worker_user_id IS 'User ID of the worker (must exist in users table)';
COMMENT ON COLUMN shop_workers.added_by IS 'User ID of the person who added this worker (usually shop owner)';

-- Indexes
CREATE INDEX idx_shop_workers_shop ON shop_workers(shop_id);
CREATE INDEX idx_shop_workers_user ON shop_workers(worker_user_id);
CREATE INDEX idx_shop_workers_added_by ON shop_workers(added_by);

COMMIT;

-- DOWN
BEGIN;
DROP TABLE IF EXISTS shop_workers CASCADE;
COMMIT;
