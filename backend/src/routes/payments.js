import express from 'express';
import { paymentController } from '../controllers/paymentController.js';
import { paymentValidation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { optionalTelegramAuth } from '../middleware/telegramAuth.js';
import { strictPaymentLimiter } from '../middleware/rateLimiter.js';
import { createCrystalPayInvoice } from '../services/subscriptionInvoiceService.js';
import { invoiceQueries, subscriptionQueries } from '../database/queries/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * @route   POST /api/payments/verify
 * @desc    Verify crypto payment
 * @access  Private (WebApp)
 * @security P1-SEC-004: Strict rate limiting (3 req/min) to prevent payment abuse
 */
router.post(
  '/verify',
  verifyToken,
  optionalTelegramAuth,
  strictPaymentLimiter, // P1-SEC-004: Changed from paymentLimiter to strictPaymentLimiter
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
 * @access  Private (Bot server-side)
 * @note    No optionalTelegramAuth - Bot cannot provide x-telegram-init-data header
 */
router.post('/qr', verifyToken, paymentController.generateQR);

/**
 * @route   POST /api/payments/subscriptions/:id/invoice/crystalpay
 * @desc    Create CrystalPay invoice for subscription payment
 * @access  Private (Bot)
 */
router.post('/subscriptions/:id/invoice/crystalpay', verifyToken, async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id);
    const { method, purpose } = req.body;

    // Validate method
    if (!['BITCOIN', 'LITECOIN'].includes(method)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    // Validate purpose
    const validPurposes = ['subscription_new', 'subscription_renewal', 'subscription_upgrade'];
    if (!validPurposes.includes(purpose)) {
      return res.status(400).json({ error: 'Invalid purpose' });
    }

    // Get subscription to determine amount
    const subscription = await subscriptionQueries.findShopSubscriptionById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Determine amount based on tier (in USD)
    const PRICES = {
      basic: 1,
      pro: 3,
    };
    const amountUsd = PRICES[subscription.tier] || 1;

    const result = await createCrystalPayInvoice({
      subscriptionId,
      purpose,
      amountUsd,
      method,
    });

    return res.json(result);
  } catch (error) {
    logger.error('[API] Create CrystalPay invoice error', { error: error.message });
    return res.status(500).json({ error: 'Failed to create invoice' });
  }
});

/**
 * @route   GET /api/payments/invoices/:id/status
 * @desc    Get invoice status
 * @access  Private (Bot)
 */
router.get('/invoices/:id/status', verifyToken, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id);

    const invoice = await invoiceQueries.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Map invoice status to frontend-friendly status
    let status = 'pending';
    if (invoice.status === 'paid' || invoice.status === 'confirmed') {
      status = 'paid';
    } else if (invoice.status === 'expired' || invoice.status === 'cancelled') {
      status = 'expired';
    }

    return res.json({ status });
  } catch (error) {
    logger.error('[API] Get invoice status error', { error: error.message });
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
