/**
 * Product Limits Middleware
 *
 * Enforces tier-based product limits:
 * - Basic tier: 4 products max
 * - Pro tier: unlimited products
 */

import { pool } from '../config/database.js';
import { workerQueries } from '../models/db.js';
import logger from '../utils/logger.js';

// Product limits per tier
const PRODUCT_LIMITS = {
  basic: 4,
  pro: Infinity
};

/**
 * Check if shop can add more products
 * Middleware for POST /api/products
 */
export async function checkProductLimit(req, res, next) {
  try {
    const shopId = req.body.shopId;
    
    if (!shopId) {
      return res.status(400).json({
        error: 'shopId is required'
      });
    }
    
    // Get shop tier
    const shopResult = await pool.query(
      'SELECT id, tier, owner_id FROM shops WHERE id = $1',
      [shopId]
    );
    
    if (shopResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Shop not found'
      });
    }
    
    const shop = shopResult.rows[0];

    // Verify authorization: owner OR worker
    const isOwner = shop.owner_id === req.user.id;
    const isWorker = isOwner ? false : !!(await workerQueries.findByShopAndUser(shopId, req.user.id));

    if (!isOwner && !isWorker) {
      return res.status(403).json({
        success: false,
        error: 'You can only manage products in shops you own or manage as a worker'
      });
    }
    
    const tier = shop.tier || 'basic';
    const limit = PRODUCT_LIMITS[tier];
    
    // Pro tier has no limits
    if (tier === 'pro') {
      return next();
    }
    
    // Count current products for this shop
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE shop_id = $1',
      [shopId]
    );
    
    const currentCount = parseInt(countResult.rows[0].count, 10);
    
    // Check if limit reached
    if (currentCount >= limit) {
      logger.warn(`[ProductLimit] Shop ${shopId} (${tier}) reached limit: ${currentCount}/${limit}`);
      
      return res.status(403).json({
        error: 'PRODUCT_LIMIT_REACHED',
        message: `${tier.toUpperCase()} tier allows max ${limit} products. Upgrade to PRO for unlimited.`,
        currentCount,
        limit,
        tier,
        upgradeRequired: true,
        upgradeUrl: '/subscriptions/upgrade'
      });
    }
    
    logger.info(`[ProductLimit] Shop ${shopId} (${tier}): ${currentCount}/${limit} products`);
    
    // Attach limit info to request for later use
    req.productLimitInfo = {
      tier,
      currentCount,
      limit,
      canAdd: true
    };
    
    next();
  } catch (error) {
    logger.error('[ProductLimit] Error checking product limit:', error);
    return res.status(500).json({
      error: 'Failed to check product limit'
    });
  }
}

/**
 * Get product limit status for a shop
 * Used by: GET /api/products/limit-status/:shopId
 */
export async function getProductLimitStatus(shopId, userId) {
  try {
    // Get shop tier
    const shopResult = await pool.query(
      'SELECT id, tier, owner_id FROM shops WHERE id = $1',
      [shopId]
    );
    
    if (shopResult.rows.length === 0) {
      throw new Error('Shop not found');
    }
    
    const shop = shopResult.rows[0];

    // Verify authorization: owner OR worker
    const isOwner = shop.owner_id === userId;
    const isWorker = isOwner ? false : !!(await workerQueries.findByShopAndUser(shopId, userId));

    if (!isOwner && !isWorker) {
      throw new Error('Not authorized to view this shop');
    }
    
    const tier = shop.tier || 'basic';
    const limit = PRODUCT_LIMITS[tier];
    
    // Count products
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE shop_id = $1',
      [shopId]
    );
    
    const currentCount = parseInt(countResult.rows[0].count, 10);
    const canAdd = tier === 'pro' || currentCount < limit;
    
    return {
      shopId,
      tier,
      currentCount,
      limit: tier === 'pro' ? 'unlimited' : limit,
      canAdd,
      upgradeAvailable: tier === 'basic'
    };
  } catch (error) {
    logger.error('[ProductLimit] Error getting limit status:', error);
    throw error;
  }
}

export default {
  checkProductLimit,
  getProductLimitStatus,
  PRODUCT_LIMITS
};
