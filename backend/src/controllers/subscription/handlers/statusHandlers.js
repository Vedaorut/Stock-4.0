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

    const history = await subscriptionService.getSubscriptionHistory(shopId, userId, limit);

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
 *
 * BUG-SUB-004 FIX: Features now match actual tier limits from subscriptionPricing.js
 * BUG-SUB-006 FIX: Yearly pricing now exposed in API response
 */
export const getPricing = asyncHandler(async (req, res) => {
  try {
    res.json({
      pro: {
        price: subscriptionService.SUBSCRIPTION_PRICES.pro,
        currency: 'USD',
        period: 'month',
        pricing: {
          month: subscriptionService.SUBSCRIPTION_PRICES.pro,
          year: subscriptionService.SUBSCRIPTION_PRICES_YEARLY.pro,
        },
        limits: {
          products: 50,
          follows: 2,
          workers: 0,
          analyticsDays: 30,
          canMigrate: false,
        },
        features: [
          'Create and manage shop',
          'Product management',
          'Shop follows (dropshipping)',
          'Sales analytics',
          'Priority support',
        ],
      },
      max: {
        price: subscriptionService.SUBSCRIPTION_PRICES.max,
        currency: 'USD',
        period: 'month',
        pricing: {
          month: subscriptionService.SUBSCRIPTION_PRICES.max,
          year: subscriptionService.SUBSCRIPTION_PRICES_YEARLY.max,
        },
        limits: {
          products: -1, // Unlimited (Infinity not JSON-serializable)
          follows: -1,  // Unlimited
          workers: 5,
          analyticsDays: 365,
          canMigrate: true,
        },
        features: [
          'Everything in PRO',
          'Unlimited products',
          'Unlimited shop follows',
          'Channel migration support',
          'Team workers',
          'Extended analytics',
          'Priority support (fast lane)',
        ],
      },
      gracePeriod: {
        days: subscriptionService.GRACE_PERIOD_DAYS,
        description: 'Grace period after subscription expires before shop deactivation',
      },
      yearlyDiscount: '~17% off compared to monthly billing',
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting pricing:', error);
    throw error;
  }
});
