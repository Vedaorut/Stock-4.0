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
 * Supports merge mode: if merge=true and product with same name exists, update it instead
 */
export const create = asyncHandler(async (req, res) => {
  try {
    const { shopId, name, description, price, is_preorder, merge } = req.body;
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

    let product;
    let isNew = true;

    if (merge) {
      // Use upsert - update existing product if name matches, else create new
      const result = await productQueries.upsert({
        shopId,
        name,
        description,
        price,
        currency,
        stockQuantity,
        isPreorder: is_preorder,
      });
      product = result.product;
      isNew = result.isNew;
    } else {
      // Standard create (may fail on duplicate if there's a constraint)
      product = await productQueries.create({
        shopId,
        name,
        description,
        price,
        currency,
        stockQuantity,
        isPreorder: is_preorder,
      });
    }

    // Invalidate product limit cache after successful creation
    if (isNew) {
      invalidateProductLimitCache(shopId);
    }

    // Emit WebSocket event for real-time updates
    broadcast(isNew ? 'product_added' : 'product_updated', { shopId, productId: product.id });

    return res.status(isNew ? 201 : 200).json({
      success: true,
      data: product,
      merged: !isNew,
    });
  } catch (error) {
    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('Create product error', { error: error.message, stack: error.stack });
    throw error;
  }
});
