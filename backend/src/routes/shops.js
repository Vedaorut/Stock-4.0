import express from 'express';
import { shopController } from '../controllers/shopController.js';
import { shopValidation } from '../middleware/validation.js';
import { verifyToken, optionalAuth, requireShopOwner } from '../middleware/auth.js';
import * as migrationController from '../controllers/migrationController.js';

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
 * @route   GET /api/shops/search
 * @desc    Search active shops by name
 * @access  Public (auth optional to include subscription flag)
 */
router.get(
  '/search',
  optionalAuth,
  shopController.search
);

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

/**
 * @route   GET /api/shops/:id/wallets
 * @desc    Get shop wallets
 * @access  Private (Shop owner only)
 */
router.get(
  '/:id/wallets',
  verifyToken,
  requireShopOwner,
  shopValidation.getById,
  shopController.getWallets
);

/**
 * @route   PUT /api/shops/:id/wallets
 * @desc    Update shop wallets
 * @access  Private (Shop owner only)
 */
router.put(
  '/:id/wallets',
  verifyToken,
  requireShopOwner,
  shopController.updateWallets
);

/**
 * @route   GET /api/shops/:shopId/migration/check
 * @desc    Check migration eligibility (PRO tier + rate limits)
 * @access  Private (Shop owner only)
 */
router.get(
  '/:shopId/migration/check',
  verifyToken,
  migrationController.checkMigrationEligibility
);

/**
 * @route   POST /api/shops/:shopId/migration
 * @desc    Initiate channel migration broadcast
 * @access  Private (Shop owner only)
 */
router.post(
  '/:shopId/migration',
  verifyToken,
  migrationController.initiateMigration
);

/**
 * @route   GET /api/shops/:shopId/migration/history
 * @desc    Get migration history for a shop
 * @access  Private (Shop owner only)
 */
router.get(
  '/:shopId/migration/history',
  verifyToken,
  migrationController.getMigrationHistory
);

/**
 * @route   GET /api/shops/:shopId/migration/:migrationId
 * @desc    Get specific migration status
 * @access  Private (Shop owner only)
 */
router.get(
  '/:shopId/migration/:migrationId',
  verifyToken,
  migrationController.getMigrationStatus
);

export default router;
