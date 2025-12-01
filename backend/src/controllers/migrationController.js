/**
 * Migration Controller
 *
 * Handles channel migration API endpoints for PRO shop owners
 */

import pool from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import * as rateLimit from '../services/rateLimit.js';
import * as broadcastService from '../services/broadcastService.js';

/**
 * Check migration eligibility (PRO tier + rate limits)
 * GET /api/shops/:shopId/migration/check
 */
const checkMigrationEligibility = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    // Verify shop ownership
    const shopResult = await pool.query(
      'SELECT id, name, owner_id, tier, channel_url FROM shops WHERE id = $1',
      [shopId]
    );

    if (shopResult.rows.length === 0) {
      throw new NotFoundError('Shop');
    }

    const shop = shopResult.rows[0];

    if (shop.owner_id !== userId) {
      throw new UnauthorizedError('Not authorized to manage this shop');
    }

    // Validate migration eligibility
    const validation = await rateLimit.validateMigration(shopId);

    if (!validation.valid) {
      return res.status(200).json({
        eligible: false,
        error: validation.error,
        message: validation.message,
        data: validation.data,
      });
    }

    // Get subscriber count
    const subscribers = await broadcastService.getShopSubscribers(shopId);

    res.json({
      eligible: true,
      shop: {
        id: shop.id,
        name: shop.name,
        tier: shop.tier,
      },
      limits: validation.data,
      subscriberCount: subscribers.length,
    });
  } catch (error) {
    logger.error('[MigrationController] Error checking eligibility:', error);
    throw error;
  }
});

/**
 * Initiate channel migration broadcast
 * POST /api/shops/:shopId/migration
 * Body: { newChannelUrl: string, oldChannelUrl?: string }
 */
const initiateMigration = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;
    const { newChannelUrl, oldChannelUrl } = req.body;

    // Validate required fields
    if (!newChannelUrl) {
      throw new ValidationError('newChannelUrl is required');
    }

    // Verify shop ownership
    const shopResult = await pool.query(
      'SELECT id, name, owner_id, tier FROM shops WHERE id = $1',
      [shopId]
    );

    if (shopResult.rows.length === 0) {
      throw new NotFoundError('Shop');
    }

    const shop = shopResult.rows[0];

    if (shop.owner_id !== userId) {
      throw new UnauthorizedError('Not authorized to manage this shop');
    }

    // Validate migration eligibility
    const validation = await rateLimit.validateMigration(shopId);

    if (!validation.valid) {
      return res.status(403).json({
        error: validation.error,
        message: validation.message,
      });
    }

    // Get subscriber count
    const subscribers = await broadcastService.getShopSubscribers(shopId);

    // Start broadcast in background (non-blocking)
    setImmediate(async () => {
      try {
        await broadcastService.broadcastMigration(
          shopId,
          shop.name,
          newChannelUrl,
          oldChannelUrl || null
        );

        // Update shop with new channel URL after successful broadcast
        await pool.query('UPDATE shops SET channel_url = $1, updated_at = NOW() WHERE id = $2', [
          newChannelUrl,
          shopId,
        ]);

        logger.info(
          `[MigrationController] Broadcast completed for shop ${shopId}, channel_url updated`
        );
      } catch (error) {
        logger.error(`[MigrationController] Broadcast failed for shop ${shopId}:`, error);
      }
    });

    logger.info(
      `[MigrationController] Migration initiated for shop ${shopId}, ${subscribers.length} subscribers`
    );

    // Return immediately without waiting for broadcast
    res.status(202).json({
      shopId,
      shopName: shop.name,
      newChannelUrl,
      oldChannelUrl: shop.channel_url || oldChannelUrl || null,
      subscriberCount: subscribers.length,
      status: 'processing',
      message: `Broadcast started. ${subscribers.length} subscribers will be notified.`,
      estimatedDuration: Math.ceil(subscribers.length * 0.1), // seconds
    });
  } catch (error) {
    logger.error('[MigrationController] Error initiating migration:', error);
    throw error;
  }
});

/**
 * Get migration status
 * GET /api/shops/:shopId/migration/:migrationId
 */
const getMigrationStatus = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const migrationId = parseInt(req.params.migrationId, 10);
    const userId = req.user.id;

    // Verify shop ownership
    const shopResult = await pool.query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);

    if (shopResult.rows.length === 0) {
      throw new NotFoundError('Shop');
    }

    if (shopResult.rows[0].owner_id !== userId) {
      throw new UnauthorizedError('Not authorized');
    }

    // Get migration status
    const migration = await broadcastService.getMigrationStatus(migrationId);

    if (!migration || migration.shop_id !== shopId) {
      throw new NotFoundError('Migration');
    }

    res.json(migration);
  } catch (error) {
    logger.error('[MigrationController] Error getting migration status:', error);
    throw error;
  }
});

/**
 * Get migration history for a shop
 * GET /api/shops/:shopId/migration/history
 */
const getMigrationHistory = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 10;

    // Verify shop ownership
    const shopResult = await pool.query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);

    if (shopResult.rows.length === 0) {
      throw new NotFoundError('Shop');
    }

    if (shopResult.rows[0].owner_id !== userId) {
      throw new UnauthorizedError('Not authorized');
    }

    // Get migration history
    const history = await rateLimit.getMigrationHistory(shopId, limit);

    res.json({
      shopId,
      migrations: history,
    });
  } catch (error) {
    logger.error('[MigrationController] Error getting migration history:', error);
    throw error;
  }
});

export { checkMigrationEligibility, initiateMigration, getMigrationStatus, getMigrationHistory };
