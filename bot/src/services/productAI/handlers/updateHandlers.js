/**
 * ProductAI Update Handlers
 *
 * Handles product update operations:
 * - handleUpdateProduct - update single product (price, stock, discount, name)
 * - handleBulkUpdateProducts - update multiple products
 *
 * CRITICAL: handleUpdateProduct contains complex discount logic.
 * Do NOT modify without thorough testing!
 */

import logger from '../../../utils/logger.js';
import { productApi } from '../../../utils/api.js';
import { fuzzySearchProducts } from '../../../utils/fuzzyMatch.js';
import { safeApiCall } from '../../../utils/safeApiCall.js';
import { parseDurationToMs } from '../utils/index.js';

/**
 * Update product handler
 *
 * Supports updating:
 * - name
 * - price
 * - stock_quantity
 * - discount_percentage
 * - discount_expires_at
 *
 * Complex discount logic handles:
 * - Applying new discount
 * - Removing discount (discount_percentage = 0)
 * - Simultaneous price + discount update
 * - Timer vs permanent discounts
 */
export async function handleUpdateProduct(args, shopId, token, products, clarifiedProductId = null) {
  const { productName, updates } = args;

  if (!productName) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Product name is required',
          field: 'productName',
        },
      },
    };
  }

  if (!updates || typeof updates !== 'object') {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Updates object is required',
          field: 'updates',
          hint: 'Specify price, name, or stock_quantity to update',
        },
      },
    };
  }

  // Check if at least one update field is provided
  const {
    name: newName,
    price: newPrice,
    stock_quantity: newStock,
    discount_percentage: rawDiscountPercentage,
    discount_expires_at: rawDiscountExpiresAt,
  } = updates;

  if (
    !newName &&
    newPrice === undefined &&
    newStock === undefined &&
    rawDiscountPercentage === undefined &&
    rawDiscountExpiresAt === undefined
  ) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No fields to update',
          hint: 'Specify at least one field: name, price, stock_quantity, discount_percentage or discount_expires_at',
        },
      },
    };
  }

  // If clarifiedProductId is provided, use it directly (skip fuzzy search)
  let product = null;
  if (clarifiedProductId) {
    product = products.find((p) => p.id === clarifiedProductId);
    if (product) {
      logger.info('update_product_clarified', {
        shopId,
        productId: clarifiedProductId,
        productName: product.name,
      });
    }
  }

  // If no clarified product, use fuzzy search
  if (!product) {
    // Use fuzzy search for better matching
    const fuzzyMatches = fuzzySearchProducts(productName, products, 0.6);
    const matches = fuzzyMatches.map((m) => m.product);

    if (matches.length === 0) {
      return {
        success: false,
        data: {
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'Product not found',
            searchQuery: productName,
          },
        },
      };
    }

    if (matches.length > 1) {
      return {
        success: false,
        needsClarification: true,
        data: {
          action: 'multiple_matches_found',
          searchQuery: productName,
          matches: matches.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
          })),
          operation: 'update',
        },
      };
    }

    product = matches[0];
  }

  // Build update payload
  const updateData = {};
  const changes = {};

  if (newName) {
    updateData.name = newName;
    changes.name = { old: product.name, new: newName };
  }

  if (newStock !== undefined && Number.isFinite(newStock) && newStock >= 0) {
    updateData.stockQuantity = newStock;
    changes.stock_quantity = { old: product.stock_quantity, new: newStock };
  }

  const currentPrice = Number(product.price);
  const existingOriginalPrice = product.original_price ? Number(product.original_price) : null;
  const basePriceWithoutOverride =
    existingOriginalPrice && existingOriginalPrice > 0 ? existingOriginalPrice : currentPrice;

  let priceAssigned = false;

  let discountPercentage;
  if (rawDiscountPercentage !== undefined) {
    discountPercentage = Number(rawDiscountPercentage);
    if (
      !Number.isFinite(discountPercentage) ||
      discountPercentage < 0 ||
      discountPercentage > 100
    ) {
      return {
        success: false,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            field: 'discount_percentage',
            message: 'Discount percentage must be between 0 and 100',
            value: rawDiscountPercentage,
          },
        },
      };
    }
  }

  let discountExpiresAtISO = null;
  if (
    rawDiscountExpiresAt !== undefined &&
    rawDiscountExpiresAt !== null &&
    rawDiscountExpiresAt !== ''
  ) {
    const expiresInput = String(rawDiscountExpiresAt).trim();
    const durationMs = parseDurationToMs(expiresInput);

    if (durationMs) {
      discountExpiresAtISO = new Date(Date.now() + durationMs).toISOString();
    } else {
      const parsedDate = new Date(expiresInput);
      if (Number.isNaN(parsedDate.getTime())) {
        return {
          success: false,
          data: {
            error: {
              code: 'VALIDATION_ERROR',
              field: 'discount_expires_at',
              message: 'Invalid discount expiration format',
              value: rawDiscountExpiresAt,
              hint: 'Use ISO datetime or duration like "6 chasov"',
            },
          },
        };
      }
      discountExpiresAtISO = parsedDate.toISOString();
    }
  }

  if (discountPercentage === undefined && rawDiscountExpiresAt !== undefined) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          field: 'discount_expires_at',
          message: 'Provide discount_percentage together with discount_expires_at',
        },
      },
    };
  }

  // KRITICHNO: Handle simultaneous price + discount update
  // When both price and discount are provided, use price as base and apply discount
  if (
    newPrice !== undefined &&
    Number.isFinite(newPrice) &&
    newPrice > 0 &&
    discountPercentage !== undefined &&
    discountPercentage > 0
  ) {
    // Calculate discounted price from new base price
    const basePrice = newPrice;
    const discountedPrice = Math.round(basePrice * (1 - discountPercentage / 100) * 100) / 100;

    updateData.price = discountedPrice;
    updateData.originalPrice = basePrice;
    updateData.discountPercentage = discountPercentage;

    if (discountExpiresAtISO) {
      updateData.discountExpiresAt = discountExpiresAtISO;
    }

    priceAssigned = true;

    logger.info(
      `Applying price=${basePrice} with discount=${discountPercentage}% -> final price=${discountedPrice}`
    );

    changes.price = { old: currentPrice, new: discountedPrice };
    changes.discount_percentage = { old: product.discount_percentage, new: discountPercentage };
    if (discountExpiresAtISO !== null || rawDiscountExpiresAt !== undefined) {
      changes.discount_expires_at = { old: product.discount_expires_at, new: discountExpiresAtISO };
    }
  } else if (discountPercentage !== undefined) {
    if (discountPercentage === 0) {
      const restoredPrice =
        newPrice !== undefined
          ? newPrice
          : existingOriginalPrice !== null
            ? existingOriginalPrice
            : currentPrice;

      updateData.discountPercentage = 0;
      updateData.discountExpiresAt = null;
      updateData.originalPrice = null;

      if (restoredPrice !== undefined && Number.isFinite(restoredPrice)) {
        updateData.price = restoredPrice;
        priceAssigned = true;

        if (restoredPrice !== currentPrice) {
          changes.price = { old: currentPrice, new: restoredPrice };
        }
      }

      changes.discount_percentage = { old: product.discount_percentage, new: 0 };
      if (product.discount_expires_at || rawDiscountExpiresAt !== undefined) {
        changes.discount_expires_at = { old: product.discount_expires_at, new: null };
      }
    } else {
      const basePrice = newPrice !== undefined ? newPrice : basePriceWithoutOverride;

      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        return {
          success: false,
          data: {
            error: {
              code: 'VALIDATION_ERROR',
              field: 'price',
              message: 'Base price is required to apply discount',
              hint: 'Specify price or make sure product has original price',
            },
          },
        };
      }

      const discountedPrice = Math.round(basePrice * (1 - discountPercentage / 100) * 100) / 100;

      updateData.price = discountedPrice;
      updateData.originalPrice = basePrice;
      updateData.discountPercentage = discountPercentage;
      updateData.discountExpiresAt = discountExpiresAtISO;
      priceAssigned = true;

      changes.discount_percentage = { old: product.discount_percentage, new: discountPercentage };
      if (discountExpiresAtISO !== null || rawDiscountExpiresAt !== undefined) {
        changes.discount_expires_at = {
          old: product.discount_expires_at,
          new: discountExpiresAtISO,
        };
      }
      if (discountedPrice !== currentPrice) {
        changes.price = { old: currentPrice, new: discountedPrice };
      }
    }
  }

  if (!priceAssigned && newPrice !== undefined && Number.isFinite(newPrice) && newPrice > 0) {
    updateData.price = newPrice;
    changes.price = { old: currentPrice, new: newPrice };

    if (product.discount_percentage > 0 && discountPercentage === undefined) {
      updateData.discountPercentage = 0;
      updateData.discountExpiresAt = null;
      updateData.originalPrice = null;

      if (!changes.discount_percentage) {
        changes.discount_percentage = { old: product.discount_percentage, new: 0 };
      }
      if (product.discount_expires_at && !changes.discount_expires_at) {
        changes.discount_expires_at = { old: product.discount_expires_at, new: null };
      }
    }
  }

  const apiResult = await safeApiCall(productApi.updateProduct, product.id, updateData, token);

  if (!apiResult.success) {
    return {
      success: false,
      message: apiResult.error,
      data: {
        error: {
          code: 'API_ERROR',
          message: apiResult.error,
          productName: product.name,
        },
      },
    };
  }

  const updated = apiResult.data;

  return {
    success: true,
    data: {
      action: 'product_updated',
      product: {
        id: updated.id,
        name: updated.name,
        price: updated.price,
        stock_quantity: updated.stock_quantity,
        discount_percentage: updated.discount_percentage,
        discount_expires_at: updated.discount_expires_at,
        original_price: updated.original_price,
      },
      changes,
    },
  };
}

/**
 * Handler: bulkUpdateProducts - update multiple specific products
 */
export async function handleBulkUpdateProducts(args, shopId, token, products) {
  if (!args.products || !Array.isArray(args.products) || args.products.length === 0) {
    return {
      success: false,
      error: 'Ne ukazany tovary dlya obnovleniya',
    };
  }

  const results = [];
  const errors = [];

  // Process each product sequentially
  for (const item of args.products) {
    try {
      const result = await handleUpdateProduct(
        {
          productName: item.productName,
          updates: item.updates,
        },
        shopId,
        token,
        products
      );

      if (result.success) {
        results.push({
          productName: item.productName,
          success: true,
          data: result.data,
        });
      } else {
        errors.push({
          productName: item.productName,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error(`bulkUpdateProducts: oshibka dlya ${item.productName}:`, error);
      errors.push({
        productName: item.productName,
        error: error.message,
      });
    }
  }

  // Return result
  if (results.length === 0) {
    return {
      success: false,
      error: 'Ne udalos\' obnovit\' ni odin tovar',
      details: errors,
    };
  }

  return {
    success: true,
    data: {
      updated: results.length,
      failed: errors.length,
      results: results,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}
