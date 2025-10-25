import { workerQueries, shopQueries, userQueries } from '../models/db.js';
import { dbErrorHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

/**
 * Worker Controller
 * Manages shop workers (workspace functionality)
 */
export const workerController = {
  /**
   * Add worker to shop
   * POST /api/shops/:shopId/workers
   * Body: { telegram_id: number } OR { username: string }
   */
  add: async (req, res) => {
    try {
      const { shopId } = req.params;
      const { telegram_id, username } = req.body;

      const hasTelegramId = telegram_id !== undefined && telegram_id !== null && String(telegram_id).trim() !== '';
      const hasUsername = typeof username === 'string' && username.trim() !== '';

      // Validate input
      if (!hasTelegramId && !hasUsername) {
        return res.status(400).json({
          success: false,
          error: 'Telegram ID or username is required'
        });
      }

      // Verify shop exists and user is owner
      const shop = await shopQueries.findById(shopId);
      if (!shop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      if (shop.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Only shop owner can add workers'
        });
      }

      // Check PRO tier (Workspace is PRO-only feature)
      if (shop.tier !== 'pro') {
        return res.status(403).json({
          success: false,
          error: 'Workspace feature requires PRO subscription. Upgrade your shop to add workers.'
        });
      }

      // Find user by telegram_id or username
      let normalizedTelegramId = null;
      if (hasTelegramId) {
        normalizedTelegramId = Number.parseInt(String(telegram_id).trim(), 10);
        if (!Number.isInteger(normalizedTelegramId) || normalizedTelegramId <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Telegram ID must be a positive integer'
          });
        }
      }

      let workerUser = null;

      if (normalizedTelegramId) {
        workerUser = await userQueries.findByTelegramId(normalizedTelegramId);
      }

      if (!workerUser && hasUsername) {
        const cleanUsername = username.trim().startsWith('@')
          ? username.trim().slice(1)
          : username.trim();
        workerUser = await userQueries.findByUsername(cleanUsername);
      }

      if (!workerUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found. Make sure they have used the bot at least once.'
        });
      }

      // Ensure Telegram ID is available (fallback to value from DB)
      const workerTelegramId = Number(workerUser.telegram_id) || normalizedTelegramId;

      // Check if user is already the owner
      if (workerUser.id === shop.owner_id) {
        return res.status(400).json({
          success: false,
          error: 'Shop owner cannot be added as worker'
        });
      }

      // Check if already a worker
      const existing = await workerQueries.findByShopAndUser(shopId, workerUser.id);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'User is already a worker in this shop'
        });
      }

      // Add worker
      const worker = await workerQueries.create({
        shopId: parseInt(shopId, 10),
        workerUserId: workerUser.id,
        telegramId: workerTelegramId,
        addedBy: req.user.id
      });

      logger.info('Worker added to shop', {
        shopId,
        workerId: worker.id,
        workerUserId: workerUser.id,
        addedBy: req.user.id
      });

      return res.status(201).json({
        success: true,
        data: {
          id: worker.id,
          shop_id: worker.shop_id,
          worker_user_id: worker.worker_user_id,
          telegram_id: worker.telegram_id,
          username: workerUser.username,
          first_name: workerUser.first_name,
          last_name: workerUser.last_name,
          added_at: worker.created_at
        }
      });

    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

      logger.error('Add worker error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to add worker'
      });
    }
  },

  /**
   * List workers for a shop
   * GET /api/shops/:shopId/workers
   */
  list: async (req, res) => {
    try {
      const { shopId } = req.params;

      // Verify shop exists and user has access
      const shop = await shopQueries.findById(shopId);
      if (!shop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      // Only owner can list workers
      if (shop.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Only shop owner can view workers'
        });
      }

      const workers = await workerQueries.listByShop(shopId);

      return res.status(200).json({
        success: true,
        data: workers.map(w => ({
          id: w.id,
          user_id: w.worker_user_id,
          telegram_id: w.user_telegram_id,
          username: w.username,
          first_name: w.first_name,
          last_name: w.last_name,
          added_by: w.added_by,
          added_at: w.created_at
        }))
      });

    } catch (error) {
      logger.error('List workers error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to list workers'
      });
    }
  },

  /**
   * Remove worker from shop
   * DELETE /api/shops/:shopId/workers/:workerId
   */
  remove: async (req, res) => {
    try {
      const { shopId, workerId } = req.params;

      // Verify shop exists and user is owner
      const shop = await shopQueries.findById(shopId);
      if (!shop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      if (shop.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Only shop owner can remove workers'
        });
      }

      // Verify worker exists and belongs to this shop
      const worker = await workerQueries.findById(workerId);
      if (!worker || worker.shop_id !== parseInt(shopId)) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found in this shop'
        });
      }

      // Remove worker
      await workerQueries.remove(workerId);

      logger.info('Worker removed from shop', {
        shopId,
        workerId,
        workerUserId: worker.worker_user_id,
        removedBy: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Worker removed successfully'
      });

    } catch (error) {
      logger.error('Remove worker error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to remove worker'
      });
    }
  },

  /**
   * Get accessible shops (owner or worker)
   * GET /api/shops/accessible
   */
  getAccessibleShops: async (req, res) => {
    try {
      const shops = await workerQueries.getAccessibleShops(req.user.id);

      return res.status(200).json({
        success: true,
        data: shops.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          logo: s.logo,
          is_active: s.is_active,
          tier: s.tier,
          access_type: s.access_type, // 'owner' or 'worker'
          worker_id: s.worker_id || null,
          worker_since: s.worker_since || null,
          created_at: s.created_at
        }))
      });

    } catch (error) {
      logger.error('Get accessible shops error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get accessible shops'
      });
    }
  },

  /**
   * Get worker shops only (not owner)
   * GET /api/shops/workspace
   */
  getWorkerShops: async (req, res) => {
    try {
      const shops = await workerQueries.getWorkerShops(req.user.id);

      return res.status(200).json({
        success: true,
        data: shops.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          logo: s.logo,
          is_active: s.is_active,
          tier: s.tier,
          access_type: 'worker',
          worker_id: s.worker_id,
          worker_since: s.worker_since,
          created_at: s.created_at
        }))
      });

    } catch (error) {
      logger.error('Get worker shops error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get worker shops'
      });
    }
  }
};

export default workerController;
