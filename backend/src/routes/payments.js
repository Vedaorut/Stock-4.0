import express from 'express';
import { paymentController } from '../controllers/paymentController.js';
import { paymentValidation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { optionalTelegramAuth } from '../middleware/telegramAuth.js';
import { strictPaymentLimiter } from '../middleware/rateLimiter.js';
import { createCrystalPayInvoice } from '../services/subscriptionInvoiceService.js';
import { invoiceQueries, subscriptionQueries } from '../database/queries/index.js';
import { getPrice } from '../config/subscriptionPricing.js';
import logger from '../utils/logger.js';
import { getInvoiceInfo } from '../services/crystalPayService.js';
import { processSubscriptionPayment } from '../services/invoicePayment/index.js';
import { alertWebhookMissed, alertSubscriptionActivationFailed } from '../utils/alerts.js';

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
    const userId = req.user?.id;

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

    // SECURITY: Check ownership - user must own the shop OR be the user_id on subscription (for pending subs)
    const isShopOwner = subscription.owner_id === userId;
    const isSubscriptionUser = subscription.user_id === userId;

    if (!isShopOwner && !isSubscriptionUser) {
      logger.warn('[API] Subscription ownership check failed', {
        subscriptionId,
        requestUserId: userId,
        ownerId: subscription.owner_id,
        subscriptionUserId: subscription.user_id,
      });
      return res.status(403).json({ error: 'Access denied: not subscription owner' });
    }

    // Determine amount based on tier (in USD) using shared pricing config
    let amountUsd;
    try {
      amountUsd = getPrice(subscription.tier);
    } catch (priceError) {
      logger.error('[API] Invalid subscription tier during invoice creation', {
        tier: subscription.tier,
        error: priceError.message,
      });
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }

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
 * @security P1-SEC-005: IDOR protection - ownership verification required
 */
router.get('/invoices/:id/status', verifyToken, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id);
    const userId = req.user?.id;

    // Use findByIdWithOwnership to get invoice with ownership info in single query
    const invoice = await invoiceQueries.findByIdWithOwnership(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // P1-SEC-005: IDOR protection - verify ownership
    // User must be either:
    // 1. Buyer of the order (for order invoices)
    // 2. Shop owner of the order (for order invoices - seller can also check)
    // 3. Shop owner of the subscription (for subscription invoices)
    const isBuyer = invoice.buyer_id === userId;
    const isOrderShopOwner = invoice.order_shop_owner_id === userId;
    const isSubscriptionOwner = invoice.subscription_owner_id === userId;

    const hasAccess = isBuyer || isOrderShopOwner || isSubscriptionOwner;

    if (!hasAccess) {
      logger.warn('[SEC] IDOR attempt on invoice status', {
        invoiceId: invoice.id,
        attemptedBy: userId,
        invoiceType: invoice.order_id ? 'order' : 'subscription',
        actualBuyerId: invoice.buyer_id,
        actualOrderShopOwnerId: invoice.order_shop_owner_id,
        actualSubscriptionOwnerId: invoice.subscription_owner_id,
        actualSubscriptionUserId: invoice.subscription_user_id, // fallback user_id from shop_subscriptions
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    // Map invoice status to frontend-friendly status
    let status = 'pending';

    // CrystalPay fallback: Check gateway if webhook might have failed
    // Only for pending invoices with crystalpay_id (older than 30 seconds to avoid race with webhook)
    const invoiceAge = Date.now() - new Date(invoice.created_at).getTime();
    const MIN_AGE_FOR_FALLBACK = 30 * 1000; // 30 seconds

    if (invoice.crystalpay_id && invoice.status === 'pending' && invoiceAge > MIN_AGE_FOR_FALLBACK) {
      try {
        const cpStatus = await getInvoiceInfo(invoice.crystalpay_id);

        if (cpStatus && (cpStatus.state === 'payed' || cpStatus.state === 'payedover')) {
          // Webhook missed - process payment now
          logger.info(`[API] CrystalPay fallback: Invoice ${invoice.id} paid but webhook missed`, {
            invoiceId: invoice.id,
            crystalpayId: invoice.crystalpay_id,
            cpState: cpStatus.state,
          });

          // Alert admin about missed webhook
          alertWebhookMissed(invoice.id, invoice.crystalpay_id);

          if (invoice.subscription_id) {
            try {
              await processSubscriptionPayment({
                subscriptionId: invoice.subscription_id,
                invoiceId: invoice.id,
                webhookVerified: true, // We verified with CrystalPay API
              });
              status = 'paid';
            } catch (processError) {
              // CRITICAL: Payment confirmed by CrystalPay but subscription NOT activated
              // Do NOT return 'paid' - user needs to know there's an issue
              logger.error(`[API] CRITICAL: CrystalPay payment confirmed but activation failed for invoice ${invoice.id}`, {
                error: processError.message,
                stack: processError.stack,
                subscriptionId: invoice.subscription_id,
                crystalpayId: invoice.crystalpay_id,
                invoiceId: invoice.id,
              });

              // Alert admin about critical activation failure
              alertSubscriptionActivationFailed(invoice.subscription_id, invoice.id, processError.message);

              // Return distinct status so user/frontend knows payment was received but activation failed
              status = 'paid_pending_activation';
            }
          } else {
            // Non-subscription invoice - just mark as paid for status response
            status = 'paid';
          }
        }
      } catch (cpError) {
        // CrystalPay API failed - continue with DB status (graceful degradation)
        logger.warn(`[API] CrystalPay status check failed for invoice ${invoice.id}:`, {
          error: cpError.message,
          crystalpayId: invoice.crystalpay_id,
        });
      }
    }

    // If not already set by CrystalPay fallback, use DB status
    if (status === 'pending') {
      if (invoice.status === 'paid' || invoice.status === 'confirmed') {
        status = 'paid';
      } else if (invoice.status === 'expired' || invoice.status === 'cancelled') {
        status = 'expired';
      }
    }

    return res.json({ status });
  } catch (error) {
    logger.error('[API] Get invoice status error', { error: error.message });
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
