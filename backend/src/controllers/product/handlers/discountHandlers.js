import { getClient } from '../../../config/database.js';
import { productQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { UnauthorizedError, ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import { isAuthorizedToManageShop } from '../utils/authorization.js';
import { respondWithDbError } from '../utils/errors.js';
import { requireShopId } from '../validators/payloadValidators.js';

/**
 * Apply bulk discount to all products in a shop
 */
export const applyBulkDiscount = asyncHandler(async (req, res) => {
  const client = await getClient();

  try {
    const { percentage, type, duration, excluded_product_ids = [] } = req.body;
    const shopId = req.body.shopId || req.user?.shopId;

    requireShopId(shopId);

    if (!Array.isArray(excluded_product_ids)) {
      throw new ValidationError('excluded_product_ids must be array');
    }

    if (!percentage || percentage < 0 || percentage > 100) {
      throw new ValidationError('Discount percentage must be between 0 and 100');
    }

    if (!['permanent', 'timer'].includes(type)) {
      throw new ValidationError('Type must be "permanent" or "timer"');
    }

    if (type === 'timer' && !duration) {
      throw new ValidationError('Duration required for timer discount');
    }

    const isAuthorized = await isAuthorizedToManageShop(shopId, req.user.id);
    if (!isAuthorized) {
      throw new UnauthorizedError(
        'You can only apply discounts to shops you own or manage as a worker'
      );
    }

    await client.query('BEGIN');
    logger.info('applyBulkDiscount: Transaction started', { shopId, percentage, type });

    const result = await productQueries.applyBulkDiscount(
      shopId,
      {
        percentage,
        type,
        duration: duration || null,
        excludedProductIds: excluded_product_ids,
      },
      client
    );

    await client.query('COMMIT');
    logger.info('applyBulkDiscount: Transaction committed', {
      shopId,
      percentage,
      type,
      productsUpdated: result.productsUpdated,
      productsExcluded: result.productsExcluded,
    });

    return res.status(200).json({
      success: true,
      data: {
        productsUpdated: result.productsUpdated,
        productsExcluded: result.productsExcluded,
        products: result.updatedProducts,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
      logger.warn('applyBulkDiscount: Transaction rolled back', { error: error.message });
    } catch (rollbackError) {
      logger.error('applyBulkDiscount: Rollback failed', { error: rollbackError.message });
    }

    logger.error('Apply bulk discount error', {
      error: error.message,
      stack: error.stack,
    });

    if (respondWithDbError(res, error)) {
      return;
    }

    throw error;
  } finally {
    client.release();
    logger.debug('applyBulkDiscount: Client released');
  }
});

/**
 * Remove bulk discount from all products in a shop
 */
export const removeBulkDiscount = asyncHandler(async (req, res) => {
  const client = await getClient();

  try {
    const shopId = req.body.shopId || req.user?.shopId;

    requireShopId(shopId);

    const isAuthorized = await isAuthorizedToManageShop(shopId, req.user.id);
    if (!isAuthorized) {
      throw new UnauthorizedError(
        'You can only remove discounts from shops you own or manage as a worker'
      );
    }

    await client.query('BEGIN');
    logger.info('removeBulkDiscount: Transaction started', { shopId });

    const products = await productQueries.removeBulkDiscount(shopId, client);

    await client.query('COMMIT');
    logger.info('removeBulkDiscount: Transaction committed', {
      shopId,
      productsCount: products.length,
    });

    return res.status(200).json({
      success: true,
      data: {
        productsUpdated: products.length,
        products,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
      logger.warn('removeBulkDiscount: Transaction rolled back', { error: error.message });
    } catch (rollbackError) {
      logger.error('removeBulkDiscount: Rollback failed', { error: rollbackError.message });
    }

    logger.error('Remove bulk discount error', {
      error: error.message,
    });

    throw error;
  } finally {
    client.release();
    logger.debug('removeBulkDiscount: Client released');
  }
});
