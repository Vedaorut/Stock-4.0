import express from 'express';
import { orderController } from '../controllers/orderController.js';
import { orderValidation, validateBulkOperation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Private (WebApp)
 */
router.post('/', verifyToken, orderValidation.create, orderController.create);

/**
 * @route   GET /api/orders/my
 * @desc    Get current user's orders
 * @access  Private (WebApp)
 */
router.get('/my', verifyToken, orderController.getMyOrders);

/**
 * @route   GET /api/orders/sales
 * @desc    Get current user's sales (as seller)
 * @access  Private (WebApp)
 */
router.get('/sales', verifyToken, (req, res, next) => {
  req.query.type = 'seller';
  return orderController.getMyOrders(req, res, next);
});

/**
 * @route   GET /api/orders/active/count
 * @desc    Get count of active orders (confirmed status)
 * @access  Private (WebApp)
 * @query   shop_id (required)
 */
router.get('/active/count', verifyToken, orderController.getActiveCount);

/**
 * @route   GET /api/orders/analytics
 * @desc    Get sales analytics for seller
 * @access  Private (WebApp)
 * @query   from (YYYY-MM-DD), to (YYYY-MM-DD)
 */
router.get('/analytics', verifyToken, orderController.getAnalytics);

/**
 * @route   GET /api/orders
 * @desc    Get current user's orders (as buyer)
 * @access  Private (WebApp)
 */
router.get('/', verifyToken, (req, res, next) => {
  // Default to buyer orders only when no explicit shop context provided
  if (!req.query.type && !req.query.shop_id) {
    req.query.type = 'buyer';
  }
  return orderController.getMyOrders(req, res, next);
});

/**
 * @route   GET /api/orders/:id/payment-info
 * @desc    Get payment info for direct crypto payment
 * @access  Private (WebApp)
 */
router.get('/:id/payment-info', verifyToken, orderController.getPaymentInfo);

/**
 * @route   POST /api/orders/:id/submit-payment
 * @desc    Submit payment transaction hash
 * @access  Private (WebApp)
 */
router.post('/:id/submit-payment', verifyToken, orderController.submitPayment);

/**
 * @route   GET /api/orders/:id/payment-status
 * @desc    Get payment verification status
 * @access  Private (WebApp)
 */
router.get('/:id/payment-status', verifyToken, orderController.getPaymentStatus);

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private (WebApp)
 */
router.get('/:id', verifyToken, orderValidation.getById, orderController.getById);

/**
 * @route   PUT /api/orders/:id/status
 * @desc    Update order status
 * @access  Private (WebApp)
 */
router.put('/:id/status', verifyToken, orderValidation.updateStatus, orderController.updateStatus);

/**
 * @route   POST /api/orders/bulk-status
 * @desc    Bulk update order statuses
 * @access  Private (WebApp)
 */
router.post(
  '/bulk-status',
  verifyToken,
  validateBulkOperation,
  orderValidation.bulkUpdateStatus,
  orderController.bulkUpdateStatus
);

export default router;
