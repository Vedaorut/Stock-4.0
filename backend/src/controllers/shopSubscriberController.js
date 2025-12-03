import { shopSubscriberQueries, shopQueries } from '../database/queries/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Shop Subscriber Controller
 * Handles user subscriptions to shops via invite links
 */
export const shopSubscriberController = {
  /**
   * Subscribe to a shop
   * POST /api/shops/:shopId/subscribe
   */
  subscribe: asyncHandler(async (req, res) => {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    logger.info('[ShopSubscriber] Subscribe request', { userId, shopId });

    // Validate shop exists
    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      throw new NotFoundError('Shop');
    }

    // Cannot subscribe to own shop
    if (shop.owner_id === userId) {
      throw new ValidationError('Cannot subscribe to your own shop');
    }

    // Check if shop is active
    if (!shop.is_active) {
      throw new ValidationError('Cannot subscribe to inactive shop');
    }

    // Create subscription (idempotent)
    const subscription = await shopSubscriberQueries.create(userId, shopId);

    // If null, subscription already existed
    const isNew = subscription !== null;

    logger.info('[ShopSubscriber] Subscription result', {
      userId,
      shopId,
      isNew,
    });

    return res.status(isNew ? 201 : 200).json({
      success: true,
      data: {
        subscribed: true,
        isNew,
        shop: {
          id: shop.id,
          name: shop.name,
          logo: shop.logo,
        },
      },
    });
  }),

  /**
   * Unsubscribe from a shop
   * DELETE /api/shops/:shopId/subscribe
   */
  unsubscribe: asyncHandler(async (req, res) => {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    logger.info('[ShopSubscriber] Unsubscribe request', { userId, shopId });

    // Validate shop exists
    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      throw new NotFoundError('Shop');
    }

    // Delete subscription
    const deleted = await shopSubscriberQueries.delete(userId, shopId);

    if (!deleted) {
      // Not subscribed - return success anyway (idempotent)
      return res.status(200).json({
        success: true,
        data: {
          subscribed: false,
          wasSubscribed: false,
        },
      });
    }

    logger.info('[ShopSubscriber] Unsubscribed', { userId, shopId });

    return res.status(200).json({
      success: true,
      data: {
        subscribed: false,
        wasSubscribed: true,
      },
    });
  }),

  /**
   * Get subscriber count for a shop (public)
   * GET /api/shops/:shopId/subscribers/count
   */
  getCount: asyncHandler(async (req, res) => {
    const shopId = parseInt(req.params.shopId, 10);

    // Validate shop exists
    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      throw new NotFoundError('Shop');
    }

    const count = await shopSubscriberQueries.countByShop(shopId);

    return res.status(200).json({
      success: true,
      data: {
        shopId,
        count,
      },
    });
  }),

  /**
   * Get current user's subscriptions
   * GET /api/users/subscriptions
   */
  getMySubscriptions: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const subscriptions = await shopSubscriberQueries.findByUser(userId);

    return res.status(200).json({
      success: true,
      data: subscriptions,
    });
  }),

  /**
   * Check if current user is subscribed to a shop
   * GET /api/shops/:shopId/subscribed
   */
  checkSubscription: asyncHandler(async (req, res) => {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    // Validate shop exists
    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      throw new NotFoundError('Shop');
    }

    const isSubscribed = await shopSubscriberQueries.isSubscribed(userId, shopId);

    return res.status(200).json({
      success: true,
      data: {
        shopId,
        subscribed: isSubscribed,
      },
    });
  }),

  /**
   * Get subscribers of a shop (shop owner only)
   * GET /api/shops/:shopId/subscribers
   */
  getSubscribers: asyncHandler(async (req, res) => {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;

    // Validate shop exists
    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      throw new NotFoundError('Shop');
    }

    // Only owner can see subscribers list
    if (shop.owner_id !== userId) {
      throw new ValidationError('Only shop owner can view subscribers');
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = (page - 1) * limit;

    const [subscribers, totalCount] = await Promise.all([
      shopSubscriberQueries.findByShop(shopId, limit, offset),
      shopSubscriberQueries.countByShop(shopId),
    ]);

    return res.status(200).json({
      success: true,
      data: subscribers,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  }),
};

export default shopSubscriberController;
