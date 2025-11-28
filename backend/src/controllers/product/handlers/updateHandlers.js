import { productQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import { broadcast } from '../../../utils/websocket.js';
import { isAuthorizedToManageShop } from '../utils/authorization.js';
import { respondWithDbError } from '../utils/errors.js';

/**
 * Update product
 */
export const update = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, isActive, is_preorder } = req.body;
    const stockQuantity = req.body.stockQuantity ?? req.body.stock;
    const discountPercentage = req.body.discountPercentage ?? req.body.discount_percentage;
    const discountExpiresAt = req.body.discountExpiresAt ?? req.body.discount_expires_at;
    const originalPrice = req.body.originalPrice ?? req.body.original_price;

    const existingProduct = await productQueries.findById(id);

    if (!existingProduct) {
      throw new NotFoundError('Product');
    }

    const isAuthorized = await isAuthorizedToManageShop(existingProduct.shop_id, req.user.id);
    if (!isAuthorized) {
      throw new UnauthorizedError(
        'You can only update products in shops you own or manage as a worker'
      );
    }

    const product = await productQueries.update(id, {
      name,
      description,
      price,
      stockQuantity,
      isActive,
      discountPercentage,
      discountExpiresAt,
      originalPrice,
      isPreorder: is_preorder,
    });

    broadcast('product:updated', {
      shopId: product.shop_id,
      product,
    });

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('Update product error', { error: error.message, stack: error.stack });
    throw error;
  }
});
