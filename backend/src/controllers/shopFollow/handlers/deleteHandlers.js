import { shopFollowQueries } from '../../../models/shopFollowQueries.js';
import { workerQueries, productQueries } from '../../../database/queries/index.js';
import { syncedProductQueries } from '../../../models/syncedProductQueries.js';
import { getClient } from '../../../config/database.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';

/**
 * Delete follow (unfollow)
 * DELETE /follows/:id
 *
 * P0-2 FIX: Properly delete synced products before deleting follow
 * to prevent orphaned records in products table
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

    // P0-2 FIX: Wrap deletion in transaction to prevent orphaned products
    const client = await getClient();
    let deletedProductsCount = 0;

    try {
      await client.query('BEGIN');

      // 1. If in resell mode, find and delete synced products
      if (follow.mode === 'resell') {
        const synced = await syncedProductQueries.findByFollowId(followId, client);

        if (synced.length > 0) {
          const syncedProductIds = synced.map((row) => row.synced_product_id);

          // 2. Delete synced_products records FIRST (FK constraint)
          await syncedProductQueries.deleteByFollowId(followId, client);

          // 3. Delete the actual products
          await productQueries.bulkDeleteSyncedProducts(syncedProductIds, follow.follower_shop_id, client);
          deletedProductsCount = syncedProductIds.length;
        }
      }

      // 4. Delete the follow record
      await client.query('DELETE FROM shop_follows WHERE id = $1', [followId]);

      await client.query('COMMIT');

      logger.info('Follow deleted with cleanup', {
        followId,
        mode: follow.mode,
        deletedProducts: deletedProductsCount,
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      logger.error('Error in deleteFollow transaction', {
        followId,
        error: txError.message,
        stack: txError.stack,
      });
      throw txError;
    } finally {
      client.release();
    }

    res.json({ success: true, data: { id: followId, deleted: true, deletedProducts: deletedProductsCount } });
  } catch (error) {
    logger.error('Error deleting follow', {
      error: error.message,
      stack: error.stack,
      params: req.params,
    });
    throw error;
  }
});
