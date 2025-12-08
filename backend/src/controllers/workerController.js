import { workerQueries, shopQueries, userQueries } from '../database/queries/index.js';
import { dbErrorHandler, asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError, ConflictError } from '../utils/errors.js';
import { TIER_LIMITS } from '../config/subscriptionPricing.js';
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
  add: asyncHandler(async (req, res) => {
    try {
      const { shopId } = req.params;
      const { telegram_id, username } = req.body;

      const hasTelegramId =
        telegram_id !== undefined && telegram_id !== null && String(telegram_id).trim() !== '';
      const hasUsername = typeof username === 'string' && username.trim() !== '';

      // Validate input
      if (!hasTelegramId && !hasUsername) {
        throw new ValidationError('Telegram ID or username is required');
      }

      // Verify shop exists and user is owner
      const shop = await shopQueries.findById(shopId);
      if (!shop) {
        throw new NotFoundError('Shop');
      }

      if (shop.owner_id !== req.user.id) {
        throw new UnauthorizedError('Only shop owner can add workers');
      }

      // Check MAX tier (Workspace is MAX-only feature)
      if (shop.tier !== 'max') {
        throw new UnauthorizedError('Workspace feature requires MAX subscription. Upgrade your shop to add workers.');
      }

      // Check worker limit for MAX tier (5 workers max)
      const currentWorkers = await workerQueries.listByShop(shopId);
      const workerLimit = TIER_LIMITS.max.workers;
      if (currentWorkers.length >= workerLimit) {
        throw new ValidationError(`Worker limit reached. MAX tier allows up to ${workerLimit} workers.`);
      }

      // Find user by telegram_id or username
      let normalizedTelegramId = null;
      if (hasTelegramId) {
        normalizedTelegramId = Number.parseInt(String(telegram_id).trim(), 10);
        if (!Number.isInteger(normalizedTelegramId) || normalizedTelegramId <= 0) {
          throw new ValidationError('Telegram ID must be a positive integer');
        }
      }

      let workerUser = null;

      if (normalizedTelegramId) {
        workerUser = await userQueries.findByTelegramId(normalizedTelegramId);
      }

      logger.info('Worker add: searching user', {
        normalizedTelegramId,
        hasUsername,
      });

      if (!workerUser && hasUsername) {
        const cleanUsername = username.trim().startsWith('@')
          ? username.trim().slice(1)
          : username.trim();
        workerUser = await userQueries.findByUsername(cleanUsername);
      }

      if (workerUser) {
        logger.info('Worker add: user found', {
          userId: workerUser.id,
          telegramId: workerUser.telegram_id,
          username: workerUser.username,
        });
      }

      if (!workerUser) {
        logger.warn('Worker add: user not found in DB', {
          searchedTelegramId: normalizedTelegramId,
          searchedUsername: hasUsername ? username.trim().replace(/^@/, '') : null,
        });
        throw new NotFoundError('User not found. Make sure they have used the bot at least once.');
      }

      // Ensure Telegram ID is available (fallback to value from DB)
      const workerTelegramId = Number(workerUser.telegram_id) || normalizedTelegramId;

      // Check if user is already the owner
      if (workerUser.id === shop.owner_id) {
        throw new ValidationError('Shop owner cannot be added as worker');
      }

      // BUG-WORKER-003 FIX: Use atomic insert with ON CONFLICT to prevent race condition
      // This replaces the check-then-insert pattern which was vulnerable to race conditions
      const worker = await workerQueries.create({
        shopId: parseInt(shopId, 10),
        workerUserId: workerUser.id,
        telegramId: workerTelegramId,
        addedBy: req.user.id,
      });

      // If create returns null, worker already exists (ON CONFLICT DO NOTHING)
      if (!worker) {
        throw new ConflictError('User is already a worker in this shop');
      }

      logger.info('Worker added to shop', {
        shopId,
        workerId: worker.id,
        workerUserId: workerUser.id,
        addedBy: req.user.id,
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
          added_at: worker.created_at,
        },
      });
    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {}),
        });
      }

      logger.error('Add worker error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * List workers for a shop
   * GET /api/shops/:shopId/workers
   */
  list: asyncHandler(async (req, res) => {
    try {
      const { shopId } = req.params;

      // Verify shop exists and user has access
      const shop = await shopQueries.findById(shopId);
      if (!shop) {
        throw new NotFoundError('Shop');
      }

      // Only owner can list workers
      if (shop.owner_id !== req.user.id) {
        throw new UnauthorizedError('Only shop owner can view workers');
      }

      const workers = await workerQueries.listByShop(shopId);

      return res.status(200).json({
        success: true,
        data: workers.map((w) => ({
          id: w.id,
          user_id: w.worker_user_id,
          telegram_id: w.user_telegram_id,
          username: w.username,
          first_name: w.first_name,
          last_name: w.last_name,
          added_by: w.added_by,
          added_at: w.created_at,
        })),
      });
    } catch (error) {
      logger.error('List workers error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Remove worker from shop
   * DELETE /api/shops/:shopId/workers/:workerId
   */
  remove: asyncHandler(async (req, res) => {
    try {
      const { shopId, workerId } = req.params;

      // Verify shop exists and user is owner
      const shop = await shopQueries.findById(shopId);
      if (!shop) {
        throw new NotFoundError('Shop');
      }

      if (shop.owner_id !== req.user.id) {
        throw new UnauthorizedError('Only shop owner can remove workers');
      }

      // Verify worker exists and belongs to this shop
      const worker = await workerQueries.findById(workerId);
      if (!worker || worker.shop_id !== parseInt(shopId)) {
        throw new NotFoundError('Worker in this shop');
      }

      // Remove worker
      await workerQueries.remove(workerId);

      logger.info('Worker removed from shop', {
        shopId,
        workerId,
        workerUserId: worker.worker_user_id,
        removedBy: req.user.id,
      });

      return res.status(200).json({
        success: true,
        message: 'Worker removed successfully',
      });
    } catch (error) {
      logger.error('Remove worker error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Get accessible shops (owner or worker)
   * GET /api/shops/accessible
   */
  getAccessibleShops: asyncHandler(async (req, res) => {
    try {
      const shops = await workerQueries.getAccessibleShops(req.user.id);

      return res.status(200).json({
        success: true,
        data: shops.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          logo: s.logo,
          is_active: s.is_active,
          tier: s.tier,
          access_type: s.access_type, // 'owner' or 'worker'
          worker_id: s.worker_id || null,
          worker_since: s.worker_since || null,
          created_at: s.created_at,
        })),
      });
    } catch (error) {
      logger.error('Get accessible shops error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Get worker shops only (not owner)
   * GET /api/shops/workspace
   */
  getWorkerShops: asyncHandler(async (req, res) => {
    try {
      const shops = await workerQueries.getWorkerShops(req.user.id);

      return res.status(200).json({
        success: true,
        data: shops.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          logo: s.logo,
          is_active: s.is_active,
          tier: s.tier,
          access_type: 'worker',
          worker_id: s.worker_id,
          worker_since: s.worker_since,
          created_at: s.created_at,
        })),
      });
    } catch (error) {
      logger.error('Get worker shops error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Toggle notification mute for worker's workspace shop
   * PATCH /api/workers/mute
   * Body: { shop_id: number }
   */
  toggleNotificationMute: asyncHandler(async (req, res) => {
    try {
      const { shop_id } = req.body;

      if (!shop_id) {
        throw new ValidationError('shop_id is required');
      }

      // Check if user is a worker in this shop
      const isWorker = await workerQueries.isWorker(shop_id, req.user.id);
      if (!isWorker) {
        throw new UnauthorizedError('You are not a worker in this shop');
      }

      // Toggle mute status
      const result = await workerQueries.toggleNotificationMute(shop_id, req.user.id);

      if (!result) {
        throw new NotFoundError('Worker record');
      }

      logger.info('Worker notification mute toggled', {
        shopId: shop_id,
        userId: req.user.id,
        muted: result.notification_muted,
      });

      return res.status(200).json({
        success: true,
        data: {
          shop_id: result.shop_id,
          notification_muted: result.notification_muted,
        },
      });
    } catch (error) {
      logger.error('Toggle notification mute error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Get notification mute status for a specific shop
   * GET /api/workers/mute/:shopId
   */
  getNotificationMuteStatus: asyncHandler(async (req, res) => {
    try {
      const { shopId } = req.params;

      // Check if user is a worker in this shop
      const isWorker = await workerQueries.isWorker(shopId, req.user.id);
      if (!isWorker) {
        throw new UnauthorizedError('You are not a worker in this shop');
      }

      const muted = await workerQueries.getNotificationMuteStatus(shopId, req.user.id);

      if (muted === null) {
        throw new NotFoundError('Worker record');
      }

      return res.status(200).json({
        success: true,
        data: {
          shop_id: parseInt(shopId, 10),
          notification_muted: muted,
        },
      });
    } catch (error) {
      logger.error('Get notification mute status error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),
};

export default workerController;
