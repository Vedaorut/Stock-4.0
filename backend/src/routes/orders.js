import express from 'express';
import { orderController } from '../controllers/orderController.js';
import { orderValidation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Private
 */
router.post(
  '/',
  verifyToken,
  orderValidation.create,
  orderController.create
);

/**
 * @route   GET /api/orders
 * @desc    Get current user's orders (as buyer)
 * @access  Private
 */
router.get('/', verifyToken, (req, res, next) => {
  req.query.type = 'buyer';
  return orderController.getMyOrders(req, res, next);
});

/**
 * @route   GET /api/orders/sales
 * @desc    Get current user's sales (as seller)
 * @access  Private
 */
router.get('/sales', verifyToken, (req, res, next) => {
  req.query.type = 'seller';
  return orderController.getMyOrders(req, res, next);
});

/**
 * @route   GET /api/orders/my
 * @desc    Get current user's orders
 * @access  Private
 */
router.get('/my', verifyToken, orderController.getMyOrders);

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private
 */
router.get(
  '/:id',
  verifyToken,
  orderValidation.getById,
  orderController.getById
);

/**
 * @route   PUT /api/orders/:id/status
 * @desc    Update order status
 * @access  Private
 */
router.put(
  '/:id/status',
  verifyToken,
  orderValidation.updateStatus,
  orderController.updateStatus
);

export default router;
