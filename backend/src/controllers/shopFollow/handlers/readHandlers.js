import { shopFollowQueries } from '../../../models/shopFollowQueries.js';
import { shopQueries, workerQueries, productQueries } from '../../../database/queries/index.js';
import { syncedProductQueries } from '../../../models/syncedProductQueries.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../utils/errors.js';
import { getSyncStatus } from '../../../jobs/syncQueue.js';
import logger from '../../../utils/logger.js';
import {
  FREE_TIER_LIMIT,
  toNumber,
  formatFollowResponse,
  formatMonitorProduct,
  formatResellProduct,
} from '../helpers.js';

/**
 * Get all follows for user's shop
 * GET /follows
 */
export const getMyFollows = asyncHandler(async (req, res) => {
  try {
    const shopId = Number.parseInt(req.query.shopId, 10);

    if (!shopId) {
      throw new ValidationError('shopId is required');
    }

    if (!Number.isInteger(shopId) || shopId <= 0) {
      throw new ValidationError('shopId must be a positive integer');
    }

    const access = await workerQueries.checkAccess(shopId, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this shop');
    }

    const follows = await shopFollowQueries.findByFollowerShopId(shopId, 'active');
    const data = follows.map(formatFollowResponse);

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error getting follows', {
      error: error.message,
      stack: error.stack,
      shopId: req.query?.shopId,
    });
    throw error;
  }
});

/**
 * Get detailed follow info
 * GET /follows/:id
 */
export const getFollowDetail = asyncHandler(async (req, res) => {
  try {
    const followId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Valid follow ID is required');
    }

    const follow = await shopFollowQueries.findById(followId);

    if (!follow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(follow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    const formatted = formatFollowResponse(follow);

    formatted.stats = {
      source_products: formatted.source_products_count,
      synced_products: formatted.synced_products_count,
    };

    formatted.source_shop = {
      id: follow.source_shop_id,
      name: follow.source_shop_name,
      logo: follow.source_shop_logo || null,
      username: follow.source_username || null,
      owner_id: follow.source_owner_id,
    };

    formatted.follower_shop = {
      id: follow.follower_shop_id,
      name: follow.follower_shop_name || null,
    };

    return res.json({ success: true, data: formatted });
  } catch (error) {
    logger.error('Error getting follow detail', {
      error: error.message,
      stack: error.stack,
      followId: req.params?.id,
    });
    throw error;
  }
});

/**
 * Get products for a follow relationship
 * GET /follows/:id/products
 */
export const getFollowProducts = asyncHandler(async (req, res) => {
  try {
    const followId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Valid follow ID is required');
    }

    const follow = await shopFollowQueries.findById(followId);

    if (!follow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(follow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 25, 100);
    const offset = Number.parseInt(req.query.offset, 10) || 0;

    if (follow.mode === 'monitor') {
      const products = await productQueries.list({
        shopId: follow.source_shop_id,
        limit,
        offset,
        isActive: true,
      });
      const total = toNumber(follow.source_products_count, 0);

      return res.json({
        success: true,
        data: {
          mode: 'monitor',
          products: products.map(formatMonitorProduct),
          pagination: {
            limit,
            offset,
            total,
          },
        },
      });
    }

    const rows = await syncedProductQueries.findByFollowIdPaginated(followId, limit, offset);
    const total =
      rows.length > 0 && rows[0].total_count
        ? Number(rows[0].total_count)
        : follow.synced_products_count || 0;

    const globalMarkupPercentage = toNumber(follow.markup_percentage, 0);
    const globalMarkupType = follow.markup_type || 'percentage';
    const globalMarkupFixed = toNumber(follow.markup_fixed, 0);

    return res.json({
      success: true,
      data: {
        mode: 'resell',
        global_markup: {
          type: globalMarkupType,
          percentage: globalMarkupPercentage,
          fixed: globalMarkupFixed,
        },
        products: rows.map((row) => formatResellProduct(row, globalMarkupPercentage, globalMarkupType, globalMarkupFixed)),
        pagination: {
          limit,
          offset,
          total,
        },
      },
    });
  } catch (error) {
    logger.error('Error getting follow products', {
      error: error.message,
      stack: error.stack,
      followId: req.params?.id,
    });
    throw error;
  }
});

/**
 * Get sync status for a follow
 * GET /follows/:id/sync-status
 */
export const getFollowSyncStatus = asyncHandler(async (req, res) => {
  try {
    const followId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Valid follow ID is required');
    }

    const follow = await shopFollowQueries.findById(followId);

    if (!follow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(follow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    const syncStatus = await getSyncStatus(followId);

    return res.json({
      success: true,
      data: {
        follow_id: followId,
        ...syncStatus,
      },
    });
  } catch (error) {
    logger.error('Error getting sync status', {
      error: error.message,
      stack: error.stack,
      followId: req.params?.id,
    });
    throw error;
  }
});

/**
 * Check follow limit for shop
 * GET /follows/limit
 */
export const checkFollowLimit = asyncHandler(async (req, res) => {
  try {
    const shopId = Number.parseInt(req.query.shopId, 10);

    if (!shopId) {
      throw new ValidationError('shopId is required');
    }

    if (!Number.isInteger(shopId) || shopId <= 0) {
      throw new ValidationError('shopId must be a positive integer');
    }

    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      throw new NotFoundError('Shop');
    }

    const access = await workerQueries.checkAccess(shopId, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this shop');
    }

    const isPro = (shop.tier || '').toLowerCase() === 'pro';
    const limit = isPro ? null : FREE_TIER_LIMIT;

    const activeCount = await shopFollowQueries.countActiveByFollowerShopId(shopId);
    const limitData = {
      limit: limit,
      count: activeCount,
      remaining: isPro ? null : Math.max(0, FREE_TIER_LIMIT - activeCount),
      reached: isPro ? false : activeCount >= FREE_TIER_LIMIT,
      canFollow: isPro ? true : activeCount < FREE_TIER_LIMIT,
      tier: isPro ? 'PRO' : 'FREE',
    };

    res.json({ success: true, data: limitData });
  } catch (error) {
    logger.error('Error checking follow limit', {
      error: error.message,
      stack: error.stack,
      shopId: req.query?.shopId,
    });
    throw error;
  }
});
