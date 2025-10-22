import express from 'express';
import { orderController } from '../controllers/orderController.js';
import { orderValidation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { optionalTelegramAuth } from '../middleware/telegramAuth.js';

const router = express.Router();

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Private (WebApp)
 */
router.post(
  '/',
  verifyToken,
  optionalTelegramAuth,
  orderValidation.create,
  orderController.create
);

/**
 * @route   GET /api/orders
 * @desc    Get current user's orders (as buyer)
 * @access  Private (WebApp)
 */
router.get('/', verifyToken, optionalTelegramAuth, (req, res, next) => {
  req.query.type = 'buyer';
  return orderController.getMyOrders(req, res, next);
});

/**
 * @route   GET /api/orders/sales
 * @desc    Get current user's sales (as seller)
 * @access  Private (WebApp)
 */
router.get('/sales', verifyToken, optionalTelegramAuth, (req, res, next) => {
  req.query.type = 'seller';
  return orderController.getMyOrders(req, res, next);
});

/**
 * @route   GET /api/orders/my
 * @desc    Get current user's orders
 * @access  Private (WebApp)
 */
router.get('/my', verifyToken, optionalTelegramAuth, orderController.getMyOrders);

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private (WebApp)
 */
router.get(
  '/:id',
  verifyToken,
  optionalTelegramAuth,
  orderValidation.getById,
  orderController.getById
);

/**
 * @route   PUT /api/orders/:id/status
 * @desc    Update order status
 * @access  Private (WebApp)
 */
router.put(
  '/:id/status',
  verifyToken,
  optionalTelegramAuth,
  orderValidation.updateStatus,
  orderController.updateStatus
);

export default router;
