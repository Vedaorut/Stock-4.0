/**
 * Migration Controller
 * 
 * Handles channel migration API endpoints for PRO shop owners
 */

import pool from '../config/database.js';
import logger from '../utils/logger.js';
import * as rateLimit from '../services/rateLimit.js';
import * as broadcastService from '../services/broadcastService.js';

/**
 * Check migration eligibility (PRO tier + rate limits)
 * GET /api/shops/:shopId/migration/check
 */
async function checkMigrationEligibility(req, res) {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    // Verify shop ownership
    const shopResult = await pool.query(
      'SELECT id, name, owner_id, tier FROM shops WHERE id = $1',
      [shopId]
    );

    if (shopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const shop = shopResult.rows[0];

    if (shop.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to manage this shop' });
    }

    // Validate migration eligibility
    const validation = await rateLimit.validateMigration(shopId);

    if (!validation.valid) {
      return res.status(403).json({
        eligible: false,
        error: validation.error,
        message: validation.message,
        data: validation.data
      });
    }

    // Get subscriber count
    const subscribers = await broadcastService.getShopSubscribers(shopId);

    res.json({
      eligible: true,
      shop: {
        id: shop.id,
        name: shop.name,
        tier: shop.tier
      },
      limits: validation.data,
      subscriberCount: subscribers.length
    });
  } catch (error) {
    logger.error('[MigrationController] Error checking eligibility:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Initiate channel migration broadcast
 * POST /api/shops/:shopId/migration
 * Body: { newChannelUrl: string, oldChannelUrl?: string, botInstance: object }
 */
async function initiateMigration(req, res) {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;
    const { newChannelUrl, oldChannelUrl } = req.body;

    // Validate required fields
    if (!newChannelUrl) {
      return res.status(400).json({ error: 'newChannelUrl is required' });
    }

    // Verify shop ownership
    const shopResult = await pool.query(
      'SELECT id, name, owner_id, tier FROM shops WHERE id = $1',
      [shopId]
    );

    if (shopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const shop = shopResult.rows[0];

    if (shop.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to manage this shop' });
    }

    // Validate migration eligibility
    const validation = await rateLimit.validateMigration(shopId);

    if (!validation.valid) {
      return res.status(403).json({
        error: validation.error,
        message: validation.message
      });
    }

    // Check if bot instance is available
    if (!global.botInstance) {
      return res.status(503).json({ 
        error: 'Bot service unavailable',
        message: 'Telegram bot is not running. Please contact support.'
      });
    }

    // Get subscriber count
    const subscribers = await broadcastService.getShopSubscribers(shopId);

    // Start broadcast in background (non-blocking)
    setImmediate(async () => {
      try {
        await broadcastService.broadcastMigration(
          global.botInstance,
          shopId,
          shop.name,
          newChannelUrl,
          oldChannelUrl || null
        );
        logger.info(`[MigrationController] Broadcast completed for shop ${shopId}`);
      } catch (error) {
        logger.error(`[MigrationController] Broadcast failed for shop ${shopId}:`, error);
      }
    });

    logger.info(`[MigrationController] Migration initiated for shop ${shopId}, ${subscribers.length} subscribers`);

    // Return immediately without waiting for broadcast
    res.status(202).json({
      shopId,
      shopName: shop.name,
      newChannelUrl,
      oldChannelUrl: oldChannelUrl || null,
      subscriberCount: subscribers.length,
      status: 'processing',
      message: `Broadcast started. ${subscribers.length} subscribers will be notified.`,
      estimatedDuration: Math.ceil(subscribers.length * 0.1) // seconds
    });
  } catch (error) {
    logger.error('[MigrationController] Error initiating migration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get migration status
 * GET /api/shops/:shopId/migration/:migrationId
 */
async function getMigrationStatus(req, res) {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const migrationId = parseInt(req.params.migrationId, 10);
    const userId = req.user.id;

    // Verify shop ownership
    const shopResult = await pool.query(
      'SELECT owner_id FROM shops WHERE id = $1',
      [shopId]
    );

    if (shopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    if (shopResult.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get migration status
    const migration = await broadcastService.getMigrationStatus(migrationId);

    if (!migration || migration.shop_id !== shopId) {
      return res.status(404).json({ error: 'Migration not found' });
    }

    res.json(migration);
  } catch (error) {
    logger.error('[MigrationController] Error getting migration status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get migration history for a shop
 * GET /api/shops/:shopId/migration/history
 */
async function getMigrationHistory(req, res) {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 10;

    // Verify shop ownership
    const shopResult = await pool.query(
      'SELECT owner_id FROM shops WHERE id = $1',
      [shopId]
    );

    if (shopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    if (shopResult.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get migration history
    const history = await rateLimit.getMigrationHistory(shopId, limit);

    res.json({
      shopId,
      migrations: history
    });
  } catch (error) {
    logger.error('[MigrationController] Error getting migration history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export {
  checkMigrationEligibility,
  initiateMigration,
  getMigrationStatus,
  getMigrationHistory
};
