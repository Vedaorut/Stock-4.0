import express from 'express';
import { paymentController } from '../controllers/paymentController.js';
import { paymentValidation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { optionalTelegramAuth } from '../middleware/telegramAuth.js';
import { paymentLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * @route   POST /api/payments/verify
 * @desc    Verify crypto payment
 * @access  Private (WebApp)
 */
router.post(
  '/verify',
  verifyToken,
  optionalTelegramAuth,
  paymentLimiter,
  paymentValidation.verify,
  paymentController.verify
);

/**
 * @route   GET /api/payments/order/:orderId
 * @desc    Get payments by order ID
 * @access  Private (WebApp)
 */
router.get(
  '/order/:orderId',
  verifyToken,
  optionalTelegramAuth,
  paymentValidation.getByOrder,
  paymentController.getByOrder
);

/**
 * @route   GET /api/payments/status
 * @desc    Check payment status by transaction hash
 * @access  Private (WebApp)
 */
router.get('/status', verifyToken, optionalTelegramAuth, paymentController.checkStatus);

/**
 * @route   POST /api/payments/qr
 * @desc    Generate QR code for payment
 * @access  Private (WebApp)
 */
router.post('/qr', verifyToken, optionalTelegramAuth, paymentController.generateQR);

export default router;
