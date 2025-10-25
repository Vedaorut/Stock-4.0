import { shopFollowQueries } from '../models/shopFollowQueries.js';
import { shopQueries, workerQueries } from '../models/db.js';
import { getClient } from '../config/database.js';
import { syncAllProductsForFollow, updateMarkupForFollow } from '../services/productSyncService.js';
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

  const markup = follow.mode === 'resell'
    ? toNumber(follow.markup_percentage, 0)
    : 0;

  return {
    id: follow.id,
    follower_shop_id: follow.follower_shop_id,
    target_shop_id: follow.source_shop_id,
    follower_shop_name: follow.follower_shop_name || null,
    source_shop_id: follow.source_shop_id,
    source_shop_name: follow.source_shop_name || null,
    source_owner_id: follow.source_owner_id || null,
    source_username: follow.source_username || null,
    mode: follow.mode,
    markup_percentage: markup,
    status: follow.status,
    synced_products_count: toNumber(follow.synced_products_count, 0),
    created_at: follow.created_at,
    updated_at: follow.updated_at
  };
};

/**
 * Get all follows for user's shop
 */
export const getMyFollows = async (req, res) => {
  try {
    const shopId = Number.parseInt(req.query.shopId, 10);

    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId must be a positive integer' });
    }

    const access = await workerQueries.checkAccess(shopId, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this shop' });
    }

    const follows = await shopFollowQueries.findByFollowerShopId(shopId, 'active');
    const data = follows.map(formatFollowResponse);

    res.json({ data });
  } catch (error) {
    logger.error('Error getting follows', {
      error: error.message,
      stack: error.stack,
      shopId: req.query?.shopId
    });
    res.status(500).json({ error: 'Failed to get follows' });
  }
};

/**
 * Create new follow relationship
 */
export const createFollow = async (req, res) => {
  try {
    const followerShopIdRaw = req.body.followerShopId ?? req.body.follower_shop_id;
    const sourceShopIdRaw = req.body.sourceShopId ?? req.body.source_shop_id ?? req.body.target_shop_id;
    const { mode, markupPercentage } = req.body;

    const followerId = Number.parseInt(followerShopIdRaw, 10);
    const sourceId = Number.parseInt(sourceShopIdRaw, 10);
    const normalizedMode = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    const markupValue = markupPercentage !== undefined ? Number(markupPercentage) : undefined;

    // Validation
    if (!Number.isInteger(followerId) || followerId <= 0) {
      return res.status(400).json({ error: 'followerShopId must be a positive integer' });
    }

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return res.status(400).json({ error: 'sourceShopId must be a positive integer' });
    }

    if (!['monitor', 'resell'].includes(normalizedMode)) {
      return res.status(400).json({ error: 'mode must be either monitor or resell' });
    }

    if (followerId === sourceId) {
      return res.status(400).json({ error: 'Cannot follow your own shop' });
    }

    if (normalizedMode === 'resell') {
      if (!Number.isFinite(markupValue)) {
        return res.status(400).json({ error: 'Markup percentage is required for resell mode' });
      }

      if (markupValue < 1 || markupValue > 500) {
        return res.status(400).json({ error: 'Markup must be between 1% and 500%' });
      }
    }

    // Ensure shops exist
    const [followerShop, sourceShop] = await Promise.all([
      shopQueries.findById(followerId),
      shopQueries.findById(sourceId)
    ]);

    if (!followerShop) {
      return res.status(404).json({ error: 'Follower shop not found' });
    }

    if (!sourceShop) {
      return res.status(404).json({ error: 'Source shop not found' });
    }

    const access = await workerQueries.checkAccess(followerId, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this shop' });
    }

    // Check if already following
    const existing = await shopFollowQueries.findByRelationship(followerId, sourceId);
    if (existing) {
      return res.status(409).json({ error: 'Already following this shop' });
    }

    // Check circular follows
    const wouldCreateCycle = await shopFollowQueries.checkCircularFollow(followerId, sourceId);
    if (wouldCreateCycle) {
      return res.status(400).json({ error: 'Cannot create circular follow relationship' });
    }

    const followerTier = (followerShop.tier || '').toLowerCase();
    const isPro = followerTier === 'pro';

    const client = await getClient();
    let follow;

    try {
      await client.query('BEGIN');

      if (!isPro) {
        const activeRows = await client.query(
          `SELECT id FROM shop_follows WHERE follower_shop_id = $1 AND status = 'active' FOR UPDATE`,
          [followerId]
        );

        if (activeRows.rowCount >= FREE_TIER_LIMIT) {
          await client.query('ROLLBACK');
          return res.status(402).json({
            error: 'FREE tier limit reached',
            data: {
              limit: FREE_TIER_LIMIT,
              count: activeRows.rowCount,
              remaining: 0,
              reached: true,
              canFollow: false
            }
          });
        }
      }

      const insertResult = await client.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING *`,
        [
          followerId,
          sourceId,
          normalizedMode,
          normalizedMode === 'resell' ? markupValue : 0
        ]
      );

      follow = insertResult.rows[0];

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');

      if (txError.code === '23505') {
        return res.status(409).json({ error: 'Already following this shop' });
      }

      throw txError;
    } finally {
      client.release();
    }

    // If resell mode, sync all products
    if (normalizedMode === 'resell') {
      try {
        await syncAllProductsForFollow(follow.id);
      } catch (syncError) {
        logger.error('Failed to sync products during follow creation', {
          followId: follow.id,
          error: syncError.message,
          stack: syncError.stack
        });
        // Roll back follow to avoid inconsistent state
        await shopFollowQueries.delete(follow.id);
        return res.status(500).json({ error: 'Failed to sync products for resell follow' });
      }
    }

    const followWithDetails = await shopFollowQueries.findById(follow.id);
    logger.info('Follow created', {
      followerShopId: followerId,
      sourceShopId: sourceId,
      mode: normalizedMode,
      followId: follow.id
    });
    res.status(201).json({ data: formatFollowResponse(followWithDetails) });
  } catch (error) {
    logger.error('Error creating follow', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to create follow' });
  }
};

/**
 * Update follow markup
 */
export const updateFollowMarkup = async (req, res) => {
  try {
    const { id } = req.params;
    const { markupPercentage } = req.body;

    const followId = Number.parseInt(id, 10);
    const markupValue = Number(markupPercentage);

    if (!Number.isInteger(followId) || followId <= 0) {
      return res.status(400).json({ error: 'Invalid follow ID' });
    }

    if (!Number.isFinite(markupValue) || markupValue < 1 || markupValue > 500) {
      return res.status(400).json({ error: 'Markup must be between 1% and 500%' });
    }

    const existingFollow = await shopFollowQueries.findById(followId);
    if (!existingFollow) {
      return res.status(404).json({ error: 'Follow not found' });
    }

    const access = await workerQueries.checkAccess(existingFollow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this follow' });
    }

    if (existingFollow.mode !== 'resell') {
      return res.status(400).json({ error: 'Markup can only be updated in resell mode' });
    }

    await shopFollowQueries.updateMarkup(followId, markupValue);

    // Update all synced products with new markup
    await updateMarkupForFollow(followId, markupValue);

    const updatedFollow = await shopFollowQueries.findById(followId);
    res.json({ data: formatFollowResponse(updatedFollow) });
  } catch (error) {
    logger.error('Error updating follow markup', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to update markup' });
  }
};

/**
 * Switch follow mode (monitor ↔ resell)
 */
export const switchFollowMode = async (req, res) => {
  try {
    const { id } = req.params;
    const { mode, markupPercentage } = req.body;

    const followId = Number.parseInt(id, 10);
    const normalizedMode = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    const markupValue = markupPercentage !== undefined ? Number(markupPercentage) : undefined;

    if (!Number.isInteger(followId) || followId <= 0) {
      return res.status(400).json({ error: 'Invalid follow ID' });
    }

    if (!['monitor', 'resell'].includes(normalizedMode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const existingFollow = await shopFollowQueries.findById(followId);
    if (!existingFollow) {
      return res.status(404).json({ error: 'Follow not found' });
    }

    const access = await workerQueries.checkAccess(existingFollow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this follow' });
    }

    // If switching to resell, validate markup first
    if (normalizedMode === 'resell') {
      if (!Number.isFinite(markupValue) || markupValue < 1 || markupValue > 500) {
        return res.status(400).json({ error: 'Markup required for resell mode' });
      }
    }

    // No-op if mode unchanged and no markup update requested
    if (existingFollow.mode === normalizedMode && normalizedMode !== 'resell') {
      return res.json({ data: formatFollowResponse(existingFollow) });
    }

    await shopFollowQueries.updateMode(followId, normalizedMode);

    if (normalizedMode === 'resell') {
      await shopFollowQueries.updateMarkup(followId, markupValue);
      await syncAllProductsForFollow(followId);
    } else {
      // Switching to monitor mode resets markup to 0
      await shopFollowQueries.updateMarkup(followId, 0);
    }

    const updatedFollow = await shopFollowQueries.findById(followId);
    res.json({ data: formatFollowResponse(updatedFollow) });
  } catch (error) {
    logger.error('Error switching follow mode', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to switch mode' });
  }
};

/**
 * Delete follow (unfollow)
 */
export const deleteFollow = async (req, res) => {
  try {
    const { id } = req.params;

    const followId = Number.parseInt(id, 10);

    if (!Number.isInteger(followId) || followId <= 0) {
      return res.status(400).json({ error: 'Invalid follow ID' });
    }

    const follow = await shopFollowQueries.findById(followId);

    if (!follow) {
      return res.status(404).json({ error: 'Follow not found' });
    }

    const access = await workerQueries.checkAccess(follow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this follow' });
    }

    await shopFollowQueries.delete(followId);

    logger.info('Follow deleted', { followId });
    res.json({ data: { id: followId, deleted: true } });
  } catch (error) {
    logger.error('Error deleting follow', {
      error: error.message,
      stack: error.stack,
      params: req.params
    });
    res.status(500).json({ error: 'Failed to delete follow' });
  }
};

/**
 * Check follow limit (for bot to check before showing follow option)
 */
export const checkFollowLimit = async (req, res) => {
  try {
    const shopId = Number.parseInt(req.query.shopId, 10);

    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId must be a positive integer' });
    }

    // Check subscription tier
    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const access = await workerQueries.checkAccess(shopId, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this shop' });
    }

    // PRO tier = unlimited follows, basic tier = 2 follows
    const isPro = (shop.tier || '').toLowerCase() === 'pro';
    const limit = isPro ? null : FREE_TIER_LIMIT; // null = unlimited

    const activeCount = await shopFollowQueries.countActiveByFollowerShopId(shopId);
    const limitData = {
      limit: limit,
      count: activeCount,
      remaining: isPro ? null : Math.max(0, FREE_TIER_LIMIT - activeCount),
      reached: isPro ? false : (activeCount >= FREE_TIER_LIMIT),
      canFollow: isPro ? true : (activeCount < FREE_TIER_LIMIT),
      tier: isPro ? 'PRO' : 'FREE'
    };

    res.json({ data: limitData });
  } catch (error) {
    logger.error('Error checking follow limit', {
      error: error.message,
      stack: error.stack,
      shopId: req.query?.shopId
    });
    res.status(500).json({ error: 'Failed to check limit' });
  }
};
