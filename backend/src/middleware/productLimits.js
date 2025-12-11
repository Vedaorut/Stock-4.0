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
 *
 * RACE CONDITION FIX:
 * - Uses PostgreSQL advisory locks to serialize product creation per shop
 * - Lock is acquired in middleware and released after controller completes
 */

import { pool, getClient } from '../config/database.js';
import { workerQueries } from '../database/queries/index.js';
import { TIER_LIMITS } from '../config/subscriptionPricing.js';
import logger from '../utils/logger.js';

// Advisory lock namespace offset to avoid collisions with other lock usages
const PRODUCT_LIMIT_LOCK_NAMESPACE = 1000000;

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
 *
 * RACE CONDITION FIX:
 * Uses PostgreSQL advisory lock to serialize product creation per shop.
 * This prevents two concurrent requests from both passing the count check.
 *
 * Flow:
 * 1. Try to acquire advisory lock for shop (with retry)
 * 2. Count products (now guaranteed accurate)
 * 3. If limit OK, pass to controller (lock still held)
 * 4. Controller creates product
 * 5. Response middleware releases lock
 */
export async function checkProductLimit(req, res, next) {
  let client = null;
  const shopId = req.body.shopId;

  try {
    if (!shopId) {
      return res.status(400).json({
        error: 'shopId is required',
      });
    }

    // Get dedicated client for advisory lock
    // Advisory lock is session-level, so we need to keep the same client
    client = await getClient();

    // Try to acquire advisory lock with retry logic
    // This prevents connection pool exhaustion under high concurrency
    const lockId = shopId + PRODUCT_LIMIT_LOCK_NAMESPACE;
    const maxRetries = 5;
    const retryDelayMs = 100;
    let lockAcquired = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const lockResult = await client.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [lockId]
      );
      lockAcquired = lockResult.rows[0].acquired;

      if (lockAcquired) {
        break;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
      }
    }

    if (!lockAcquired) {
      // Release client if we couldn't acquire lock
      client.release();
      logger.warn(`[ProductLimit] Could not acquire lock for shop ${shopId} after ${maxRetries} attempts`);
      return res.status(503).json({
        error: 'SERVICE_BUSY',
        message: 'Too many concurrent requests. Please try again.',
        retryAfter: 1,
      });
    }

    logger.debug(`[ProductLimit] Advisory lock acquired for shop ${shopId}`);

    // Store client and lock info on request for cleanup
    req.productLimitClient = client;
    req.productLimitLockId = lockId;

    // Hook into response finish to release lock
    res.on('finish', () => {
      releaseProductLimitLock(req);
    });
    res.on('close', () => {
      releaseProductLimitLock(req);
    });

    // Now count products WITH lock held (no cache - must be fresh count)
    // Note: products use is_active=true for active products (no deleted_at column)
    const result = await client.query(
      `SELECT
         s.id, s.tier, s.owner_id,
         COUNT(p.id)::int as product_count
       FROM shops s
       LEFT JOIN products p ON p.shop_id = s.id AND p.is_active = true
       WHERE s.id = $1
       GROUP BY s.id, s.tier, s.owner_id`,
      [shopId]
    );

    if (result.rows.length === 0) {
      releaseProductLimitLock(req);
      return res.status(404).json({
        error: 'Shop not found',
      });
    }

    const shop = result.rows[0];
    const currentCount = shop.product_count;

    // Verify authorization: owner OR worker
    const isOwner = shop.owner_id === req.user.id;
    const isWorker = isOwner
      ? false
      : !!(await workerQueries.findByShopAndUser(shopId, req.user.id));

    if (!isOwner && !isWorker) {
      releaseProductLimitLock(req);
      return res.status(403).json({
        success: false,
        error: 'You can only manage products in shops you own or manage as a worker',
      });
    }

    const tier = shop.tier || 'pro';
    const limit = getProductLimit(tier);

    // Max tier has no limits (but keep lock to ensure count accuracy)
    if (tier === 'max' || limit === Infinity) {
      // Update cache even for max tier
      const cacheKey = `limit_${shopId}`;
      productCountCache.set(cacheKey, {
        shop: { id: shop.id, tier: shop.tier, owner_id: shop.owner_id },
        count: currentCount,
        timestamp: Date.now(),
      });
      return next();
    }

    // Check if limit reached
    if (currentCount >= limit) {
      logger.warn(
        `[ProductLimit] Shop ${shopId} (${tier}) reached limit: ${currentCount}/${limit}`
      );

      releaseProductLimitLock(req);
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

    // Update cache
    const cacheKey = `limit_${shopId}`;
    productCountCache.set(cacheKey, {
      shop: { id: shop.id, tier: shop.tier, owner_id: shop.owner_id },
      count: currentCount,
      timestamp: Date.now(),
    });

    // Attach limit info to request for later use
    req.productLimitInfo = {
      tier,
      currentCount,
      limit,
      canAdd: true,
    };

    // Lock is still held - will be released when response finishes
    next();
  } catch (error) {
    // Release lock on error
    releaseProductLimitLock(req);
    logger.error('[ProductLimit] Error checking product limit:', error);
    return res.status(500).json({
      error: 'Failed to check product limit',
    });
  }
}

/**
 * Release advisory lock and client
 * Called automatically when response finishes or on error
 */
function releaseProductLimitLock(req) {
  if (req.productLimitClient && req.productLimitLockId) {
    const client = req.productLimitClient;
    const lockId = req.productLimitLockId;
    const shopId = lockId - PRODUCT_LIMIT_LOCK_NAMESPACE;

    // Clear from request immediately to prevent double-release
    req.productLimitClient = null;
    req.productLimitLockId = null;

    // Release lock and client asynchronously
    client.query('SELECT pg_advisory_unlock($1)', [lockId])
      .then(() => {
        logger.debug(`[ProductLimit] Advisory lock released for shop ${shopId}`);
      })
      .catch((err) => {
        logger.error(`[ProductLimit] Error releasing advisory lock for shop ${shopId}:`, err);
      })
      .finally(() => {
        client.release();
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
