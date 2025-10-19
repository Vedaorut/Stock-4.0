import express from 'express';
import { paymentController } from '../controllers/paymentController.js';
import { paymentValidation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/payments/verify
 * @desc    Verify crypto payment
 * @access  Private
 */
router.post(
  '/verify',
  verifyToken,
  paymentValidation.verify,
  paymentController.verify
);

/**
 * @route   GET /api/payments/order/:orderId
 * @desc    Get payments by order ID
 * @access  Private
 */
router.get(
  '/order/:orderId',
  verifyToken,
  paymentValidation.getByOrder,
  paymentController.getByOrder
);

/**
 * @route   GET /api/payments/status
 * @desc    Check payment status by transaction hash
 * @access  Private
 */
router.get('/status', verifyToken, paymentController.checkStatus);

export default router;
