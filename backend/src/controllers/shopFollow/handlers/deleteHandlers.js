import { shopFollowQueries } from '../../../models/shopFollowQueries.js';
import { workerQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';

/**
 * Delete follow (unfollow)
 * DELETE /follows/:id
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
