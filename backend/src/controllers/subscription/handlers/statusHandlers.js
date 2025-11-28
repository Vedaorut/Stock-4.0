import * as subscriptionService from '../../../services/subscriptionService.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';
import { verifyShopOwnership } from '../utils/ownership.js';

/**
 * Get subscription status for shop
 * GET /api/subscriptions/status/:shopId
 */
export const getStatus = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

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
export const getHistory = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 10;

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
export const getPricing = asyncHandler(async (req, res) => {
  try {
    res.json({
      basic: {
        price: subscriptionService.SUBSCRIPTION_PRICES.basic,
        currency: 'USD',
        period: '30 days',
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
        price: subscriptionService.SUBSCRIPTION_PRICES.pro,
        currency: 'USD',
        period: '30 days',
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
