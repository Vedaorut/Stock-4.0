/**
 * Subscription Controller
 *
 * Handles HTTP requests for shop subscription management:
 * - Payment processing for monthly subscriptions
 * - Tier upgrades (basic → pro)
 * - Subscription status and history
 */

import * as subscriptionService from '../services/subscriptionService.js';
import * as subscriptionInvoiceService from '../services/subscriptionInvoiceService.js';
import { SUBSCRIPTION_PERIOD_DAYS, SUBSCRIPTION_PRICES, INVOICE_EXPIRATION_MINUTES } from '../config/subscriptionPricing.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import invoicePaymentService from '../services/invoicePaymentService.js';
import { query } from '../config/database.js';

const formatInvoiceResponse = (invoice) => ({
  invoiceId: invoice.id,
  address: invoice.address,
  expectedAmount: parseFloat(invoice.expected_amount),
  currency: invoice.currency,
  expiresAt: invoice.expires_at,
  cryptoAmount: parseFloat(invoice.crypto_amount ?? invoice.expected_amount),
  chain: invoice.chain,
});

/**
 * Pay for subscription (monthly renewal or new subscription)
 * POST /api/subscriptions/pay
 *
 * DEPRECATED: Direct blockchain payments removed. Use CrystalPay via /api/payments/subscription/crystalpay
 */
const paySubscription = asyncHandler(async (req, res) => {
  // HD wallet system was removed - direct crypto payments not available
  return res.status(410).json({
    error: 'Прямые криптоплатежи отключены. Используйте CrystalPay.',
    deprecated: true,
    alternativeEndpoint: '/api/payments/subscription/crystalpay'
  });
});

/**
 * Upgrade shop from basic to PRO tier
 * POST /api/subscriptions/upgrade
 *
 * Body: {
 *   shopId: number,
 *   txHash: string,
 *   currency: 'BTC' | 'ETH' | 'USDT',
 *   paymentAddress: string
 * }
 */
const upgradeShop = asyncHandler(async (req, res) => {
  try {
    const { shopId, txHash, currency, paymentAddress, paymentLink, txLink, transactionUrl } =
      req.body;
    const userId = req.user.id;

    const paymentProof = txHash || paymentLink || txLink || transactionUrl;

    // Validate required fields
    if (!shopId || !paymentProof || !currency || !paymentAddress) {
      throw new ValidationError(
        'Missing required fields: shopId, txHash/paymentLink, currency, paymentAddress'
      );
    }

    // Verify shop ownership
    const ownershipCheck = await verifyShopOwnership(shopId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }

    // Upgrade shop to PRO
    const subscription = await subscriptionService.upgradeShopToPro(
      shopId,
      txHash,
      currency,
      paymentAddress,
      paymentLink || txLink || transactionUrl
    );

    logger.info(`[SubscriptionController] Shop ${shopId} upgraded to PRO tier`);

    res.status(200).json({
      success: true,
      subscription,
      message: 'Shop upgraded to PRO tier successfully',
      newTier: 'pro',
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error upgrading shop:', error);
    throw error;
  }
});

/**
 * Get upgrade cost for shop
 * GET /api/subscriptions/upgrade-cost/:shopId
 */
const getUpgradeCost = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    // Verify shop ownership
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
 * Get subscription status for shop
 * GET /api/subscriptions/status/:shopId
 */
const getStatus = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    // Verify shop ownership
    const ownershipCheck = await verifyShopOwnership(shopId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }

    const status = await subscriptionService.getSubscriptionStatus(shopId);

    res.json(status);
  } catch (error) {
    logger.error('[SubscriptionController] Error getting subscription status:', error);
    throw error;
  }
});

/**
 * Get subscription payment history for shop
 * GET /api/subscriptions/history/:shopId?limit=10
 */
const getHistory = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 10;

    // Verify shop ownership
    const ownershipCheck = await verifyShopOwnership(shopId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }

    const history = await subscriptionService.getSubscriptionHistory(shopId, limit);

    res.json({
      shopId,
      history,
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting subscription history:', error);
    throw error;
  }
});

/**
 * Get subscription pricing info
 * GET /api/subscriptions/pricing
 */
const getPricing = asyncHandler(async (req, res) => {
  try {
    res.json({
      basic: {
        // Legacy fields for backward compatibility
        price: subscriptionService.SUBSCRIPTION_PRICES.basic,
        currency: 'USD',
        period: '30 days',
        // New pricing structure with month/year options
        pricing: {
          month: subscriptionService.SUBSCRIPTION_PRICES.basic,
          year: subscriptionService.SUBSCRIPTION_PRICES_YEARLY.basic,
        },
        features: [
          'Create and manage shop',
          'Up to 4 products',
          'Basic analytics',
          'Crypto payments (BTC, ETH, USDT)',
        ],
      },
      pro: {
        // Legacy fields for backward compatibility
        price: subscriptionService.SUBSCRIPTION_PRICES.pro,
        currency: 'USD',
        period: '30 days',
        // New pricing structure with month/year options
        pricing: {
          month: subscriptionService.SUBSCRIPTION_PRICES.pro,
          year: subscriptionService.SUBSCRIPTION_PRICES_YEARLY.pro,
        },
        features: [
          'All Basic features',
          'Unlimited products',
          'Unlimited Follow Shop (dropshipping)',
          'Channel Migration (2 times/month)',
          'Priority support',
          'Advanced analytics',
        ],
      },
      gracePeriod: {
        days: subscriptionService.GRACE_PERIOD_DAYS,
        description: 'Grace period after subscription expires before shop deactivation',
      },
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting pricing:', error);
    throw error;
  }
});

/**
 * Helper: Verify shop ownership
 *
 * @param {number} shopId - Shop ID
 * @param {number} userId - User ID
 * @returns {Promise<{success: boolean, status?: number, error?: string}>}
 */
async function verifyShopOwnership(shopId, userId) {
  try {
    const pool = (await import('../config/database.js')).default;

    const result = await pool.query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);

    if (result.rows.length === 0) {
      return { success: false, status: 404, error: 'Shop not found' };
    }

    if (result.rows[0].owner_id !== userId) {
      return { success: false, status: 403, error: 'Not authorized to manage this shop' };
    }

    return { success: true };
  } catch (error) {
    logger.error('[SubscriptionController] Error verifying shop ownership:', error);
    return { success: false, status: 500, error: 'Internal server error' };
  }
}

/**
 * Check if user has active subscription to shop (buyer view)
 * GET /api/subscriptions/check/:shopId
 *
 * Response: { data: { subscribed: boolean, subscription: object|null } }
 */
const checkSubscription = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    // Validate shopId
    if (!shopId || isNaN(shopId)) {
      throw new ValidationError('Invalid shop ID');
    }

    // Import subscriptionQueries
    const { subscriptionQueries } = await import('../models/db.js');

    // Check if user has active subscription to this shop
    const subscription = await subscriptionQueries.findByUserAndShop(userId, shopId);

    return res.json({
      success: true,
      data: {
        subscribed: Boolean(subscription),
        subscription: subscription || null,
      },
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error checking subscription:', {
      error: error.message,
      stack: error.stack,
      shopId: req.params.shopId,
      userId: req.user?.id,
    });

    throw error;
  }
});

/**
 * Get user subscriptions (buyer view)
 * GET /api/subscriptions
 */
const getUserSubscriptions = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    const subscriptions = await subscriptionService.getUserSubscriptions(userId);

    res.json({
      data: subscriptions,
      count: subscriptions.length,
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting user subscriptions:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });

    throw error;
  }
});

/**
 * Get shop subscriptions for current user's shops (seller view)
 * GET /api/subscriptions/my-shops
 */
const getMyShopSubscriptions = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    const shopSubscriptions = await subscriptionService.getMyShopSubscriptions(userId);

    res.json({
      data: shopSubscriptions,
      count: shopSubscriptions.length,
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting shop subscriptions:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });

    throw error;
  }
});

/**
 * Generate payment invoice for subscription
 * POST /api/subscriptions/:id/payment/generate
 *
 * DEPRECATED: HD wallet payments removed. Use /api/payments/subscription/crystalpay instead.
 */
const generatePaymentInvoice = asyncHandler(async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id, 10);
    const chain = (req.body.chain || '').toUpperCase();
    const userId = req.user.id;

    const chainMap = {
      BTC: { currency: 'BTC', address: process.env.TEST_BTC_ADDRESS, envVar: 'TEST_BTC_ADDRESS' },
      LTC: { currency: 'LTC', address: process.env.TEST_LTC_ADDRESS, envVar: 'TEST_LTC_ADDRESS' },
      ETH: { currency: 'ETH', address: process.env.TEST_ETH_ADDRESS, envVar: 'TEST_ETH_ADDRESS' },
      USDT_TRC20: { currency: 'USDT', address: process.env.TEST_TRON_ADDRESS, envVar: 'TEST_TRON_ADDRESS' },
    };

    if (!chainMap[chain]) {
      throw new ValidationError('Invalid chain');
    }

    if (!chainMap[chain].address) {
      const envVar = chainMap[chain].envVar || `TEST_${chain}_ADDRESS`;
      throw new ValidationError(`Payment address for ${chain} is not configured. Set ${envVar} env variable.`);
    }

    // Ownership validation
    const ownershipCheck = await verifySubscriptionOwnership(subscriptionId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ success: false, error: ownershipCheck.error });
    }

    // Reuse active invoice if it exists
    const activeInvoice =
      await subscriptionInvoiceService.findActiveInvoiceForSubscription(
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

    const expectedAmount =
      SUBSCRIPTION_PRICES[ownershipCheck.subscription.tier] ?? SUBSCRIPTION_PRICES.basic;
    const expiresAt = new Date(Date.now() + INVOICE_EXPIRATION_MINUTES * 60 * 1000);
    const { currency, address } = chainMap[chain];

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
        expectedAmount, // For tests we mirror USD amount as crypto placeholder
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
const getPaymentStatus = asyncHandler(async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    // Verify subscription ownership
    const ownershipCheck = await verifySubscriptionOwnership(subscriptionId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }

    // Find active invoice
    const activeInvoice =
      await subscriptionInvoiceService.findActiveInvoiceForSubscription(
        subscriptionId,
        subscriptionInvoiceService.INVOICE_PURPOSES.SUBSCRIPTION
      );

    if (!activeInvoice) {
      return res.status(404).json({
        error: 'No active payment invoice found for this subscription',
        subscriptionId,
      });
    }

    // Check if invoice is expired
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
 * Generate payment invoice for upgrading active subscription to PRO
 * POST /api/subscriptions/:id/upgrade/payment/generate
 *
 * DEPRECATED: HD wallet payments removed. Use /api/payments/subscription/crystalpay instead.
 */
const generateUpgradePaymentInvoice = asyncHandler(async (req, res) => {
  // HD wallet system was removed - direct crypto payments not available
  // Users should use CrystalPay payment flow via /api/payments/subscription/crystalpay
  return res.status(410).json({
    error: 'Прямые криптоплатежи отключены. Используйте CrystalPay.',
    deprecated: true,
    alternativeEndpoint: '/api/payments/subscription/crystalpay'
  });
});

/**
 * Get upgrade payment status for subscription
 * GET /api/subscriptions/:id/upgrade/payment/status
 */
const getUpgradePaymentStatus = asyncHandler(async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    const ownershipCheck = await verifySubscriptionOwnership(subscriptionId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }

    const activeInvoice =
      await subscriptionInvoiceService.findActiveInvoiceForSubscription(
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
const confirmUpgradePaymentWithTxHash = asyncHandler(async (req, res) => {
  const subscriptionId = parseInt(req.params.id, 10);
  const { txHash, paymentLink, txLink, transactionUrl } = req.body || {};
  const proof = txHash || paymentLink || txLink || transactionUrl;

  if (!proof) {
    throw new ValidationError('txHash or payment link is required');
  }

  // Ensure invoice exists to avoid processing wrong purpose
  const activeInvoice =
    await subscriptionInvoiceService.findActiveInvoiceForSubscription(
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
    paymentLink: paymentLink || txLink || transactionUrl || null,
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

/**
 * Manually confirm subscription payment by tx hash (single source of truth: blockchain)
 * POST /api/subscriptions/:id/payment/confirm
 *
 * Body: { txHash: string }
 */
const confirmPaymentWithTxHash = asyncHandler(async (req, res) => {
  const subscriptionId = parseInt(req.params.id, 10);
  const { txHash, paymentLink, txLink, transactionUrl } = req.body || {};
  const proof = txHash || paymentLink || txLink || transactionUrl;

  if (!proof) {
    throw new ValidationError('txHash or payment link is required');
  }

  // Ownership check happens inside the service, but we still do lightweight validation here
  const result = await invoicePaymentService.processSubscriptionPayment({
    subscriptionId,
    txHash,
    paymentLink: paymentLink || txLink || transactionUrl || null,
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

/**
 * Create pending subscription for first-time shop creation
 * POST /api/subscriptions/pending
 *
 * Body: {
 *   tier: 'basic' | 'pro'
 * }
 */
const createPendingSubscription = asyncHandler(async (req, res) => {
  try {
    const { tier, shopId: rawShopId } = req.body;
    const userId = req.user.id;

    logger.info('[SubscriptionController] Creating pending subscription:', {
      userId,
      tier,
      shopId: rawShopId,
    });

    // Validate tier
    if (!tier || !['basic', 'pro'].includes(tier)) {
      logger.warn('[SubscriptionController] Invalid tier provided:', { tier, userId });
      throw new ValidationError('Invalid tier. Use "basic" or "pro"');
    }

    // Validate optional shopId
    const shopId =
      rawShopId === undefined || rawShopId === null ? null : Number.parseInt(rawShopId, 10);

    if (rawShopId !== undefined && (!Number.isInteger(shopId) || shopId <= 0)) {
      throw new ValidationError('Invalid shopId');
    }

    if (shopId) {
      const ownershipCheck = await verifyShopOwnership(shopId, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.status).json({
          success: false,
          error: ownershipCheck.error,
        });
      }
    }

    // Get database client for transaction
    const { getClient } = await import('../config/database.js');
    const client = await getClient();

    try {
      await client.query('BEGIN');
      logger.debug('[SubscriptionController] Transaction started');

      // Prevent duplicate active/pending subscriptions for the same shop
      if (shopId) {
        const existing = await client.query(
          `SELECT id, status FROM shop_subscriptions 
           WHERE user_id = $1 AND shop_id = $2 AND status IN ('pending', 'active') 
           LIMIT 1`,
          [userId, shopId]
        );

        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            error: 'Subscription already exists for this shop',
            subscriptionId: existing.rows[0].id,
            status: existing.rows[0].status,
          });
        }
      }

      const now = new Date();
      const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
      const tempTxHash = `pending-${userId}-${Date.now()}`;
      const amount = subscriptionService.SUBSCRIPTION_PRICES[tier];

      // VALIDATION FIX: Ensure amount is valid
      if (!amount || Number.isNaN(amount) || amount <= 0) {
        throw new ValidationError(`Invalid subscription amount for tier '${tier}': ${amount}`);
      }

      const subscriptionResult = await client.query(
        `INSERT INTO shop_subscriptions
         (user_id, shop_id, tier, amount, tx_hash, currency, period_start, period_end, status)
         VALUES ($1, $2, $3, $4, $5, 'USDT', $6, $7, 'pending')
         RETURNING id, user_id, shop_id, tier, amount, currency, status, period_start, period_end`,
        [userId, shopId, tier, amount, tempTxHash, now, periodEnd]
      );

      const subscription = subscriptionResult.rows[0];

      await client.query('COMMIT');
      logger.info('[SubscriptionController] Pending subscription created:', {
        userId,
        subscriptionId: subscription.id,
        tier,
        amount,
        shopId,
      });

      res.status(201).json({
        success: true,
        subscription: {
          ...subscription,
          period_start: subscription.period_start?.toISOString
            ? subscription.period_start.toISOString()
            : subscription.period_start,
          period_end: subscription.period_end?.toISOString
            ? subscription.period_end.toISOString()
            : subscription.period_end,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[SubscriptionController] Error in transaction (rolled back):', {
        error: error.message,
        stack: error.stack,
        userId,
        tier,
      });
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('[SubscriptionController] Error creating pending subscription:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      tier: req.body?.tier,
    });
    logger.error('[SubscriptionController] CRITICAL - Failed to create pending subscription:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      tier: req.body?.tier,
    });
    throw error;
  }
});

/**
 * Helper: Verify subscription ownership
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {number} userId - User ID
 * @returns {Promise<{success: boolean, status?: number, error?: string, subscription?: object}>}
 */
async function verifySubscriptionOwnership(subscriptionId, userId) {
  try {
    const pool = (await import('../config/database.js')).default;

    const result = await pool.query(
      `SELECT ss.*,
              CASE
                WHEN ss.shop_id IS NOT NULL THEN s.owner_id
                ELSE ss.user_id
              END as owner_id
       FROM shop_subscriptions ss
       LEFT JOIN shops s ON ss.shop_id = s.id
       WHERE ss.id = $1`,
      [subscriptionId]
    );

    if (result.rows.length === 0) {
      return { success: false, status: 404, error: 'Subscription not found' };
    }

    const subscription = result.rows[0];

    // Check ownership via user_id or shop owner_id
    if (subscription.owner_id !== userId) {
      return { success: false, status: 403, error: 'Not authorized to access this subscription' };
    }

    return { success: true, subscription };
  } catch (error) {
    logger.error('[SubscriptionController] Error verifying subscription ownership:', error);
    return { success: false, status: 500, error: 'Internal server error' };
  }
}

export {
  paySubscription,
  upgradeShop,
  getUpgradeCost,
  getStatus,
  getHistory,
  getPricing,
  checkSubscription,
  getUserSubscriptions,
  getMyShopSubscriptions,
  generatePaymentInvoice,
  generateUpgradePaymentInvoice,
  getPaymentStatus,
  getUpgradePaymentStatus,
  confirmPaymentWithTxHash,
  confirmUpgradePaymentWithTxHash,
  createPendingSubscription,
};
