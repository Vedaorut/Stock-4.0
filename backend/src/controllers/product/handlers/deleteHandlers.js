import { productQueries, shopQueries } from '../../../database/queries/index.js';
import { syncedProductQueries } from '../../../models/syncedProductQueries.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { invalidateProductLimitCache } from '../../../middleware/productLimits.js';
import { NotFoundError, UnauthorizedError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import { isAuthorizedToManageShop } from '../utils/authorization.js';
import { respondWithDbError } from '../utils/errors.js';
import { validateProductIds } from '../validators/payloadValidators.js';
import { broadcast } from '../../../utils/websocket.js';

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

    const shopId = existingProduct.shop_id;

    // If this is a synced product, remove the sync record first
    if (existingProduct.is_synced) {
      await syncedProductQueries.deleteBySyncedProductId(id);
      logger.info(`Removed sync record for product ${id} before deletion`);
    }

    // FIX: If this is a SOURCE product for synced products, deactivate them
    // Find all synced products derived from this source
    const syncedFromSource = await syncedProductQueries.findBySourceProductId(id);
    if (syncedFromSource.length > 0) {
      // Deactivate synced products (mark as inactive, don't delete)
      for (const synced of syncedFromSource) {
        await productQueries.update(synced.synced_product_id, { isActive: false });
        logger.info(`Deactivated synced product ${synced.synced_product_id} (source ${id} deleted)`);
      }
      // Delete sync records
      await syncedProductQueries.deleteBySourceProductId(id);
      logger.info(`Cleaned up ${syncedFromSource.length} sync records for deleted source product ${id}`);
    }

    await productQueries.delete(id);

    // Invalidate product limit cache after successful deletion
    invalidateProductLimitCache(shopId);

    // Emit WebSocket event for real-time updates
    broadcast('product_deleted', { shopId, productId: parseInt(id, 10) });

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

    // Invalidate product limit cache after successful deletion
    invalidateProductLimitCache(shopId);

    // Emit WebSocket event for each deleted product
    deletedProducts.forEach(product => {
      broadcast('product_deleted', { shopId, productId: product.id });
    });

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

    // Invalidate product limit cache after successful deletion
    invalidateProductLimitCache(shopId);

    // Emit WebSocket event for each deleted product
    deletedProducts.forEach(product => {
      broadcast('product_deleted', { shopId, productId: product.id });
    });

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
