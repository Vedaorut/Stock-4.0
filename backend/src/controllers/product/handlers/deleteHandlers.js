import { productQueries, shopQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import { isAuthorizedToManageShop } from '../utils/authorization.js';
import { respondWithDbError } from '../utils/errors.js';
import { validateProductIds } from '../validators/payloadValidators.js';

/**
 * Delete product
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const existingProduct = await productQueries.findById(id);

    if (!existingProduct) {
      throw new NotFoundError('Product');
    }

    const isAuthorized = await isAuthorizedToManageShop(existingProduct.shop_id, req.user.id);
    if (!isAuthorized) {
      throw new UnauthorizedError(
        'You can only delete products in shops you own or manage as a worker'
      );
    }

    await productQueries.delete(id);

    return res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('Delete product error', { error: error.message, stack: error.stack });
    throw error;
  }
});

/**
 * Bulk delete all products from a shop
 */
export const bulkDeleteAll = asyncHandler(async (req, res) => {
  try {
    const { shopId } = req.body;
    const shop = await shopQueries.findById(shopId);

    if (!shop) {
      throw new NotFoundError('Shop');
    }

    const isAuthorized = await isAuthorizedToManageShop(shopId, req.user.id);
    if (!isAuthorized) {
      throw new UnauthorizedError(
        'You can only delete products from shops you own or manage as a worker'
      );
    }

    const deletedProducts = await productQueries.bulkDeleteByShopId(shopId);

    return res.status(200).json({
      success: true,
      message: `${deletedProducts.length} product(s) deleted successfully`,
      data: {
        deletedCount: deletedProducts.length,
        deletedProducts,
      },
    });
  } catch (error) {
    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('Bulk delete all products error', { error: error.message, stack: error.stack });
    throw error;
  }
});

/**
 * Bulk delete specific products by IDs
 */
export const bulkDeleteByIds = asyncHandler(async (req, res) => {
  try {
    const { shopId, productIds } = req.body;

    validateProductIds(productIds);

    const shop = await shopQueries.findById(shopId);

    if (!shop) {
      throw new NotFoundError('Shop');
    }

    const isAuthorized = await isAuthorizedToManageShop(shopId, req.user.id);
    if (!isAuthorized) {
      throw new UnauthorizedError(
        'You can only delete products from shops you own or manage as a worker'
      );
    }

    const deletedProducts = await productQueries.bulkDeleteByIds(productIds, shopId);

    return res.status(200).json({
      success: true,
      message: `${deletedProducts.length} product(s) deleted successfully`,
      data: {
        deletedCount: deletedProducts.length,
        deletedProducts,
      },
    });
  } catch (error) {
    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('Bulk delete products error', { error: error.message, stack: error.stack });
    throw error;
  }
});
