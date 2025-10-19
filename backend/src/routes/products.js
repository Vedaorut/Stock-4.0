import express from 'express';
import { productController } from '../controllers/productController.js';
import { productValidation } from '../middleware/validation.js';
import { verifyToken, requireShopOwner } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/products
 * @desc    Create new product
 * @access  Private (Shop owner only)
 */
router.post(
  '/',
  verifyToken,
  requireShopOwner,
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
 * @access  Private (Shop owner only)
 */
router.put(
  '/:id',
  verifyToken,
  requireShopOwner,
  productValidation.update,
  productController.update
);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete product
 * @access  Private (Shop owner only)
 */
router.delete(
  '/:id',
  verifyToken,
  requireShopOwner,
  productValidation.getById,
  productController.delete
);

export default router;
