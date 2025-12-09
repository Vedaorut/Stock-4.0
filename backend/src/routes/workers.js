import express from 'express';
import { workerController } from '../controllers/workerController.js';
import { verifyToken, requireShopAccess } from '../middleware/auth.js';
import { workerLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * @route   GET /api/shops/accessible
 * @desc    Get all shops where user has access (owner or worker)
 * @access  Private
 */
router.get('/accessible', verifyToken, workerController.getAccessibleShops);

/**
 * @route   GET /api/shops/workspace
 * @desc    Get shops where user is worker (not owner)
 * @access  Private
 */
router.get('/workspace', verifyToken, workerController.getWorkerShops);
router.get('/worker', verifyToken, workerController.getWorkerShops); // alias for bots

// AUTH-WORKER-001 FIX: requireShopAccess enforces MAX tier + active subscription for workers
router.get('/:shopId/stats', verifyToken, requireShopAccess, workerController.getStats);

/**
 * @route   POST /api/shops/:shopId/workers
 * @desc    Add worker to shop
 * @access  Private (Shop owner only)
 * @body    { telegram_id: number } OR { username: string }
 */
router.post('/:shopId/workers', verifyToken, requireShopAccess, workerLimiter, workerController.add);

/**
 * @route   GET /api/shops/:shopId/workers
 * @desc    List all workers for a shop
 * @access  Private (Shop owner only)
 */
router.get('/:shopId/workers', verifyToken, requireShopAccess, workerController.list);

/**
 * @route   DELETE /api/shops/:shopId/workers/:workerId
 * @desc    Remove worker from shop
 * @access  Private (Shop owner only)
 */
router.delete('/:shopId/workers/:workerId', verifyToken, requireShopAccess, workerLimiter, workerController.remove);

/**
 * @route   PATCH /api/workers/mute
 * @desc    Toggle notification mute for worker's workspace shop
 * @access  Private (Worker only)
 * @body    { shop_id: number }
 */
router.patch('/mute', verifyToken, workerController.toggleNotificationMute);

/**
 * @route   GET /api/workers/mute/:shopId
 * @desc    Get notification mute status for a specific shop
 * @access  Private (Worker only)
 */
router.get('/mute/:shopId', verifyToken, workerController.getNotificationMuteStatus);

export default router;
