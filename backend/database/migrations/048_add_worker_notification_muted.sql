-- ============================================
-- Migration: 048_add_worker_notification_muted
-- Description: Add notification_muted column to shop_workers table
-- Author: Backend Architect
-- Date: 2025-12-01
-- Dependencies: 002_add_shop_workers
-- ============================================

-- UP
BEGIN;

-- Add notification_muted column (default false = notifications enabled)
ALTER TABLE shop_workers
ADD COLUMN IF NOT EXISTS notification_muted BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN shop_workers.notification_muted IS 'If true, worker does not receive order notifications for this shop';

COMMIT;

-- DOWN
BEGIN;
ALTER TABLE shop_workers DROP COLUMN IF EXISTS notification_muted;
COMMIT;
