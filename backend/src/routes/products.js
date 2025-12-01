import express from 'express';
import { productController } from '../controllers/productController.js';
import { productValidation, validateBulkOperation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { productCreationLimiter } from '../middleware/rateLimiter.js';
import { checkProductLimit, getProductLimitStatus } from '../middleware/productLimits.js';

const router = express.Router();

/**
 * @route   POST /api/products
 * @desc    Create new product
 * @access  Private (Shop owner or worker)
 */
router.post(
  '/',
  verifyToken,
  productCreationLimiter,
  checkProductLimit,
  productValidation.create,
  productController.create
);

/**
 * @route   GET /api/products/limit-status/:shopId
 * @desc    Get product limit status for a shop
 * @access  Private (Shop owner)
 */
router.get('/limit-status/:shopId', verifyToken, async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    const status = await getProductLimitStatus(shopId, userId);

    res.json(status);
  } catch (error) {
    if (error.message === 'Shop not found') {
      return res.status(404).json({ error: 'Shop not found' });
    }
    if (error.message === 'Not authorized to view this shop') {
      return res.status(403).json({ error: 'Not authorized to view this shop' });
    }
    res.status(500).json({ error: 'Failed to get product limit status' });
  }
});

/**
 * @route   GET /api/products/search
 * @desc    Search products across subscribed/followed shops
 * @access  Private (Authenticated user)
 * @query   {string} query - Search text (min 2 chars)
 * @query   {boolean} subscriptions - Search in subscribed shops (buyer)
 * @query   {boolean} follows - Search in followed shops (seller)
 * @query   {number} limit - Max results (default 20, max 100)
 */
router.get('/search', verifyToken, productController.search);

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
router.put('/:id', verifyToken, productValidation.update, productController.update);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete product
 * @access  Private (Shop owner or worker)
 */
router.delete('/:id', verifyToken, productValidation.getById, productController.delete);

/**
 * @route   POST /api/products/bulk-delete-all
 * @desc    Delete all products from a shop
 * @access  Private (Shop owner or worker)
 */
router.post(
  '/bulk-delete-all',
  verifyToken,
  productValidation.bulkDeleteAll,
  productController.bulkDeleteAll
);

/**
 * @route   POST /api/products/bulk-delete-by-ids
 * @desc    Delete multiple products by IDs
 * @access  Private (Shop owner or worker)
 */
router.post(
  '/bulk-delete-by-ids',
  verifyToken,
  validateBulkOperation,
  productValidation.bulkDeleteByIds,
  productController.bulkDeleteByIds
);

/**
 * @route   POST /api/products/bulk-discount
 * @desc    Apply bulk discount to all products in a shop
 * @access  Private (Shop owner or worker)
 */
router.post('/bulk-discount', verifyToken, productController.applyBulkDiscount);

/**
 * @route   POST /api/products/bulk-discount/remove
 * @desc    Remove bulk discount from all products in a shop
 * @access  Private (Shop owner or worker)
 */
router.post('/bulk-discount/remove', verifyToken, productController.removeBulkDiscount);

/**
 * @route   POST /api/products/bulk-update
 * @desc    Update multiple specific products by IDs
 * @access  Private (Shop owner or worker)
 */
router.post(
  '/bulk-update',
  verifyToken,
  validateBulkOperation,
  productController.bulkUpdateProducts
);

export default router;
