import { shopFollowQueries } from '../../../models/shopFollowQueries.js';
import { workerQueries, productQueries } from '../../../database/queries/index.js';
import { syncedProductQueries } from '../../../models/syncedProductQueries.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../utils/errors.js';
import { syncAllProductsForFollow, updateMarkupForFollow, calculatePriceWithMarkup } from '../../../services/productSyncService.js';
import logger from '../../../utils/logger.js';
import { formatFollowResponse } from '../helpers.js';

/**
 * Update follow markup
 * PUT /follows/:id/markup
 */
export const updateFollowMarkup = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const markupPercentageRaw = req.body.markupPercentage ?? req.body.markup_percentage;
    const markupFixedRaw = req.body.markupFixed ?? req.body.markup_fixed;
    const markupTypeRaw = req.body.markupType ?? req.body.markup_type;

    const followId = Number.parseInt(id, 10);
    const markupType = markupTypeRaw === 'fixed' ? 'fixed' : 'percentage';
    const markupPercentage = Number(markupPercentageRaw);
    const markupFixed = Number(markupFixedRaw) || 0;

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Invalid follow ID');
    }

    if (markupType === 'percentage') {
      if (!Number.isFinite(markupPercentage) || markupPercentage < 0.1 || markupPercentage > 500) {
        throw new ValidationError('Markup must be between 0.1% and 500%');
      }
    } else if (markupType === 'fixed') {
      if (!Number.isFinite(markupFixed) || markupFixed < 0) {
        throw new ValidationError('Fixed markup must be a non-negative number');
      }
      if (markupFixed > 1000) {
        throw new ValidationError('Fixed markup cannot exceed $1000');
      }
    }

    const existingFollow = await shopFollowQueries.findById(followId);
    if (!existingFollow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(existingFollow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    if (existingFollow.mode !== 'resell') {
      throw new ValidationError('Markup can only be updated in resell mode');
    }

    await shopFollowQueries.updateMarkup(followId, markupPercentage, markupType, markupFixed);

    const markupValue = markupType === 'fixed' ? markupFixed : markupPercentage;
    await updateMarkupForFollow(followId, markupType, markupValue);

    const updatedFollow = await shopFollowQueries.findById(followId);
    res.json({ success: true, data: formatFollowResponse(updatedFollow) });
  } catch (error) {
    logger.error('Error updating follow markup', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
    });
    throw error;
  }
});

/**
 * Switch follow mode (monitor ↔ resell)
 * PUT /follows/:id/mode
 */
export const switchFollowMode = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { markupPercentage, markupType, markupFixed } = req.body;
    const modeRaw = typeof req.body.mode === 'string' ? req.body.mode.trim().toLowerCase() : '';

    const followId = Number.parseInt(id, 10);
    const normalizedMode = modeRaw === 'showcase' ? 'monitor' : modeRaw;
    const markupValue = markupPercentage !== undefined ? Number(markupPercentage) : undefined;

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Invalid follow ID');
    }

    if (!['monitor', 'resell'].includes(normalizedMode)) {
      throw new ValidationError('Invalid mode');
    }

    const existingFollow = await shopFollowQueries.findById(followId);
    if (!existingFollow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(existingFollow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    if (normalizedMode === 'resell') {
      if (!Number.isFinite(markupValue) || markupValue < 0.1 || markupValue > 500) {
        throw new ValidationError('Markup must be between 0.1% and 500% for resell mode');
      }
    }

    // Check if already in same mode (skip for resell - may need to re-sync if products missing)
    if (existingFollow.mode === normalizedMode && normalizedMode !== 'resell') {
      return res.json({ success: true, data: formatFollowResponse(existingFollow) });
    }

    // For resell mode: check if we need to sync (products may be missing from failed previous attempt)
    const needsSync = normalizedMode === 'resell' &&
      (existingFollow.mode !== 'resell' || existingFollow.synced_products_count === 0);

    await shopFollowQueries.updateMode(followId, normalizedMode);

    if (normalizedMode === 'resell') {
      // Preserve existing markup type/fixed if not provided in request
      const type = markupType || existingFollow.markup_type || 'percentage';
      const fixed = markupFixed ?? existingFollow.markup_fixed ?? 0;
      await shopFollowQueries.updateMarkup(followId, markupValue, type, fixed);

      // Only sync if switching to resell OR if products are missing
      if (needsSync) {
        await syncAllProductsForFollow(followId);
      }
    } else {
      await shopFollowQueries.updateMarkup(followId, 0, 'percentage', 0);

      const synced = await syncedProductQueries.findByFollowId(followId);
      if (synced.length > 0) {
        const syncedProductIds = synced.map((row) => row.synced_product_id);
        await productQueries.bulkDeleteByIds(syncedProductIds, existingFollow.follower_shop_id);
        await syncedProductQueries.deleteByFollowId(followId);
      }
    }

    const updatedFollow = await shopFollowQueries.findById(followId);
    res.json({ success: true, data: formatFollowResponse(updatedFollow) });
  } catch (error) {
    logger.error('Error switching follow mode', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
    });
    throw error;
  }
});

/**
 * Update product-level markup
 * PUT /follows/:id/products/:productId/markup
 */
export const updateProductMarkup = asyncHandler(async (req, res) => {
  try {
    const { id, productId } = req.params;
    const markupTypeRaw = req.body.markupType ?? req.body.markup_type;
    const markupPercentageRaw = req.body.markupPercentage ?? req.body.markup_percentage;
    const markupFixedRaw = req.body.markupFixed ?? req.body.markup_fixed;

    const followId = Number.parseInt(id, 10);
    const syncedProductId = Number.parseInt(productId, 10);
    const markupType = markupTypeRaw === 'fixed' ? 'fixed' : 'percentage';
    const markupPercentage = Number(markupPercentageRaw) || 0;
    const markupFixed = Number(markupFixedRaw) || 0;

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Invalid follow ID');
    }

    if (!Number.isInteger(syncedProductId) || syncedProductId <= 0) {
      throw new ValidationError('Invalid product ID');
    }

    if (markupType === 'percentage') {
      if (markupPercentage < 0 || markupPercentage > 500) {
        throw new ValidationError('Markup percentage must be between 0% and 500%');
      }
    } else if (markupType === 'fixed') {
      if (markupFixed < 0 || markupFixed > 10000) {
        throw new ValidationError('Fixed markup must be between $0 and $10000');
      }
    }

    const follow = await shopFollowQueries.findById(followId);
    if (!follow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(follow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    if (follow.mode !== 'resell') {
      throw new ValidationError('Product markup can only be set in resell mode');
    }

    const syncedProduct = await syncedProductQueries.findByFollowAndSyncedProduct(followId, syncedProductId);
    if (!syncedProduct) {
      throw new NotFoundError('Synced product');
    }

    const updated = await syncedProductQueries.updateCustomMarkup(
      syncedProduct.id,
      markupType,
      markupType === 'percentage' ? markupPercentage : null,
      markupType === 'fixed' ? markupFixed : null
    );

    const sourceProduct = await productQueries.findById(syncedProduct.source_product_id);
    const sourcePrice = Number(sourceProduct.price);
    const markupValue = markupType === 'fixed' ? markupFixed : markupPercentage;
    const newPrice = calculatePriceWithMarkup(sourcePrice, markupType, markupValue);
    await productQueries.update(syncedProductId, { price: newPrice });

    logger.info('Product markup updated', {
      followId,
      syncedProductId,
      markupType,
      markupPercentage,
      markupFixed,
      sourcePrice,
      newPrice,
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        synced_product_id: updated.synced_product_id,
        custom_markup: {
          type: markupType,
          percentage: markupPercentage,
          fixed: markupFixed,
        },
      },
    });
  } catch (error) {
    logger.error('Error updating product markup', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
    });
    throw error;
  }
});

/**
 * Reset product-level markup to global follow markup
 * DELETE /follows/:id/products/:productId/markup
 */
export const resetProductMarkup = asyncHandler(async (req, res) => {
  try {
    const { id, productId } = req.params;

    const followId = Number.parseInt(id, 10);
    const syncedProductId = Number.parseInt(productId, 10);

    if (!Number.isInteger(followId) || followId <= 0) {
      throw new ValidationError('Invalid follow ID');
    }

    if (!Number.isInteger(syncedProductId) || syncedProductId <= 0) {
      throw new ValidationError('Invalid product ID');
    }

    const follow = await shopFollowQueries.findById(followId);
    if (!follow) {
      throw new NotFoundError('Follow');
    }

    const access = await workerQueries.checkAccess(follow.follower_shop_id, req.user.id);
    if (!access.hasAccess) {
      throw new UnauthorizedError('You do not have access to this follow');
    }

    const syncedProduct = await syncedProductQueries.findByFollowAndSyncedProduct(followId, syncedProductId);
    if (!syncedProduct) {
      throw new NotFoundError('Synced product');
    }

    const updated = await syncedProductQueries.resetCustomMarkup(syncedProduct.id);

    const sourceProduct = await productQueries.findById(syncedProduct.source_product_id);
    const sourcePrice = Number(sourceProduct.price);
    const globalMarkupType = follow.markup_type || 'percentage';
    const globalMarkupValue = globalMarkupType === 'fixed'
      ? Number(follow.markup_fixed || 0)
      : Number(follow.markup_percentage || 0);
    const newPrice = calculatePriceWithMarkup(sourcePrice, globalMarkupType, globalMarkupValue);
    await productQueries.update(syncedProductId, { price: newPrice });

    logger.info('Product markup reset to global', {
      followId,
      syncedProductId,
      globalMarkupType,
      globalMarkupValue,
      sourcePrice,
      newPrice,
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        synced_product_id: updated.synced_product_id,
        custom_markup: null,
        message: 'Product markup reset to global follow markup',
      },
    });
  } catch (error) {
    logger.error('Error resetting product markup', {
      error: error.message,
      stack: error.stack,
      params: req.params,
    });
    throw error;
  }
});
