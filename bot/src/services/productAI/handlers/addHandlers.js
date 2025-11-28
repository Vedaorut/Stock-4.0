/**
 * ProductAI Add Handlers
 *
 * Handles product creation operations:
 * - handleAddProduct - add single product
 * - handleBulkAddProducts - add multiple products at once
 */

import logger from '../../../utils/logger.js';
import { productApi } from '../../../utils/api.js';
import { autoTransliterateProductName, getTransliterationInfo } from '../../../utils/transliterate.js';
import { safeApiCall } from '../../../utils/safeApiCall.js';

/**
 * Add product handler
 */
export async function handleAddProduct(args, shopId, token) {
  const { name, stock } = args;
  let { price } = args;

  // Validate
  if (!name || name.length < 3) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Product name must be at least 3 characters',
          field: 'name',
          value: name,
          constraint: 'minLength: 3',
        },
      },
    };
  }

  // KRITICHNO: Zashchita ot price=0 (Bug #2 fix)
  // AI ne dolzhen vyzyvat' funktsiyu s price=0, no esli eto sluchilos' - prinuditel'no ustanavlivaem minimum
  if (!price || price <= 0) {
    logger.warn('addProduct called with invalid price, applying fallback', {
      providedPrice: price,
      fallbackPrice: 0.01,
      productName: name,
      shopId,
    });

    // Vmesto vozvrata oshibki - ustanavlivaem minimal'nuyu tsenu i prodolzhaem
    // Eto predotvrashchaet constraint violations v BD
    price = 0.01;
  }

  const normalizedStock = stock === undefined || stock === null ? 1 : stock;

  if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Stock quantity must be zero or a positive integer',
          field: 'stock',
          value: stock,
          hint: 'Naprimer: 1, 5, 10',
        },
      },
    };
  }

  // Auto-transliterate Russian names to English
  const transliteratedName = autoTransliterateProductName(name);
  const translitInfo = getTransliterationInfo(name, transliteratedName);

  // Log transliteration if occurred
  if (translitInfo.changed) {
    logger.info('product_name_transliterated', {
      original: name,
      transliterated: transliteratedName,
      shopId,
    });
  }

  const apiResult = await safeApiCall(
    productApi.createProduct,
    {
      name: transliteratedName, // Use transliterated name
      price,
      currency: 'USD',
      shopId,
      stockQuantity: normalizedStock,
    },
    token
  );

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

  const product = apiResult.data;

  return {
    success: true,
    data: {
      action: 'product_created',
      product: {
        id: product.id,
        name: transliteratedName,
        originalName: translitInfo.changed ? name : null,
        price: product.price,
        stock_quantity: product.stock_quantity,
        transliterated: translitInfo.changed,
      },
    },
  };
}

/**
 * Bulk add products handler
 */
export async function handleBulkAddProducts(args, shopId, token) {
  const { products } = args;

  // Validate
  if (!products || !Array.isArray(products)) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Products array is required',
          field: 'products',
        },
      },
    };
  }

  if (products.length < 2) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Bulk add requires at least 2 products',
          field: 'products',
          count: products.length,
        },
      },
    };
  }

  const results = {
    successful: [],
    failed: [],
  };

  // Process each product
  for (const product of products) {
    const { name, price, stock } = product;
    const normalizedStock = stock === undefined || stock === null ? 1 : stock;

    // Validate individual product
    if (!name || name.length < 3) {
      results.failed.push({
        name: name || 'unnamed',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name must be at least 3 characters',
          field: 'name',
        },
      });
      continue;
    }

    // KRITICHNO: Zashchita ot price=0 (Bug #2 fix)
    if (!price || price <= 0) {
      logger.warn('bulkAddProducts: invalid price detected, applying fallback', {
        providedPrice: price,
        fallbackPrice: 0.01,
        productName: name,
        shopId,
      });

      // Ustanavlivaem minimal'nuyu tsenu vmesto otkaza
      product.price = 0.01;
    }

    if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
      results.failed.push({
        name,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Stock quantity must be zero or a positive integer',
          field: 'stock',
          value: stock,
        },
      });
      continue;
    }

    // Auto-transliterate
    const transliteratedName = autoTransliterateProductName(name);
    const translitInfo = getTransliterationInfo(name, transliteratedName);

    // Log transliteration if occurred
    if (translitInfo.changed) {
      logger.info('product_name_transliterated', {
        original: name,
        transliterated: transliteratedName,
        shopId,
      });
    }

    const apiResult = await safeApiCall(
      productApi.createProduct,
      {
        name: transliteratedName,
        price,
        currency: 'USD',
        shopId,
        stockQuantity: normalizedStock,
      },
      token
    );

    if (!apiResult.success) {
      results.failed.push({
        name,
        error: {
          code: 'API_ERROR',
          message: apiResult.error,
        },
      });
      continue;
    }

    const createdProduct = apiResult.data;

    results.successful.push({
      name: transliteratedName,
      originalName: translitInfo.changed ? name : null,
      price: createdProduct.price,
      stock_quantity: createdProduct.stock_quantity,
      id: createdProduct.id,
      transliterated: translitInfo.changed,
    });
  }

  // Build result
  const successCount = results.successful.length;
  const failCount = results.failed.length;

  if (successCount === 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'BULK_ADD_FAILED',
          message: 'Failed to add any products',
          totalAttempted: products.length,
          failures: results.failed,
        },
      },
    };
  }

  return {
    success: true,
    data: {
      action: 'bulk_products_added',
      totalAttempted: products.length,
      successCount,
      failCount,
      successful: results.successful,
      failed: failCount > 0 ? results.failed : null,
    },
  };
}
