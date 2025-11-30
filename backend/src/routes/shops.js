import express from 'express';
import { shopController } from '../controllers/shopController.js';
import { workerController } from '../controllers/workerController.js';
import { productController } from '../controllers/productController.js';
import { orderController } from '../controllers/orderController.js';
import { shopValidation } from '../middleware/validation.js';
import { productValidation } from '../middleware/validation.js';
import { verifyToken, optionalAuth, requireShopOwner, requireShopAccess } from '../middleware/auth.js';
import { shopCreationLimiter } from '../middleware/rateLimiter.js';
import * as migrationController from '../controllers/migrationController.js';
import { productQueries } from '../database/queries/index.js';

const router = express.Router();

// Helpers to bind shopId from params to request payload/query
const setShopIdInBody = (req, res, next) => {
  req.body.shopId = parseInt(req.params.shopId, 10);
  return next();
};

const setShopIdInQuery = (req, res, next) => {
  req.query.shopId = parseInt(req.params.shopId, 10);
  return next();
};

// Ensure product belongs to the shop in params
const ensureProductBelongsToShop = async (req, res, next) => {
  try {
    const product = await productQueries.findById(req.params.id);
    if (!product || product.shop_id !== parseInt(req.params.shopId, 10)) {
      return res.status(404).json({
        success: false,
        error: 'Product not found in this shop',
      });
    }
    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to validate product',
    });
  }
};

/**
 * @route   POST /api/shops
 * @desc    Create new shop
 * @access  Private (Any authenticated user can create a shop)
 */
router.post('/', verifyToken, shopCreationLimiter, shopValidation.create, shopController.create);

/**
 * @route   GET /api/shops/my
 * @desc    Get current user's shops
 * @access  Private (Any authenticated user)
 */
router.get('/my', verifyToken, shopController.getMyShops);

/**
 * @route   GET /api/shops/worker
 * @desc    Get shops where user is a worker
 * @access  Private
 */
router.get('/worker', verifyToken, workerController.getWorkerShops);

/**
 * @route   GET /api/shops/active
 * @desc    List all active shops
 * @access  Public
 */
router.get('/active', shopController.listActive);

/**
 * @route   GET /api/shops/:shopId/products
 * @desc    List products for a shop (owner or worker)
 * @access  Private
 */
router.get(
  '/:shopId/products',
  verifyToken,
  requireShopAccess,
  setShopIdInQuery,
  productValidation.list,
  productController.list
);

/**
 * @route   POST /api/shops/:shopId/products
 * @desc    Create product in a shop (owner or worker)
 * @access  Private
 */
router.post(
  '/:shopId/products',
  verifyToken,
  requireShopAccess,
  setShopIdInBody,
  productValidation.create,
  productController.create
);

/**
 * @route   PUT /api/shops/:shopId/products/:id
 * @desc    Update product in a shop (owner or worker)
 * @access  Private
 */
router.put(
  '/:shopId/products/:id',
  verifyToken,
  requireShopAccess,
  ensureProductBelongsToShop,
  productValidation.update,
  productController.update
);

/**
 * @route   DELETE /api/shops/:shopId/products/:id
 * @desc    Delete product in a shop (owner or worker)
 * @access  Private
 */
router.delete(
  '/:shopId/products/:id',
  verifyToken,
  requireShopAccess,
  ensureProductBelongsToShop,
  productValidation.getById,
  productController.delete
);

/**
 * @route   GET /api/shops/:shopId/orders
 * @desc    List orders for a shop (owner or worker)
 * @access  Private
 */
router.get(
  '/:shopId/orders',
  verifyToken,
  requireShopAccess,
  (req, res, next) => {
    req.query.shop_id = req.params.shopId;
    return orderController.getMyOrders(req, res, next);
  }
);

/**
 * @route   GET /api/shops/search
 * @desc    Search active shops by name
 * @access  Public (auth optional to include subscription flag)
 */
router.get('/search', optionalAuth, shopController.search);

/**
 * @route   GET /api/shops/:id/wallets
 * @desc    Get shop wallets (for payments - any authenticated user can view)
 * @access  Private (Any authenticated user)
 */
router.get('/:id/wallets', verifyToken, shopValidation.getById, shopController.getWallets);

/**
 * @route   GET /api/shops/:id
 * @desc    Get shop by ID (optionalAuth to filter sensitive data for non-owners)
 * @access  Public (but auth optional for owner-specific data)
 */
router.get('/:id', optionalAuth, shopValidation.getById, shopController.getById);

/**
 * @route   PUT /api/shops/:id
 * @desc    Update shop
 * @access  Private (Shop owner only)
 */
router.put('/:id', verifyToken, requireShopOwner, shopValidation.update, shopController.update);

/**
 * @route   DELETE /api/shops/:id
 * @desc    Delete shop
 * @access  Private (Shop owner only)
 */
router.delete('/:id', verifyToken, requireShopOwner, shopValidation.getById, shopController.delete);

/**
 * @route   PUT /api/shops/:id/wallets
 * @desc    Update shop wallets
 * @access  Private (Shop owner only)
 */
router.put('/:id/wallets', verifyToken, requireShopOwner, shopController.updateWallets);

/**
 * @route   GET /api/shops/:shopId/migration/check
 * @desc    Check migration eligibility (PRO tier + rate limits)
 * @access  Private (Shop owner only)
 */
router.get(
  '/:shopId/migration/check',
  verifyToken,
  requireShopOwner,
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
  requireShopOwner,
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
  requireShopOwner,
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
  requireShopOwner,
  migrationController.getMigrationStatus
);

export default router;
