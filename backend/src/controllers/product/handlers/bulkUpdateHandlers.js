import { getClient } from '../../../config/database.js';
import { productQueries as _productQueries, shopQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import { broadcast } from '../../../utils/websocket.js';
import { isAuthorizedToManageShop } from '../utils/authorization.js';
import { validateBulkUpdates } from '../validators/payloadValidators.js';

/**
 * Bulk update specific products by IDs
 * Uses PostgreSQL transaction to ensure atomicity
 */
export const bulkUpdateProducts = asyncHandler(async (req, res) => {
  const client = await getClient();

  try {
    const { updates } = req.body;
    const userId = req.user.id;

    validateBulkUpdates(updates);

    const shops = await shopQueries.findByOwnerId(userId);
    if (!shops || shops.length === 0) {
      throw new NotFoundError('Shop');
    }
    const shopId = shops[0].id;

    await client.query('BEGIN');
    logger.info('bulkUpdateProducts: Transaction started', {
      userId,
      shopId,
      productsCount: updates.length,
    });

    const results = [];
    let successCount = 0;
    let failCount = 0;
    const updatedProducts = [];

    for (const item of updates) {
      try {
        const { productId, updates: productUpdates } = item;

        if (!productId) {
          const error = 'productId is required';
          logger.warn('bulkUpdateProducts: validation error', { productId: null, error });
          results.push({
            productId: null,
            success: false,
            error,
          });
          failCount++;
          throw new Error(error);
        }

        const productResult = await client.query(
          'SELECT id, shop_id FROM products WHERE id = $1 FOR UPDATE',
          [productId]
        );
        const product = productResult.rows[0];
        if (!product) {
          const error = `Product not found: ${productId}`;
          logger.warn('bulkUpdateProducts: product not found', { productId, userId });
          results.push({
            productId,
            success: false,
            error: 'Product not found',
          });
          failCount++;
          throw new Error(error);
        }

        const isAuthorized = await isAuthorizedToManageShop(product.shop_id, userId);
        if (!isAuthorized) {
          const error = `Access denied for product ${productId}`;
          logger.warn('bulkUpdateProducts: access denied', {
            productId,
            userId,
            shopId: product.shop_id,
          });
          results.push({
            productId,
            success: false,
            error: 'Access denied',
          });
          failCount++;
          throw new UnauthorizedError(error);
        }

        const {
          name,
          description,
          price,
          stockQuantity,
          isActive,
          discountPercentage,
          discountExpiresAt,
          originalPrice,
          isPreorder,
        } = productUpdates;

        const params = [
          productId,
          name ?? null,
          description ?? null,
          price ?? null,
          stockQuantity ?? null,
          isActive ?? null,
          discountPercentage ?? null,
          originalPrice ?? null,
          discountExpiresAt ?? null,
          isPreorder ?? null,
        ];

        const updateResult = await client.query(
          `UPDATE products
             SET name = COALESCE($2, name),
                 description = COALESCE($3, description),
                 price = COALESCE(
                   $4::NUMERIC,
                   CASE
                     WHEN $7::INTEGER = 0 AND original_price IS NOT NULL THEN original_price
                     ELSE price
                   END
                 ),
                 stock_quantity = COALESCE($5::INTEGER, stock_quantity),
                 is_active = COALESCE($6::BOOLEAN, is_active),
                 original_price = CASE
                   WHEN $7::INTEGER = 0 THEN NULL
                   WHEN $8::NUMERIC IS NOT NULL THEN $8
                   ELSE original_price
                 END,
                 discount_percentage = COALESCE($7::INTEGER, discount_percentage),
                 discount_expires_at = CASE
                   WHEN $7::INTEGER = 0 THEN NULL
                   WHEN $9::TIMESTAMP IS NOT NULL THEN $9
                   ELSE discount_expires_at
                 END,
                 is_preorder = COALESCE($10::BOOLEAN, is_preorder),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id, shop_id, name, description, price, currency, stock_quantity, original_price, discount_percentage, discount_expires_at, is_active, is_preorder, created_at, updated_at`,
          params
        );

        if (updateResult.rows.length === 0) {
          const error = `Failed to update product ${productId}`;
          logger.error('bulkUpdateProducts: update failed', { productId, params });
          throw new Error(error);
        }

        const updated = updateResult.rows[0];
        updatedProducts.push(updated);

        results.push({
          productId,
          success: true,
        });
        successCount++;

        logger.debug('bulkUpdateProducts: product updated', {
          productId,
          shopId: updated.shop_id,
        });
      } catch (error) {
        logger.error('bulkUpdateProducts: error for product', {
          productId: item.productId,
          error: error.message,
          stack: error.stack,
        });

        await client.query('ROLLBACK');
        logger.warn('bulkUpdateProducts: Transaction rolled back', {
          userId,
          shopId,
          failedProductId: item.productId,
          error: error.message,
        });

        return res.status(500).json({
          success: false,
          error: `Bulk update failed: ${error.message}`,
          details: {
            failedProductId: item.productId,
            processedCount: successCount + failCount,
          },
        });
      }
    }

    await client.query('COMMIT');
    logger.info('bulkUpdateProducts: Transaction committed', {
      userId,
      shopId,
      successCount,
      failCount,
    });

    updatedProducts.forEach((product) => {
      broadcast('product:updated', {
        shopId: product.shop_id,
        product,
      });
    });

    return res.status(200).json({
      success: true,
      data: {
        updated: successCount,
        failed: failCount,
        results,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
      logger.warn('bulkUpdateProducts: Transaction rolled back (outer catch)', {
        error: error.message,
      });
    } catch (rollbackError) {
      logger.error('bulkUpdateProducts: Rollback failed', { error: rollbackError.message });
    }

    logger.error('bulkUpdateProducts error', {
      error: error.message,
      stack: error.stack,
    });

    throw error;
  } finally {
    client.release();
    logger.debug('bulkUpdateProducts: Client released');
  }
});
