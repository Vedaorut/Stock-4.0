import express from 'express';
import { shopController } from '../controllers/shopController.js';
import { shopValidation } from '../middleware/validation.js';
import { verifyToken, requireShopOwner } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/shops
 * @desc    Create new shop
 * @access  Private (Any authenticated user can create a shop)
 */
router.post(
  '/',
  verifyToken,
  shopValidation.create,
  shopController.create
);

/**
 * @route   GET /api/shops/my
 * @desc    Get current user's shops
 * @access  Private (Any authenticated user)
 */
router.get(
  '/my',
  verifyToken,
  shopController.getMyShops
);

/**
 * @route   GET /api/shops/active
 * @desc    List all active shops
 * @access  Public
 */
router.get('/active', shopController.listActive);

/**
 * @route   GET /api/shops/:id
 * @desc    Get shop by ID
 * @access  Public
 */
router.get('/:id', shopValidation.getById, shopController.getById);

/**
 * @route   PUT /api/shops/:id
 * @desc    Update shop
 * @access  Private (Shop owner only)
 */
router.put(
  '/:id',
  verifyToken,
  requireShopOwner,
  shopValidation.update,
  shopController.update
);

/**
 * @route   DELETE /api/shops/:id
 * @desc    Delete shop
 * @access  Private (Shop owner only)
 */
router.delete(
  '/:id',
  verifyToken,
  requireShopOwner,
  shopValidation.getById,
  shopController.delete
);

export default router;
