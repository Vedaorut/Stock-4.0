/**
 * ProductAI Discount Handlers
 *
 * Handles discount-related operations:
 * - handleApplyDiscount - apply discount to single product
 * - handleRemoveDiscount - remove discount from product
 * - handleBulkUpdatePrices - bulk discount/increase prices
 */

import logger from '../../../utils/logger.js';
import { productApi } from '../../../utils/api.js';
import { fuzzySearchProducts } from '../../../utils/fuzzyMatch.js';
import { safeApiCall } from '../../../utils/safeApiCall.js';
import { parseDurationToMs, formatDuration } from '../utils/index.js';

/**
 * Apply discount to a specific product handler
 */
export async function handleApplyDiscount(args, shopId, token, products) {
  const { productName, percentage, duration } = args;

  if (!productName || !percentage) {
    return { success: false, message: 'Не указано название товара или процент скидки' };
  }

  if (percentage < 1 || percentage > 99) {
    return { success: false, message: 'Скидка должна быть от 1% до 99%' };
  }

  try {
    // Найти товар через fuzzy search
    const fuzzyMatches = fuzzySearchProducts(productName, products, 0.6);
    const matches = fuzzyMatches.map((m) => m.product);

    if (matches.length === 0) {
      return {
        success: false,
        message: `Товар "${productName}" не найден. Доступные товары: ${products.map((p) => p.name).join(', ')}`,
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
          operation: 'apply_discount',
        },
      };
    }

    const product = matches[0];

    // Парсить duration в timestamp
    let expiresAt = null;
    if (duration) {
      const durationMs = parseDurationToMs(duration);
      if (durationMs) {
        expiresAt = new Date(Date.now() + durationMs).toISOString();
      }
    }

    // Применить скидку через API
    const originalPrice = product.price;
    const discountedPrice = originalPrice * (1 - percentage / 100);

    const updateData = {
      discountPercentage: percentage,
      originalPrice: originalPrice,
      price: discountedPrice,
      discountExpiresAt: expiresAt,
    };

    const apiResult = await safeApiCall(productApi.updateProduct, product.id, updateData, token);

    if (!apiResult.success) {
      return {
        success: false,
        message: apiResult.error,
        data: {
          error: {
            code: 'API_ERROR',
            message: apiResult.error,
          },
        },
      };
    }

    return {
      success: true,
      operation: 'applyDiscount',
      data: {
        action: 'product_updated',
        product: {
          id: product.id,
          name: product.name,
          price: discountedPrice,
          originalPrice,
          discount_percentage: percentage,
          discount_expires_at: expiresAt,
        },
        changes: {
          price: { old: originalPrice, new: discountedPrice },
          discount_percentage: { old: product.discount_percentage || 0, new: percentage },
        },
      },
    };
  } catch (error) {
    logger.error('Apply discount error:', error);
    return {
      success: false,
      message: error.message,
      data: {
        error: {
          code: 'HANDLER_ERROR',
          message: error.message,
        },
      },
    };
  }
}

/**
 * Remove discount from a product handler
 */
export async function handleRemoveDiscount(args, shopId, token, products) {
  const { productName } = args;

  if (!productName) {
    return { success: false, message: 'Не указано название товара' };
  }

  try {
    // Найти товар через fuzzy search
    const fuzzyMatches = fuzzySearchProducts(productName, products, 0.6);
    const matches = fuzzyMatches.map((m) => m.product);

    if (matches.length === 0) {
      return {
        success: false,
        message: `Товар "${productName}" не найден`,
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
          operation: 'remove_discount',
        },
      };
    }

    const product = matches[0];

    // Убрать скидку
    const updateData = {
      discountPercentage: 0,
      originalPrice: null,
      price: product.original_price || product.price,
      discountExpiresAt: null,
    };

    const originalPriceValue = product.original_price || product.price;

    const apiResult = await safeApiCall(productApi.updateProduct, product.id, updateData, token);

    if (!apiResult.success) {
      return {
        success: false,
        message: apiResult.error,
        data: {
          error: {
            code: 'API_ERROR',
            message: apiResult.error,
          },
        },
      };
    }

    return {
      success: true,
      operation: 'removeDiscount',
      data: {
        action: 'product_updated',
        product: {
          id: product.id,
          name: product.name,
          price: originalPriceValue,
          discount_percentage: 0,
        },
        changes: {
          price: { old: product.price, new: originalPriceValue },
          discount_percentage: { old: product.discount_percentage || 0, new: 0 },
        },
      },
    };
  } catch (error) {
    logger.error('Remove discount error:', error);
    return {
      success: false,
      message: error.message,
      data: {
        error: {
          code: 'HANDLER_ERROR',
          message: error.message,
        },
      },
    };
  }
}

/**
 * Bulk update prices handler (discount/increase all products)
 */
export async function handleBulkUpdatePrices(args, shopId, token, products) {
  const {
    percentage,
    operation,
    duration,
    excludedProducts = [],
    discount_type: explicitDiscountType,
  } = args;

  logger.info('handleBulkUpdatePrices called', {
    percentage,
    operation,
    duration,
    excludedProducts,
    totalProducts: products.length,
  });

  if (!percentage || percentage < 0.1 || percentage > 100) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Percentage must be between 0.1 and 100',
          field: 'percentage',
          value: percentage,
          constraint: 'min: 0.1, max: 100',
        },
      },
    };
  }

  if (!operation || !['increase', 'decrease'].includes(operation)) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid operation',
          field: 'operation',
          value: operation,
          allowed: ['increase', 'decrease'],
        },
      },
    };
  }

  if (!products || products.length === 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'NO_PRODUCTS',
          message: 'No products available to update prices',
        },
      },
    };
  }

  let excludedProductIds = [];
  if (excludedProducts && excludedProducts.length > 0) {
    for (const excludedName of excludedProducts) {
      const matches = fuzzySearchProducts(excludedName, products, 0.4);

      if (matches.length > 0) {
        excludedProductIds.push(...matches.map((m) => m.product.id));

        logger.info('Excluded product matched', {
          query: excludedName,
          matches: matches.map((m) => ({ id: m.product.id, name: m.product.name, score: m.score })),
        });
      } else {
        logger.warn('Excluded product not found for discount', { query: excludedName });
      }
    }

    excludedProductIds = [...new Set(excludedProductIds)];
  }

  let durationMs = null;
  if (duration) {
    durationMs = parseDurationToMs(duration);
    if (!durationMs) {
      return {
        success: false,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid duration format',
            field: 'duration',
            value: duration,
            hint: 'Use format like "6 hours" or "3 days"',
          },
        },
      };
    }
  }

  let discountType = explicitDiscountType ? String(explicitDiscountType).toLowerCase() : null;
  if (discountType && !['permanent', 'timer'].includes(discountType)) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          field: 'discount_type',
          message: 'discount_type must be "permanent" or "timer"',
        },
      },
    };
  }

  if (operation === 'increase') {
    discountType = 'permanent';
    durationMs = null;
  } else {
    if (!discountType) {
      discountType = durationMs ? 'timer' : 'permanent';
    }

    if (discountType === 'timer' && !durationMs) {
      return {
        success: false,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            field: 'duration',
            message: 'Provide duration for timer discount',
          },
        },
      };
    }

    if (discountType === 'permanent') {
      durationMs = null;
    }
  }

  const multiplier = operation === 'decrease' ? 1 - percentage / 100 : 1 + percentage / 100;

  const operationSymbol = operation === 'decrease' ? '-' : '+';
  const operationText = operation === 'decrease' ? 'Скидка' : 'Наценка';

  const productsToUpdate = products.filter((p) => !excludedProductIds.includes(p.id));
  if (productsToUpdate.length === 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'NO_PRODUCTS_TO_UPDATE',
          message: 'No products left to apply discount after exclusions',
        },
      },
    };
  }

  const previewProducts = productsToUpdate.slice(0, 3).map((p) => {
    const newPrice = Math.round(Number(p.price) * multiplier * 100) / 100;
    return {
      id: p.id,
      name: p.name,
      oldPrice: Number(p.price),
      newPrice,
    };
  });

  const durationText = durationMs ? formatDuration(durationMs) : null;

  const apiResult = await safeApiCall(productApi.applyBulkDiscount, shopId, token, {
    percentage,
    type: discountType,
    duration: durationMs,
    excludedProductIds,
  });

  if (!apiResult.success) {
    return {
      success: false,
      message: apiResult.error,
      data: {
        error: {
          code: 'API_ERROR',
          message: apiResult.error,
        },
      },
    };
  }

  const result = apiResult.data;

  return {
    success: true,
    data: {
      action: 'bulk_update_prices',
      percentage,
      operation,
      operationText,
      operationSymbol,
      discountType,
      durationMs,
      durationText,
      excludedProductIds,
      previewProducts,
      updatedCount: result?.productsUpdated ?? productsToUpdate.length,
      products: result?.updatedProducts || result?.products || [],
    },
  };
}
