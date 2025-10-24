import express from 'express';
import { workerController } from '../controllers/workerController.js';
import { verifyToken } from '../middleware/auth.js';

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

/**
 * @route   POST /api/shops/:shopId/workers
 * @desc    Add worker to shop
 * @access  Private (Shop owner only)
 * @body    { telegram_id: number } OR { username: string }
 */
router.post('/:shopId/workers', verifyToken, workerController.add);

/**
 * @route   GET /api/shops/:shopId/workers
 * @desc    List all workers for a shop
 * @access  Private (Shop owner only)
 */
router.get('/:shopId/workers', verifyToken, workerController.list);

/**
 * @route   DELETE /api/shops/:shopId/workers/:workerId
 * @desc    Remove worker from shop
 * @access  Private (Shop owner only)
 */
router.delete('/:shopId/workers/:workerId', verifyToken, workerController.remove);

export default router;
