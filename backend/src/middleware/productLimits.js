/**
 * Product Limits Middleware
 *
 * Enforces tier-based product limits:
 * - Pro tier: 50 products max
 * - Max tier: unlimited products
 *
 * OPTIMIZATIONS:
 * - Combined shop + count query (1 query instead of 2)
 * - In-memory cache for limit checks (5 min TTL)
 */

import { pool } from '../config/database.js';
import { workerQueries } from '../database/queries/index.js';
import { TIER_LIMITS } from '../config/subscriptionPricing.js';
import logger from '../utils/logger.js';

// In-memory cache for product counts (5 min TTL)
const productCountCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Clear expired cache entries
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of productCountCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      productCountCache.delete(key);
    }
  }
}, 60 * 1000); // Clean every 1 minute

/**
 * Get product limit for tier
 */
function getProductLimit(tier) {
  const limits = TIER_LIMITS[tier];
  return limits ? limits.products : TIER_LIMITS.pro.products;
}

/**
 * Check if shop can add more products
 * Middleware for POST /api/products
 * OPTIMIZED: Combined query + caching
 */
export async function checkProductLimit(req, res, next) {
  try {
    const shopId = req.body.shopId;

    if (!shopId) {
      return res.status(400).json({
        error: 'shopId is required',
      });
    }

    // Check cache first
    const cacheKey = `limit_${shopId}`;
    const cached = productCountCache.get(cacheKey);

    let shop, currentCount;

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Use cached data
      shop = cached.shop;
      currentCount = cached.count;
      logger.debug(`[ProductLimit] Cache hit for shop ${shopId}`);
    } else {
      // OPTIMIZED: Combined query (1 query instead of 2)
      const result = await pool.query(
        `SELECT 
           s.id, s.tier, s.owner_id,
           COUNT(p.id)::int as product_count
         FROM shops s
         LEFT JOIN products p ON p.shop_id = s.id
         WHERE s.id = $1
         GROUP BY s.id, s.tier, s.owner_id`,
        [shopId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Shop not found',
        });
      }

      shop = result.rows[0];
      currentCount = shop.product_count;

      // Cache the result
      productCountCache.set(cacheKey, {
        shop: { id: shop.id, tier: shop.tier, owner_id: shop.owner_id },
        count: currentCount,
        timestamp: Date.now(),
      });
    }

    // Verify authorization: owner OR worker
    const isOwner = shop.owner_id === req.user.id;
    const isWorker = isOwner
      ? false
      : !!(await workerQueries.findByShopAndUser(shopId, req.user.id));

    if (!isOwner && !isWorker) {
      return res.status(403).json({
        success: false,
        error: 'You can only manage products in shops you own or manage as a worker',
      });
    }

    const tier = shop.tier || 'pro';
    const limit = getProductLimit(tier);

    // Max tier has no limits
    if (tier === 'max' || limit === Infinity) {
      return next();
    }

    // Check if limit reached
    if (currentCount >= limit) {
      logger.warn(
        `[ProductLimit] Shop ${shopId} (${tier}) reached limit: ${currentCount}/${limit}`
      );

      return res.status(403).json({
        error: 'PRODUCT_LIMIT_REACHED',
        message: `${tier.toUpperCase()} tier allows max ${limit} products. Upgrade to MAX for unlimited.`,
        currentCount,
        limit,
        tier,
        upgradeRequired: true,
        upgradeUrl: '/api/payments/subscription/crystalpay',
      });
    }

    logger.info(`[ProductLimit] Shop ${shopId} (${tier}): ${currentCount}/${limit} products`);

    // Attach limit info to request for later use
    req.productLimitInfo = {
      tier,
      currentCount,
      limit,
      canAdd: true,
    };

    next();
  } catch (error) {
    logger.error('[ProductLimit] Error checking product limit:', error);
    return res.status(500).json({
      error: 'Failed to check product limit',
    });
  }
}

/**
 * Get product limit status for a shop
 * Used by: GET /api/products/limit-status/:shopId
 * OPTIMIZED: Combined query + caching
 */
export async function getProductLimitStatus(shopId, userId) {
  try {
    // Check cache first
    const cacheKey = `limit_${shopId}`;
    const cached = productCountCache.get(cacheKey);

    let shop, currentCount;

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      shop = cached.shop;
      currentCount = cached.count;
    } else {
      // OPTIMIZED: Combined query (1 query instead of 2)
      const result = await pool.query(
        `SELECT 
           s.id, s.tier, s.owner_id,
           COUNT(p.id)::int as product_count
         FROM shops s
         LEFT JOIN products p ON p.shop_id = s.id
         WHERE s.id = $1
         GROUP BY s.id, s.tier, s.owner_id`,
        [shopId]
      );

      if (result.rows.length === 0) {
        throw new Error('Shop not found');
      }

      shop = result.rows[0];
      currentCount = shop.product_count;

      // Cache the result
      productCountCache.set(cacheKey, {
        shop: { id: shop.id, tier: shop.tier, owner_id: shop.owner_id },
        count: currentCount,
        timestamp: Date.now(),
      });
    }

    // Verify authorization: owner OR worker
    const isOwner = shop.owner_id === userId;
    const isWorker = isOwner ? false : !!(await workerQueries.findByShopAndUser(shopId, userId));

    if (!isOwner && !isWorker) {
      throw new Error('Not authorized to view this shop');
    }

    const tier = shop.tier || 'pro';
    const limit = getProductLimit(tier);
    const canAdd = tier === 'max' || limit === Infinity || currentCount < limit;

    return {
      shopId,
      tier,
      currentCount,
      limit: limit === Infinity ? 'unlimited' : limit,
      canAdd,
      upgradeAvailable: tier !== 'max',
    };
  } catch (error) {
    logger.error('[ProductLimit] Error getting limit status:', error);
    throw error;
  }
}

/**
 * Invalidate cache for a shop (call after product create/delete)
 */
export function invalidateProductLimitCache(shopId) {
  const cacheKey = `limit_${shopId}`;
  productCountCache.delete(cacheKey);
  logger.debug(`[ProductLimit] Cache invalidated for shop ${shopId}`);
}

export default {
  checkProductLimit,
  getProductLimitStatus,
  invalidateProductLimitCache,
  getProductLimit,
};
