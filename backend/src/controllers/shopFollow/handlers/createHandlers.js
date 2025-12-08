import { shopFollowQueries } from '../../../models/shopFollowQueries.js';
import { shopQueries, workerQueries } from '../../../database/queries/index.js';
import { getClient } from '../../../config/database.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError, ConflictError, PaymentRequiredError } from '../../../utils/errors.js';
import { queueProductSync } from '../../../jobs/syncQueue.js';
import logger from '../../../utils/logger.js';
import { PRO_TIER_FOLLOW_LIMIT, formatFollowResponse } from '../helpers.js';

/**
 * Create new follow relationship
 * POST /follows
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
        if (markupPercentageValue < 0.1 || markupPercentageValue > 500) {
          throw new ValidationError('Markup must be between 0.1% and 500%');
        }
      } else if (markupTypeValue === 'fixed') {
        if (!Number.isFinite(markupFixedValue) || markupFixedValue < 0) {
          throw new ValidationError('Fixed markup must be a non-negative number');
        }
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

    const followerTier = (followerShop.tier || 'pro').toLowerCase();
    // FIX: Max tier has unlimited follows, only check limits for other tiers
    const isMaxTier = followerTier === 'max';

    const client = await getClient();
    let follow;

    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // Max tier = unlimited follows, Pro tier = PRO_TIER_FOLLOW_LIMIT (2)
      if (!isMaxTier) {
        const activeRows = await client.query(
          `SELECT id FROM shop_follows WHERE follower_shop_id = $1 AND status = 'active' FOR UPDATE`,
          [followerId]
        );

        if (activeRows.rowCount >= PRO_TIER_FOLLOW_LIMIT) {
          await client.query('ROLLBACK');
          const limitError = new PaymentRequiredError('PRO tier limit reached');
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
      await client.query('COMMIT');

      if (normalizedMode === 'resell') {
        await queueProductSync(follow.id, sourceId, followerId);

        logger.info('Product sync queued for follow', {
          followId: follow.id,
          sourceShopId: sourceId,
          followerShopId: followerId,
        });
      }
    } catch (txError) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Rollback error in createFollow', { error: rollbackError.message });
      }

      if (txError instanceof PaymentRequiredError) {
        const count = txError.meta?.count ?? PRO_TIER_FOLLOW_LIMIT;
        return res.status(402).json({
          success: false,
          error: txError.message,
          data: {
            limit: PRO_TIER_FOLLOW_LIMIT,
            count,
            remaining: Math.max(0, PRO_TIER_FOLLOW_LIMIT - count),
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

    if (normalizedMode === 'resell') {
      return res.status(202).json({
        success: true,
        data: formatFollowResponse(followWithDetails),
        message: 'Follow created. Products are syncing in background.',
        sync_status: 'pending',
      });
    }

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
