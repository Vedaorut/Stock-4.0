import { shopFollowQueries } from '../models/shopFollowQueries.js';
import { shopQueries, workerQueries, productQueries } from '../database/queries/index.js';
import { syncedProductQueries } from '../models/syncedProductQueries.js';
import { getClient } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError, ConflictError, PaymentRequiredError } from '../utils/errors.js';
import { syncAllProductsForFollow, updateMarkupForFollow, calculatePriceWithMarkup } from '../services/productSyncService.js';
import { queueProductSync, getSyncStatus } from '../jobs/syncQueue.js';
import logger from '../utils/logger.js';

const FREE_TIER_LIMIT = 2; // FREE users can follow max 2 shops

/**
 * Normalize numeric values that might come back as strings from PostgreSQL
 * @param {number|string|null|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Convert raw follow row into API response format
 * Ensures consistent field names and numeric types
 * @param {Object} follow
 * @returns {Object|null}
 */
const formatFollowResponse = (follow) => {
  if (!follow) {
    return null;
  }

  const markupType = follow.markup_type || 'percentage';
  const markupPercentage = follow.mode === 'resell' && markupType === 'percentage'
    ? toNumber(follow.markup_percentage, 0) : 0;
  const markupFixed = follow.mode === 'resell' && markupType === 'fixed'
    ? toNumber(follow.markup_fixed, 0) : 0;

  return {
    id: follow.id,
    follower_shop_id: follow.follower_shop_id,
    target_shop_id: follow.source_shop_id,
    follower_shop_name: follow.follower_shop_name || null,
    source_shop_id: follow.source_shop_id,
    source_shop_name: follow.source_shop_name || null,
    source_shop_logo: follow.source_shop_logo || null,
    source_owner_id: follow.source_owner_id || null,
    source_username: follow.source_username || null,
    mode: follow.mode,
    markup_type: markupType,
    markup_percentage: markupPercentage,
    markup_fixed: markupFixed,
    status: follow.status,
    synced_products_count: toNumber(follow.synced_products_count, 0),
    source_products_count: toNumber(follow.source_products_count, 0),
    created_at: follow.created_at,
    updated_at: follow.updated_at,
  };
};

/**
 * Get all follows for user's shop
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

const formatMonitorProduct = (product) => ({
  id: product.id,
  name: product.name,
  description: product.description,
  price: Number(product.price),
  currency: product.currency,
  stock_quantity: Number(product.stock_quantity),
  is_active: product.is_active,
  image: product.image || product.images?.[0] || null,
  updated_at: product.updated_at,
  created_at: product.created_at,
});

const formatResellProduct = (row, globalMarkupPercentage, globalMarkupType = 'percentage', globalMarkupFixed = 0) => {
  const sourcePrice = Number(row.source_product_price) || 0;
  const syncedPrice = Number(row.synced_product_price) || 0;

  // Determine effective markup (custom > global)
  const hasCustomMarkup = row.custom_markup_type !== null;
  const effectiveMarkupType = hasCustomMarkup ? row.custom_markup_type : globalMarkupType;
  const effectiveMarkupPercentage = hasCustomMarkup
    ? Number(row.custom_markup_percentage) || 0
    : Number(globalMarkupPercentage) || 0;
  const effectiveMarkupFixed = hasCustomMarkup
    ? Number(row.custom_markup_fixed) || 0
    : Number(globalMarkupFixed) || 0;

  // Calculate expected price based on markup type
  let expectedPrice;
  if (effectiveMarkupType === 'fixed') {
    expectedPrice = sourcePrice + effectiveMarkupFixed;
  } else {
    const markupMultiplier = 1 + effectiveMarkupPercentage / 100;
    expectedPrice = sourcePrice * markupMultiplier;
  }
  expectedPrice = Number(expectedPrice.toFixed(2));

  return {
    id: row.id,
    follow_id: row.follow_id,
    source_product: {
      id: row.source_product_id,
      name: row.source_product_name,
      price: sourcePrice,
      stock_quantity: Number(row.source_product_stock),
      is_active: row.source_product_active,
      is_preorder: row.source_product_preorder || false,
    },
    synced_product: {
      id: row.synced_product_id,
      name: row.synced_product_name,
      price: syncedPrice,
      stock_quantity: Number(row.synced_product_stock),
      is_active: row.synced_product_active,
      is_preorder: row.synced_product_preorder || false,
    },
    pricing: {
      markup_type: effectiveMarkupType,
      markup_percentage: effectiveMarkupPercentage,
      markup_fixed: effectiveMarkupFixed,
      expected_price: expectedPrice,
      deviation: syncedPrice
        ? Number((syncedPrice - expectedPrice).toFixed(2))
        : null,
      has_custom_markup: hasCustomMarkup,
    },
    custom_markup: hasCustomMarkup ? {
      type: row.custom_markup_type,
      percentage: Number(row.custom_markup_percentage) || 0,
      fixed: Number(row.custom_markup_fixed) || 0,
    } : null,
    conflict_status: row.conflict_status,
    last_synced_at: row.last_synced_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Get products for a follow relationship (monitor or resell)
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

    // Global follow markup settings
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
 * Create new follow relationship
 */
export const createFollow = asyncHandler(async (req, res) => {
  try {
    const followerShopIdRaw = req.body.followerShopId ?? req.body.follower_shop_id;
    const sourceShopIdRaw =
      req.body.sourceShopId ?? req.body.source_shop_id ?? req.body.target_shop_id;
    const { mode, markupPercentage, markupType: rawMarkupType, markupFixed } = req.body;

    const followerId = Number.parseInt(followerShopIdRaw, 10);
    const sourceId = Number.parseInt(sourceShopIdRaw, 10);
    const normalizedMode = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    const markupTypeValue = rawMarkupType === 'fixed' ? 'fixed' : 'percentage';
    const markupPercentageValue = markupPercentage !== undefined ? Number(markupPercentage) : undefined;
    const markupFixedValue = markupFixed !== undefined ? Number(markupFixed) : 0;

    // Validation
    if (!Number.isInteger(followerId) || followerId <= 0) {
      throw new ValidationError('followerShopId must be a positive integer');
    }

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      throw new ValidationError('sourceShopId must be a positive integer');
    }

    if (!['monitor', 'resell'].includes(normalizedMode)) {
      throw new ValidationError('mode must be either monitor or resell');
    }

    if (followerId === sourceId) {
      throw new ValidationError('Cannot follow your own shop');
    }

    if (normalizedMode === 'resell') {
      if (markupTypeValue === 'percentage') {
        if (!Number.isFinite(markupPercentageValue)) {
          throw new ValidationError('Markup percentage is required for resell mode with percentage type');
        }
        // P1-SEC-007: Limit markup to 0.1-500% to prevent extreme pricing
        if (markupPercentageValue < 0.1 || markupPercentageValue > 500) {
          throw new ValidationError('Markup must be between 0.1% and 500%');
        }
      } else if (markupTypeValue === 'fixed') {
        if (!Number.isFinite(markupFixedValue) || markupFixedValue < 0) {
          throw new ValidationError('Fixed markup must be a non-negative number');
        }
        // Limit fixed markup to reasonable amount (e.g., $1000)
        if (markupFixedValue > 1000) {
          throw new ValidationError('Fixed markup cannot exceed $1000');
        }
      }
    }

    // Ensure shops exist
    const [followerShop, sourceShop] = await Promise.all([
      shopQueries.findById(followerId),
      shopQueries.findById(sourceId),
    ]);

    if (!followerShop) {
      throw new NotFoundError('Follower shop');
    }

    if (!sourceShop) {
      throw new NotFoundError('Source shop');
    }

    const access = await workerQueries.checkAccess(followerId, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this shop');
    }

    // Check if already following
    const existing = await shopFollowQueries.findByRelationship(followerId, sourceId);
    if (existing) {
      throw new ConflictError('Already following this shop');
    }

    // Check circular follows
    const wouldCreateCycle = await shopFollowQueries.checkCircularFollow(followerId, sourceId);
    if (wouldCreateCycle) {
      throw new ValidationError('Cannot create circular follow relationship');
    }

    const followerTier = (followerShop.tier || '').toLowerCase();
    const isPro = followerTier === 'pro';

    // P0-DB-2 FIX: Wrap follow creation + product sync in single transaction
    const client = await getClient();
    let follow;

    try {
      // SERIALIZABLE isolation for tier limit check
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      if (!isPro) {
        const activeRows = await client.query(
          `SELECT id FROM shop_follows WHERE follower_shop_id = $1 AND status = 'active' FOR UPDATE`,
          [followerId]
        );

        if (activeRows.rowCount >= FREE_TIER_LIMIT) {
          await client.query('ROLLBACK');
          const limitError = new PaymentRequiredError('FREE tier limit reached');
          limitError.meta = { count: activeRows.rowCount };
          throw limitError;
        }
      }

      const insertResult = await client.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_type, markup_percentage, markup_fixed, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING *`,
        [
          followerId,
          sourceId,
          normalizedMode,
          normalizedMode === 'resell' ? markupTypeValue : 'percentage',
          normalizedMode === 'resell' && markupTypeValue === 'percentage' ? markupPercentageValue : 0,
          normalizedMode === 'resell' && markupTypeValue === 'fixed' ? markupFixedValue : 0,
        ]
      );

      follow = insertResult.rows[0];

      // Commit transaction immediately (don't wait for product sync)
      await client.query('COMMIT');

      // P0-PERF-1 FIX: Queue product sync in background for resell mode
      if (normalizedMode === 'resell') {
        // Queue sync job - non-blocking, returns immediately
        await queueProductSync(follow.id, sourceId, followerId);

        logger.info('Product sync queued for follow', {
          followId: follow.id,
          sourceShopId: sourceId,
          followerShopId: followerId,
        });
      }
    } catch (txError) {
      // P0-DB-2 FIX: Proper rollback handling
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Rollback error in createFollow', { error: rollbackError.message });
      }

      if (txError instanceof PaymentRequiredError) {
        const count = txError.meta?.count ?? FREE_TIER_LIMIT;
        return res.status(402).json({
          success: false,
          error: txError.message,
          data: {
            limit: FREE_TIER_LIMIT,
            count,
            remaining: Math.max(0, FREE_TIER_LIMIT - count),
            reached: true,
            canFollow: false,
          },
        });
      }

      if (txError.code === '23505') {
        throw new ConflictError('Already following this shop');
      }

      logger.error('Transaction error in createFollow', {
        error: txError.message,
        stack: txError.stack,
      });
      return res.status(500).json({ error: 'Failed to create follow' });
    } finally {
      client.release();
    }

    const followWithDetails = await shopFollowQueries.findById(follow.id);
    logger.info('Follow created', {
      followerShopId: followerId,
      sourceShopId: sourceId,
      mode: normalizedMode,
      followId: follow.id,
    });

    // P0-PERF-1 FIX: Return 202 for resell mode (sync in progress)
    if (normalizedMode === 'resell') {
      return res.status(202).json({
        success: true,
        data: formatFollowResponse(followWithDetails),
        message: 'Follow created. Products are syncing in background.',
        sync_status: 'pending',
      });
    }

    // Monitor mode - immediate response
    res.status(201).json({ success: true, data: formatFollowResponse(followWithDetails) });
  } catch (error) {
    logger.error('Error creating follow', {
      error: error.message,
      stack: error.stack,
      body: req.body,
    });
    throw error;
  }
});

/**
 * Update follow markup
 */
export const updateFollowMarkup = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const markupPercentageRaw = req.body.markupPercentage ?? req.body.markup_percentage;
    const markupFixedRaw = req.body.markupFixed ?? req.body.markup_fixed;
    const markupTypeRaw = req.body.markupType ?? req.body.markup_type;

    const followId = Number.parseInt(id, 10);
    const markupType = markupTypeRaw === 'fixed' ? 'fixed' : 'percentage';
    const markupPercentage = Number(markupPercentageRaw);
    const markupFixed = Number(markupFixedRaw) || 0;

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Invalid follow ID');
    }

    // Validate based on markup type
    if (markupType === 'percentage') {
      // P1-SEC-007: Limit markup to 0.1-500%
      if (!Number.isFinite(markupPercentage) || markupPercentage < 0.1 || markupPercentage > 500) {
        throw new ValidationError('Markup must be between 0.1% and 500%');
      }
    } else if (markupType === 'fixed') {
      if (!Number.isFinite(markupFixed) || markupFixed < 0) {
        throw new ValidationError('Fixed markup must be a non-negative number');
      }
      if (markupFixed > 1000) {
        throw new ValidationError('Fixed markup cannot exceed $1000');
      }
    }

    const existingFollow = await shopFollowQueries.findById(followId);
    if (!existingFollow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(existingFollow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    if (existingFollow.mode !== 'resell') {
      throw new ValidationError('Markup can only be updated in resell mode');
    }

    await shopFollowQueries.updateMarkup(followId, markupPercentage, markupType, markupFixed);

    // Update all synced products with new markup
    const markupValue = markupType === 'fixed' ? markupFixed : markupPercentage;
    await updateMarkupForFollow(followId, markupType, markupValue);

    const updatedFollow = await shopFollowQueries.findById(followId);
    res.json({ success: true, data: formatFollowResponse(updatedFollow) });
  } catch (error) {
    logger.error('Error updating follow markup', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
    });
    throw error;
  }
});

/**
 * Switch follow mode (monitor ↔ resell)
 */
export const switchFollowMode = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { markupPercentage } = req.body;
    const modeRaw = typeof req.body.mode === 'string' ? req.body.mode.trim().toLowerCase() : '';

    const followId = Number.parseInt(id, 10);
    const normalizedMode = modeRaw === 'showcase' ? 'monitor' : modeRaw;
    const markupValue = markupPercentage !== undefined ? Number(markupPercentage) : undefined;

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Invalid follow ID');
    }

    if (!['monitor', 'resell'].includes(normalizedMode)) {
      throw new ValidationError('Invalid mode');
    }

    const existingFollow = await shopFollowQueries.findById(followId);
    if (!existingFollow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(existingFollow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    // If switching to resell, validate markup first (P1-SEC-007)
    if (normalizedMode === 'resell') {
      if (!Number.isFinite(markupValue) || markupValue < 0.1 || markupValue > 500) {
        throw new ValidationError('Markup must be between 0.1% and 500% for resell mode');
      }
    }

    // No-op if mode unchanged and no markup update requested
    if (existingFollow.mode === normalizedMode && normalizedMode !== 'resell') {
      return res.json({ success: true, data: formatFollowResponse(existingFollow) });
    }

    await shopFollowQueries.updateMode(followId, normalizedMode);

    if (normalizedMode === 'resell') {
      await shopFollowQueries.updateMarkup(followId, markupValue);
      await syncAllProductsForFollow(followId);
    } else {
      // Switching to monitor mode resets markup to 0
      await shopFollowQueries.updateMarkup(followId, 0);

      // Clean up synced products created in resell mode
      const synced = await syncedProductQueries.findByFollowId(followId);
      if (synced.length > 0) {
        const syncedProductIds = synced.map((row) => row.synced_product_id);
        // Remove follower copies
        await productQueries.bulkDeleteByIds(syncedProductIds, existingFollow.follower_shop_id);
        // Remove sync mappings
        await syncedProductQueries.deleteByFollowId(followId);
      }
    }

    const updatedFollow = await shopFollowQueries.findById(followId);
    res.json({ success: true, data: formatFollowResponse(updatedFollow) });
  } catch (error) {
    logger.error('Error switching follow mode', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
    });
    throw error;
  }
});

/**
 * Delete follow (unfollow)
 */
export const deleteFollow = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const followId = Number.parseInt(id, 10);

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Invalid follow ID');
    }

    const follow = await shopFollowQueries.findById(followId);

    if (!follow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(follow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    await shopFollowQueries.delete(followId);

    logger.info('Follow deleted', { followId });
    res.json({ success: true, data: { id: followId, deleted: true } });
  } catch (error) {
    logger.error('Error deleting follow', {
      error: error.message,
      stack: error.stack,
      params: req.params,
    });
    throw error;
  }
});

/**
 * Get sync status for a follow (P0-PERF-1)
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

    // Get sync status from queue
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
 * Update product-level markup
 * PUT /follows/:id/products/:productId/markup
 */
export const updateProductMarkup = asyncHandler(async (req, res) => {
  try {
    const { id, productId } = req.params;
    const markupTypeRaw = req.body.markupType ?? req.body.markup_type;
    const markupPercentageRaw = req.body.markupPercentage ?? req.body.markup_percentage;
    const markupFixedRaw = req.body.markupFixed ?? req.body.markup_fixed;

    const followId = Number.parseInt(id, 10);
    const syncedProductId = Number.parseInt(productId, 10);
    const markupType = markupTypeRaw === 'fixed' ? 'fixed' : 'percentage';
    const markupPercentage = Number(markupPercentageRaw) || 0;
    const markupFixed = Number(markupFixedRaw) || 0;

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Invalid follow ID');
    }

    if (!Number.isInteger(syncedProductId) || syncedProductId <= 0) {
      throw new ValidationError('Invalid product ID');
    }

    // Validate markup values
    if (markupType === 'percentage') {
      if (markupPercentage < 0 || markupPercentage > 500) {
        throw new ValidationError('Markup percentage must be between 0% and 500%');
      }
    } else if (markupType === 'fixed') {
      if (markupFixed < 0 || markupFixed > 10000) {
        throw new ValidationError('Fixed markup must be between $0 and $10000');
      }
    }

    // Verify follow exists and user has access
    const follow = await shopFollowQueries.findById(followId);
    if (!follow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(follow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    if (follow.mode !== 'resell') {
      throw new ValidationError('Product markup can only be set in resell mode');
    }

    // Find synced product record
    const syncedProduct = await syncedProductQueries.findByFollowAndSyncedProduct(followId, syncedProductId);
    if (!syncedProduct) {
      throw new NotFoundError('Synced product');
    }

    // Update custom markup
    const updated = await syncedProductQueries.updateCustomMarkup(
      syncedProduct.id,
      markupType,
      markupType === 'percentage' ? markupPercentage : null,
      markupType === 'fixed' ? markupFixed : null
    );

    // BUG FIX: Update the actual product price with new custom markup
    const sourceProduct = await productQueries.findById(syncedProduct.source_product_id);
    const sourcePrice = Number(sourceProduct.price);
    const markupValue = markupType === 'fixed' ? markupFixed : markupPercentage;
    const newPrice = calculatePriceWithMarkup(sourcePrice, markupType, markupValue);
    await productQueries.update(syncedProductId, { price: newPrice });

    logger.info('Product markup updated', {
      followId,
      syncedProductId,
      markupType,
      markupPercentage,
      markupFixed,
      sourcePrice,
      newPrice,
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        synced_product_id: updated.synced_product_id,
        custom_markup: {
          type: markupType,
          percentage: markupPercentage,
          fixed: markupFixed,
        },
      },
    });
  } catch (error) {
    logger.error('Error updating product markup', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
    });
    throw error;
  }
});

/**
 * Reset product-level markup to use global follow markup
 * DELETE /follows/:id/products/:productId/markup
 */
export const resetProductMarkup = asyncHandler(async (req, res) => {
  try {
    const { id, productId } = req.params;

    const followId = Number.parseInt(id, 10);
    const syncedProductId = Number.parseInt(productId, 10);

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Invalid follow ID');
    }

    if (!Number.isInteger(syncedProductId) || syncedProductId <= 0) {
      throw new ValidationError('Invalid product ID');
    }

    // Verify follow exists and user has access
    const follow = await shopFollowQueries.findById(followId);
    if (!follow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(follow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    // Find synced product record
    const syncedProduct = await syncedProductQueries.findByFollowAndSyncedProduct(followId, syncedProductId);
    if (!syncedProduct) {
      throw new NotFoundError('Synced product');
    }

    // Reset custom markup to NULL (use global)
    const updated = await syncedProductQueries.resetCustomMarkup(syncedProduct.id);

    logger.info('Product markup reset to global', {
      followId,
      syncedProductId,
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        synced_product_id: updated.synced_product_id,
        custom_markup: null,
        message: 'Product markup reset to global follow markup',
      },
    });
  } catch (error) {
    logger.error('Error resetting product markup', {
      error: error.message,
      stack: error.stack,
      params: req.params,
    });
    throw error;
  }
});

/**
 * Check follow limit (for bot to check before showing follow option)
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

    // Check subscription tier
    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      throw new NotFoundError('Shop');
    }

    const access = await workerQueries.checkAccess(shopId, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this shop');
    }

    // PRO tier = unlimited follows, basic tier = 2 follows
    const isPro = (shop.tier || '').toLowerCase() === 'pro';
    const limit = isPro ? null : FREE_TIER_LIMIT; // null = unlimited

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
