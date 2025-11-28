import * as subscriptionService from '../../../services/subscriptionService.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';

/**
 * Check if user has active subscription to shop (buyer view)
 * GET /api/subscriptions/check/:shopId
 */
export const checkSubscription = asyncHandler(async (req, res) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    if (!shopId || isNaN(shopId)) {
      throw new ValidationError('Invalid shop ID');
    }

    const { subscriptionQueries } = await import('../../../models/db.js');
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
export const getUserSubscriptions = asyncHandler(async (req, res) => {
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
export const getMyShopSubscriptions = asyncHandler(async (req, res) => {
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
