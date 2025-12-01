import * as subscriptionService from '../../../services/subscriptionService.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import { broadcast } from '../../../utils/websocket.js';

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

    const { subscriptionQueries } = await import('../../../database/queries/index.js');
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
 * Create subscription to shop (buyer subscribes to get notifications)
 * POST /api/subscriptions
 */
export const createSubscription = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const shopId = parseInt(req.body.shopId, 10);
    const telegramId = req.body.telegramId || null;

    if (!shopId || isNaN(shopId)) {
      throw new ValidationError('Invalid shop ID');
    }

    // Check if shop exists
    const { shopQueries, subscriptionQueries } = await import('../../../database/queries/index.js');
    const shop = await shopQueries.findById(shopId);

    if (!shop) {
      throw new ValidationError('Shop not found');
    }

    // Cannot subscribe to your own shop
    if (shop.owner_id === userId) {
      throw new ValidationError('Cannot subscribe to your own shop');
    }

    // Create subscription (uses ON CONFLICT to handle duplicates)
    const subscription = await subscriptionQueries.create(userId, shopId, telegramId);

    // Emit WebSocket event for real-time updates (new subscriber notification)
    broadcast('new_subscriber', { shopId, userId, subscriptionId: subscription.id });

    logger.info('[SubscriptionController] Subscription created:', {
      userId,
      shopId,
      subscriptionId: subscription.id,
    });

    return res.status(201).json({
      success: true,
      data: {
        ...subscription,
        shop_name: shop.name,
      },
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error creating subscription:', {
      error: error.message,
      stack: error.stack,
      shopId: req.body.shopId,
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
