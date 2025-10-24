import express from 'express';
import { productController } from '../controllers/productController.js';
import { productValidation } from '../middleware/validation.js';
import { verifyToken, requireShopOwner, requireShopAccess } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/products
 * @desc    Create new product
 * @access  Private (Shop owner or worker)
 */
router.post(
  '/',
  verifyToken,
  requireShopAccess,
  productValidation.create,
  productController.create
);

/**
 * @route   GET /api/products
 * @desc    List products with filters
 * @access  Public
 */
router.get('/', productValidation.list, productController.list);

/**
 * @route   GET /api/products/:id
 * @desc    Get product by ID
 * @access  Public
 */
router.get('/:id', productValidation.getById, productController.getById);

/**
 * @route   PUT /api/products/:id
 * @desc    Update product
 * @access  Private (Shop owner or worker)
 */
router.put(
  '/:id',
  verifyToken,
  requireShopAccess,
  productValidation.update,
  productController.update
);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete product
 * @access  Private (Shop owner or worker)
 */
router.delete(
  '/:id',
  verifyToken,
  requireShopAccess,
  productValidation.getById,
  productController.delete
);

/**
 * @route   POST /api/products/bulk-delete-all
 * @desc    Delete all products from a shop
 * @access  Private (Shop owner or worker)
 */
router.post(
  '/bulk-delete-all',
  verifyToken,
  requireShopAccess,
  productValidation.bulkDeleteAll,
  productController.bulkDeleteAll
);

/**
 * @route   POST /api/products/bulk-delete
 * @desc    Delete multiple products by IDs
 * @access  Private (Shop owner or worker)
 */
router.post(
  '/bulk-delete',
  verifyToken,
  requireShopAccess,
  productValidation.bulkDeleteByIds,
  productController.bulkDeleteByIds
);

export default router;
