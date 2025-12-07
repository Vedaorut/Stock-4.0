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
  const { name, stock, is_preorder, discount_percentage } = args;
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
      isPreorder: is_preorder || false,
      merge: true, // MERGE: Update existing product with same name instead of creating duplicate
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
  const wasMerged = apiResult.merged || false; // Backend returns merged: true if existing product was updated

  // Apply discount if requested during creation
  let discountApplied = false;
  let finalPrice = product.price;
  let originalPrice = null;

  if (discount_percentage && discount_percentage >= 1 && discount_percentage <= 99 && product.id) {
    try {
      const discountedPrice = product.price * (1 - discount_percentage / 100);
      const discountUpdateData = {
        discountPercentage: discount_percentage,
        originalPrice: product.price,
        price: discountedPrice,
        discountExpiresAt: null, // Permanent discount when creating product
      };

      const discountResult = await safeApiCall(
        productApi.updateProduct,
        product.id,
        discountUpdateData,
        token
      );

      if (discountResult.success) {
        discountApplied = true;
        originalPrice = product.price;
        finalPrice = discountedPrice;
        logger.info('Discount applied to newly created product', {
          productId: product.id,
          productName: transliteratedName,
          discount_percentage,
          originalPrice,
          finalPrice,
        });
      } else {
        logger.warn('Failed to apply discount to new product', {
          productId: product.id,
          productName: transliteratedName,
          error: discountResult.error,
        });
      }
    } catch (discountError) {
      logger.warn('Exception applying discount to new product:', {
        productId: product.id,
        error: discountError.message,
      });
    }
  }

  return {
    success: true,
    data: {
      action: wasMerged ? 'product_updated' : 'product_created',
      merged: wasMerged,
      product: {
        id: product.id,
        name: transliteratedName,
        originalName: translitInfo.changed ? name : null,
        price: finalPrice,
        original_price: discountApplied ? originalPrice : null,
        discount_percentage: discountApplied ? discount_percentage : null,
        stock_quantity: product.stock_quantity,
        transliterated: translitInfo.changed,
      },
    },
  };
}

/**
 * Process single product with timeout
 * @param {Object} product - Product data
 * @param {number} shopId - Shop ID
 * @param {string} token - Auth token
 * @param {number} timeout - Timeout in ms (default 10000)
 * @returns {Promise<Object>} Result with success/failure
 */
async function processProductWithTimeout(product, shopId, token, timeout = 10000) {
  const { name, price: rawPrice, stock, is_preorder, discount_percentage } = product;
  const normalizedStock = stock === undefined || stock === null ? 1 : stock;

  // Apply price fallback
  let price = rawPrice;
  if (!price || price <= 0) {
    logger.warn('bulkAddProducts: invalid price detected, applying fallback', {
      providedPrice: price,
      fallbackPrice: 0.01,
      productName: name,
      shopId,
    });
    price = 0.01;
  }

  // Validate individual product
  if (!name || name.length < 3) {
    return {
      success: false,
      name: name || 'unnamed',
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Name must be at least 3 characters',
        field: 'name',
      },
    };
  }

  if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
    return {
      success: false,
      name,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Stock quantity must be zero or a positive integer',
        field: 'stock',
        value: stock,
      },
    };
  }

  // Auto-transliterate
  const transliteratedName = autoTransliterateProductName(name);
  const translitInfo = getTransliterationInfo(name, transliteratedName);

  if (translitInfo.changed) {
    logger.info('product_name_transliterated', {
      original: name,
      transliterated: transliteratedName,
      shopId,
    });
  }

  // Create product with timeout
  const createPromise = safeApiCall(
    productApi.createProduct,
    {
      name: transliteratedName,
      price,
      currency: 'USD',
      shopId,
      stockQuantity: normalizedStock,
      isPreorder: is_preorder || false,
      merge: true,
    },
    token
  );

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Product creation timeout')), timeout)
  );

  let apiResult;
  try {
    apiResult = await Promise.race([createPromise, timeoutPromise]);
  } catch (err) {
    return {
      success: false,
      name,
      error: {
        code: 'TIMEOUT_ERROR',
        message: err.message,
      },
    };
  }

  if (!apiResult.success) {
    return {
      success: false,
      name,
      error: {
        code: 'API_ERROR',
        message: apiResult.error,
      },
    };
  }

  const createdProduct = apiResult.data;

  // Apply discount if requested
  let finalPrice = createdProduct.price;
  let originalPrice = null;
  let discountApplied = false;

  if (
    discount_percentage &&
    discount_percentage >= 1 &&
    discount_percentage <= 99 &&
    createdProduct.id
  ) {
    try {
      const discountedPrice = createdProduct.price * (1 - discount_percentage / 100);
      const discountResult = await safeApiCall(
        productApi.updateProduct,
        createdProduct.id,
        {
          discountPercentage: discount_percentage,
          originalPrice: createdProduct.price,
          price: discountedPrice,
          discountExpiresAt: null,
        },
        token
      );

      if (discountResult.success) {
        discountApplied = true;
        originalPrice = createdProduct.price;
        finalPrice = discountedPrice;
      }
    } catch (discountError) {
      logger.warn('Exception applying discount to bulk-created product:', {
        productId: createdProduct.id,
        error: discountError.message,
      });
    }
  }

  return {
    success: true,
    data: {
      name: transliteratedName,
      originalName: translitInfo.changed ? name : null,
      price: finalPrice,
      original_price: discountApplied ? originalPrice : null,
      discount_percentage: discountApplied ? discount_percentage : null,
      stock_quantity: createdProduct.stock_quantity,
      id: createdProduct.id,
      transliterated: translitInfo.changed,
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

  // Parallel processing with concurrency limit
  const CONCURRENCY_LIMIT = 3;
  const PRODUCT_TIMEOUT = 10000; // 10 seconds per product

  // Process in batches for controlled concurrency
  for (let i = 0; i < products.length; i += CONCURRENCY_LIMIT) {
    const batch = products.slice(i, i + CONCURRENCY_LIMIT);

    const batchResults = await Promise.allSettled(
      batch.map((product) => processProductWithTimeout(product, shopId, token, PRODUCT_TIMEOUT))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const productResult = result.value;
        if (productResult.success) {
          results.successful.push(productResult.data);
        } else {
          results.failed.push({
            name: productResult.name,
            error: productResult.error,
          });
        }
      } else {
        // Promise rejected (unexpected error)
        results.failed.push({
          name: 'unknown',
          error: {
            code: 'UNEXPECTED_ERROR',
            message: result.reason?.message || 'Unknown error',
          },
        });
      }
    }
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
