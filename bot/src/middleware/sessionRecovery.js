/**
 * Session Recovery Middleware
 * Recovers critical session data after bot restart
 * Restores: shopId, shopName, role from backend API
 */

import logger from '../utils/logger.js';
import { shopApi } from '../utils/api.js';

/**
 * Session recovery middleware
 * Attempts to restore session data from backend
 */
const sessionRecoveryMiddleware = async (ctx, next) => {
  try {
    // Skip for non-user updates
    if (!ctx.from) {
      return next();
    }

    // Skip if no auth token (user needs to /start first)
    if (!ctx.session?.token) {
      return next();
    }

    // Check if recovery needed
    const needsRecovery = checkIfRecoveryNeeded(ctx);

    if (needsRecovery) {
      logger.info('Attempting session recovery', {
        userId: ctx.from.id,
        hasToken: !!ctx.session.token,
        hasShopId: !!ctx.session.shopId,
        role: ctx.session.user?.selectedRole
      });

      await recoverSessionData(ctx);
    }

    return next();
  } catch (error) {
    logger.error('Session recovery middleware error:', {
      userId: ctx.from?.id,
      error: error.message
    });

    // Continue anyway - handler will show appropriate error
    return next();
  }
};

/**
 * Check if session recovery is needed
 * @param {Context} ctx - Telegraf context
 * @returns {boolean} Needs recovery?
 */
function checkIfRecoveryNeeded(ctx) {
  // Has token but missing user data
  if (ctx.session.token && !ctx.session.user) {
    return true;
  }

  // User is seller but missing shop data
  if (ctx.session.user?.selectedRole === 'seller' && !ctx.session.shopId) {
    return true;
  }

  return false;
}

/**
 * Recover session data from backend API
 * @param {Context} ctx - Telegraf context
 */
async function recoverSessionData(ctx) {
  try {
    // Recover shop data for sellers
    if (ctx.session.user?.selectedRole === 'seller' && !ctx.session.shopId) {
      const shops = await shopApi.getMyShop(ctx.session.token);

      if (shops && Array.isArray(shops) && shops.length > 0) {
        const shop = shops[0];
        ctx.session.shopId = shop.id;
        ctx.session.shopName = shop.name;

        logger.info('Shop data recovered', {
          userId: ctx.from.id,
          shopId: shop.id,
          shopName: shop.name
        });
      } else {
        logger.debug('No shop found for user', {
          userId: ctx.from.id
        });
      }
    }

    // Note: User data (ctx.session.user) is recovered by auth middleware
    // if it's missing, so we don't need to handle it here

    logger.info('Session recovery completed', {
      userId: ctx.from.id,
      recoveredShopId: !!ctx.session.shopId
    });
  } catch (error) {
    logger.error('Failed to recover session data:', {
      userId: ctx.from.id,
      error: error.message,
      status: error.response?.status
    });

    // If token expired, clear session
    if (error.response?.status === 401) {
      logger.info('Token expired during recovery, clearing session', {
        userId: ctx.from.id
      });

      ctx.session.token = null;
      ctx.session.user = null;
      ctx.session.shopId = null;
      ctx.session.shopName = null;
    }

    throw error;
  }
}

export default sessionRecoveryMiddleware;
