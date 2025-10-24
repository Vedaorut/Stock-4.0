/**
 * Rate Limit Service for Channel Migration Feature
 *
 * Enforces limits on channel migrations for PRO shop owners:
 * - Maximum 2 migrations per calendar month
 * - Resets on the 1st of each month
 */

import pool from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Check if shop can perform a channel migration
 * @param {number} shopId - Shop ID
 * @returns {Promise<{allowed: boolean, remaining: number, resetDate: Date}>}
 */
async function canMigrate(shopId) {
  try {
    // Get current month's start and end dates
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    // Count migrations this month
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM channel_migrations
       WHERE shop_id = $1
       AND created_at >= $2
       AND created_at <= $3`,
      [shopId, monthStart, monthEnd]
    );

    const migrationsThisMonth = parseInt(result.rows[0].count, 10);
    const maxMigrations = 2;
    const remaining = Math.max(0, maxMigrations - migrationsThisMonth);
    const allowed = remaining > 0;

    // Next reset date (1st of next month)
    const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    logger.info(`[RateLimit] Shop ${shopId}: ${migrationsThisMonth}/${maxMigrations} migrations used this month`);

    return {
      allowed,
      remaining,
      used: migrationsThisMonth,
      limit: maxMigrations,
      resetDate
    };
  } catch (error) {
    logger.error(`[RateLimit] Error checking migration limit for shop ${shopId}:`, error);
    throw error;
  }
}

/**
 * Check if shop has PRO tier
 * @param {number} shopId - Shop ID
 * @returns {Promise<boolean>}
 */
async function isProShop(shopId) {
  try {
    const result = await pool.query(
      'SELECT tier FROM shops WHERE id = $1',
      [shopId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const isPro = result.rows[0].tier === 'pro';
    logger.info(`[RateLimit] Shop ${shopId} tier: ${result.rows[0].tier}`);
    
    return isPro;
  } catch (error) {
    logger.error(`[RateLimit] Error checking PRO tier for shop ${shopId}:`, error);
    throw error;
  }
}

/**
 * Validate if shop can perform migration (PRO + within limits)
 * @param {number} shopId - Shop ID
 * @returns {Promise<{valid: boolean, error?: string, data?: object}>}
 */
async function validateMigration(shopId) {
  try {
    // Check PRO tier
    const isPro = await isProShop(shopId);
    if (!isPro) {
      return {
        valid: false,
        error: 'UPGRADE_REQUIRED',
        message: 'Channel migration is a PRO feature. Upgrade to PRO to unlock this feature.'
      };
    }

    // Check rate limit
    const limitStatus = await canMigrate(shopId);
    if (!limitStatus.allowed) {
      return {
        valid: false,
        error: 'LIMIT_EXCEEDED',
        message: `You have reached the maximum of ${limitStatus.limit} migrations per month. Resets on ${limitStatus.resetDate.toLocaleDateString()}.`,
        data: limitStatus
      };
    }

    return {
      valid: true,
      data: limitStatus
    };
  } catch (error) {
    logger.error(`[RateLimit] Error validating migration for shop ${shopId}:`, error);
    throw error;
  }
}

/**
 * Get migration history for a shop
 * @param {number} shopId - Shop ID
 * @param {number} limit - Number of records to return (default: 10)
 * @returns {Promise<Array>}
 */
async function getMigrationHistory(shopId, limit = 10) {
  try {
    const result = await pool.query(
      `SELECT id, old_channel_url, new_channel_url, sent_count, failed_count, status, created_at, completed_at
       FROM channel_migrations
       WHERE shop_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [shopId, limit]
    );

    return result.rows;
  } catch (error) {
    logger.error(`[RateLimit] Error getting migration history for shop ${shopId}:`, error);
    throw error;
  }
}

export {
  canMigrate,
  isProShop,
  validateMigration,
  getMigrationHistory
};
