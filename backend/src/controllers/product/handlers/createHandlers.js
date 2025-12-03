import { productQueries, shopQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { invalidateProductLimitCache } from '../../../middleware/productLimits.js';
import { NotFoundError, UnauthorizedError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import { isAuthorizedToManageShop } from '../utils/authorization.js';
import { respondWithDbError } from '../utils/errors.js';
import { broadcast } from '../../../utils/websocket.js';

/**
 * Create new product
 */
export const create = asyncHandler(async (req, res) => {
  try {
    const { shopId, name, description, price, is_preorder } = req.body;
    const stockQuantity = req.body.stockQuantity ?? req.body.stock ?? 0;
    const currency = req.body.currency || 'USD';

    const shop = await shopQueries.findById(shopId);

    if (!shop) {
      throw new NotFoundError('Shop');
    }

    const isAuthorized = await isAuthorizedToManageShop(shopId, req.user.id, shop);
    if (!isAuthorized) {
      throw new UnauthorizedError(
        'You can only add products to shops you own or manage as a worker'
      );
    }

    const product = await productQueries.create({
      shopId,
      name,
      description,
      price,
      currency,
      stockQuantity,
      isPreorder: is_preorder,
    });

    // Invalidate product limit cache after successful creation
    invalidateProductLimitCache(shopId);

    // Emit WebSocket event for real-time updates
    broadcast('product_added', { shopId, productId: product.id });

    return res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('Create product error', { error: error.message, stack: error.stack });
    throw error;
  }
});
