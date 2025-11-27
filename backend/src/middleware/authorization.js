/**
 * Authorization Middleware
 *
 * Additional authorization checks beyond basic authentication.
 * Prevents IDOR (Insecure Direct Object Reference) vulnerabilities.
 */

import { shopFollowQueries } from '../models/shopFollowQueries.js';
import { shopQueries } from '../database/queries/index.js';
import logger from '../utils/logger.js';

/**
 * Require user to own the follow (via shop ownership)
 * Checks that the follow's follower_shop is owned by the authenticated user
 *
 * Usage: Add after verifyToken on follow modification endpoints
 */
export const requireFollowOwner = async (req, res, next) => {
  try {
    const followId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    if (!followId || !Number.isInteger(followId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid follow ID is required',
      });
    }

    // Get the follow
    const follow = await shopFollowQueries.findById(followId);

    if (!follow) {
      return res.status(404).json({
        success: false,
        error: 'Follow not found',
      });
    }

    // Get the follower shop
    const shop = await shopQueries.findById(follow.follower_shop_id);

    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found',
      });
    }

    // Check ownership
    if (shop.owner_id !== userId) {
      logger.warn('Unauthorized follow access attempt', {
        userId,
        followId,
        shopId: shop.id,
        actualOwnerId: shop.owner_id,
      });

      return res.status(403).json({
        success: false,
        error: 'Not authorized to modify this follow',
      });
    }

    // Attach follow and shop to request for downstream use
    req.follow = follow;
    req.shop = shop;

    next();
  } catch (error) {
    logger.error('Follow authorization error', {
      error: error.message,
      stack: error.stack,
      followId: req.params.id,
      userId: req.user?.id,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to verify follow ownership',
    });
  }
};

/**
 * @deprecated NOT IN USE - Subscription endpoints verify ownership in controllers
 *
 * Require user to own the subscription (via shop ownership)
 * Checks that the subscription's shop is owned by the authenticated user
 *
 * Note: This is a placeholder. Subscription routes need to be refactored
 * to use subscription IDs instead of shop IDs directly.
 * Most subscription endpoints already verify shop ownership through controller logic.
 *
 * If you need subscription ownership verification, implement it in the controller
 * or refactor subscription routes to use subscription IDs.
 */
export const requireSubscriptionOwner = async (req, res, _next) => {
  logger.warn('[DEPRECATED] requireSubscriptionOwner middleware called but NOT IN USE', {
    subscriptionId: req.params.id,
    userId: req.user?.id,
    route: req.originalUrl,
  });

  return res.status(501).json({
    success: false,
    error:
      'This middleware is deprecated and not in use. Use controller-level authorization instead.',
  });
};

export default {
  requireFollowOwner,
  requireSubscriptionOwner,
};
