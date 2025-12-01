import * as subscriptionInvoiceService from '../../../services/subscriptionInvoiceService.js';
import { INVOICE_EXPIRATION_MINUTES, SUBSCRIPTION_PRICES } from '../../../config/subscriptionPricing.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import invoicePaymentService from '../../../services/invoicePaymentService.js';
import { query } from '../../../config/database.js';
import { formatInvoiceResponse } from '../utils/invoice.js';
import { verifySubscriptionOwnership } from '../utils/ownership.js';
import { ensurePaymentProof, validateChainSelection } from '../validators/payloadValidators.js';
import { TEST_SUBSCRIPTION_PRICE } from '../constants.js';

/**
 * Generate payment invoice for subscription
 * POST /api/subscriptions/:id/payment/generate
 *
 * DEPRECATED: HD wallet payments removed. Use /api/payments/subscription/crystalpay instead.
 */
export const generatePaymentInvoice = asyncHandler(async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const { currency, address, chain } = validateChainSelection(req.body.chain);

    const ownershipCheck = await verifySubscriptionOwnership(subscriptionId, userId);
    if (!ownershipCheck.success) {
      return res
        .status(ownershipCheck.status)
        .json({ success: false, error: ownershipCheck.error });
    }

    const activeInvoice = await subscriptionInvoiceService.findActiveInvoiceForSubscription(
      subscriptionId,
      subscriptionInvoiceService.INVOICE_PURPOSES.SUBSCRIPTION
    );

    if (activeInvoice && activeInvoice.status === 'pending') {
      return res.status(200).json({
        success: true,
        invoice: formatInvoiceResponse(activeInvoice),
        existing: true,
      });
    }

    const isTestEnv = process.env.NODE_ENV === 'test';
    const testAmount = Number.parseFloat(
      process.env.SUBSCRIPTION_TEST_PRICE ||
        process.env.SUBSCRIPTION_PRICE_BASIC ||
        `${TEST_SUBSCRIPTION_PRICE}`
    );

    const expectedAmount =
      (isTestEnv && Number.isFinite(testAmount)
        ? testAmount
        : SUBSCRIPTION_PRICES[ownershipCheck.subscription.tier]) ?? SUBSCRIPTION_PRICES.basic;
    const expiresAt = new Date(Date.now() + INVOICE_EXPIRATION_MINUTES * 60 * 1000);

    const insertResult = await query(
      `INSERT INTO invoices (
        subscription_id,
        chain,
        address,
        address_index,
        expected_amount,
        currency,
        crypto_amount,
        status,
        expires_at,
        purpose
      ) VALUES ($1, $2, $3, 0, $4, $5, $6, 'pending', $7, $8)
      RETURNING *`,
      [
        subscriptionId,
        chain,
        address,
        expectedAmount,
        currency,
        expectedAmount,
        expiresAt,
        subscriptionInvoiceService.INVOICE_PURPOSES.SUBSCRIPTION,
      ]
    );

    const invoice = insertResult.rows[0];

    return res.status(201).json({
      success: true,
      invoice: formatInvoiceResponse(invoice),
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error generating payment invoice', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
});

/**
 * Get payment status for subscription
 * GET /api/subscriptions/:id/payment/status
 */
export const getPaymentStatus = asyncHandler(async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    const ownershipCheck = await verifySubscriptionOwnership(subscriptionId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }

    const activeInvoice = await subscriptionInvoiceService.findActiveInvoiceForSubscription(
      subscriptionId,
      subscriptionInvoiceService.INVOICE_PURPOSES.SUBSCRIPTION
    );

    if (!activeInvoice) {
      return res.status(404).json({
        error: 'No active payment invoice found for this subscription',
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
        currency: activeInvoice.currency,
        expiresAt: activeInvoice.expires_at,
        paidAt: activeInvoice.paid_at || null,
        invoiceId: activeInvoice.id,
      },
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting payment status:', error);
    throw error;
  }
});

/**
 * Manually confirm subscription payment by tx hash (single source of truth: blockchain)
 * POST /api/subscriptions/:id/payment/confirm
 *
 * Body: { txHash: string }
 */
export const confirmPaymentWithTxHash = asyncHandler(async (req, res) => {
  const subscriptionId = parseInt(req.params.id, 10);
  const { proof, txHash, paymentLink } = ensurePaymentProof(req.body);

  if (!proof) {
    throw new ValidationError('txHash or payment link is required');
  }

  const result = await invoicePaymentService.processSubscriptionPayment({
    subscriptionId,
    txHash,
    paymentLink,
    actorUserId: req.user.id,
    purpose: subscriptionInvoiceService.INVOICE_PURPOSES.SUBSCRIPTION,
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
