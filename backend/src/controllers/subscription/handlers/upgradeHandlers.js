import * as subscriptionService from '../../../services/subscriptionService.js';
import * as subscriptionInvoiceService from '../../../services/subscriptionInvoiceService.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';
import invoicePaymentService from '../../../services/invoicePaymentService.js';
import { verifyShopOwnership, verifySubscriptionOwnership } from '../utils/ownership.js';
import { ensurePaymentProof } from '../validators/payloadValidators.js';

/**
 * Get upgrade cost for shop
 * GET /api/subscriptions/upgrade-cost/:shopId
 */
export const getUpgradeCost = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    const ownershipCheck = await verifyShopOwnership(shopId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }

    const upgradeInfo = await subscriptionService.calculateUpgradeCost(shopId);

    res.json(upgradeInfo);
  } catch (error) {
    logger.error('[SubscriptionController] Error calculating upgrade cost:', error);
    throw error;
  }
});

/**
 * Generate payment invoice for upgrading active subscription to PRO
 * POST /api/subscriptions/:id/upgrade/payment/generate
 *
 * DEPRECATED: HD wallet payments removed. Use /api/payments/subscription/crystalpay instead.
 */
export const generateUpgradePaymentInvoice = asyncHandler(async (req, res) => {
  return res.status(410).json({
    error: 'Прямые криптоплатежи отключены. Используйте CrystalPay.',
    deprecated: true,
    alternativeEndpoint: '/api/payments/subscription/crystalpay',
  });
});

/**
 * Get upgrade payment status for subscription
 * GET /api/subscriptions/:id/upgrade/payment/status
 */
export const getUpgradePaymentStatus = asyncHandler(async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    const ownershipCheck = await verifySubscriptionOwnership(subscriptionId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }

    const activeInvoice = await subscriptionInvoiceService.findActiveInvoiceForSubscription(
      subscriptionId,
      subscriptionInvoiceService.INVOICE_PURPOSES.UPGRADE
    );

    if (!activeInvoice) {
      return res.status(404).json({
        error: 'No active upgrade invoice found for this subscription',
        subscriptionId,
      });
    }

    const now = new Date();
    const expiresAt = new Date(activeInvoice.expires_at);
    const isExpired = now > expiresAt;

    res.json({
      success: true,
      payment: {
        status: isExpired ? 'expired' : activeInvoice.status,
        address: activeInvoice.address,
        expectedAmount: parseFloat(activeInvoice.expected_amount),
        cryptoAmount: parseFloat(activeInvoice.crypto_amount),
        currency: activeInvoice.currency,
        expiresAt: activeInvoice.expires_at,
        paidAt: activeInvoice.paid_at || null,
        invoiceId: activeInvoice.id,
        purpose: activeInvoice.purpose,
      },
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting upgrade payment status:', error);
    throw error;
  }
});

/**
 * Confirm upgrade payment by tx hash (upgrade to PRO)
 * POST /api/subscriptions/:id/upgrade/payment/confirm
 */
export const confirmUpgradePaymentWithTxHash = asyncHandler(async (req, res) => {
  const subscriptionId = parseInt(req.params.id, 10);
  const { txHash, paymentLink } = ensurePaymentProof(req.body);

  const activeInvoice = await subscriptionInvoiceService.findActiveInvoiceForSubscription(
    subscriptionId,
    subscriptionInvoiceService.INVOICE_PURPOSES.UPGRADE
  );

  if (!activeInvoice) {
    return res.status(404).json({
      error: 'No active upgrade invoice found for this subscription',
      subscriptionId,
    });
  }

  const result = await invoicePaymentService.processSubscriptionPayment({
    subscriptionId,
    txHash,
    paymentLink,
    actorUserId: req.user.id,
    mode: 'upgrade',
    purpose: subscriptionInvoiceService.INVOICE_PURPOSES.UPGRADE,
    invoiceId: activeInvoice.id,
  });

  if (!result.ok) {
    return res.status(400).json({
      success: false,
      error: result.message,
      code: result.code || 'PAYMENT_NOT_VERIFIED',
      state: result.state,
    });
  }

  return res.json({
    success: true,
    state: result.state,
    idempotent: result.idempotent || false,
    payment: result.payment || null,
  });
});
