import express from 'express';
import { productController } from '../controllers/productController.js';
import { productValidation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
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
  productValidation.bulkDeleteByIds,
  productController.bulkDeleteByIds
);

export default router;
