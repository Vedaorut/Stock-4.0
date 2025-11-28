/**
 * ProductAI Delete Handlers
 *
 * Handles product deletion operations:
 * - handleDeleteProduct - delete single product
 * - handleBulkDeleteAll - delete all products
 * - handleBulkDeleteByNames - delete products by names
 * - handleBulkDeleteExcept - delete all except specified products
 */

import logger from '../../../utils/logger.js';
import { productApi } from '../../../utils/api.js';
import { fuzzySearchProducts } from '../../../utils/fuzzyMatch.js';
import { safeApiCall } from '../../../utils/safeApiCall.js';

/**
 * Delete product handler
 */
export async function handleDeleteProduct(args, shopId, token, products, clarifiedProductId = null) {
  const { productName } = args;

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

  // If clarifiedProductId is provided, use it directly
  let product = null;
  if (clarifiedProductId) {
    product = products.find((p) => p.id === clarifiedProductId);
    if (product) {
      logger.info('delete_product_clarified', {
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
            suggestion: 'Try searching with a different name or check the product list',
          },
        },
      };
    }

    if (matches.length > 1) {
      // Multiple matches - need clarification
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
          operation: 'delete',
        },
      };
    }

    // Single match - use it
    product = matches[0];
  }

  const apiResult = await safeApiCall(productApi.deleteProduct, product.id, token);

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

  return {
    success: true,
    data: {
      action: 'product_deleted',
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
      },
    },
  };
}

/**
 * Bulk delete all products handler
 */
export async function handleBulkDeleteAll(args, shopId, token, ctx) {
  const { Markup } = await import('telegraf');

  // Logirovat' vyzov
  logger.info('bulkDeleteAll_called', {
    shopId,
    userId: ctx?.from?.id,
    args: JSON.stringify(args),
    confirm: args?.confirm,
    timestamp: new Date().toISOString(),
  });

  // Proverit' parametr confirm
  if (!args || !args.confirm || args.confirm !== true) {
    logger.info('bulkDeleteAll_needs_confirmation', { shopId, userId: ctx?.from?.id });

    return {
      success: false,
      needsConfirmation: true,
      message: 'Tochno udalit\' VSE tovary? Eto deystvie nel\'zya otmenit\'.',
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback('Da, udalit\' vsyo', 'confirm_bulk_delete_all')],
        [Markup.button.callback('Otmena', 'ai_cancel')],
      ]),
    };
  }

  // Logirovat' podtverzhdyonnoe udalenie
  logger.warn('bulkDeleteAll_confirmed', {
    shopId,
    userId: ctx?.from?.id,
    confirm: args.confirm,
  });

  const apiResult = await safeApiCall(productApi.bulkDeleteAll, shopId, token);

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

  logger.info('bulkDeleteAll_success', {
    shopId,
    deletedCount: result.deletedCount,
  });

  return {
    success: true,
    data: {
      action: 'bulk_delete_all',
      deletedCount: result.deletedCount,
    },
  };
}

/**
 * Bulk delete by names handler
 */
export async function handleBulkDeleteByNames(args, shopId, token, products) {
  const { productNames } = args;

  if (!productNames || !Array.isArray(productNames) || productNames.length === 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Product names array is required',
          field: 'productNames',
        },
      },
    };
  }

  // Find matching product IDs
  const productIds = [];
  const found = [];
  const notFound = [];

  for (const name of productNames) {
    const match = products.find((p) => p.name.toLowerCase().includes(name.toLowerCase()));

    if (match) {
      productIds.push(match.id);
      found.push(match.name);
    } else {
      notFound.push(name);
    }
  }

  if (productIds.length === 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'PRODUCTS_NOT_FOUND',
          message: 'None of the specified products were found',
          searchedNames: productNames,
          notFound,
        },
      },
    };
  }

  const apiResult = await safeApiCall(productApi.bulkDeleteByIds, shopId, productIds, token);

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
      action: 'bulk_delete_by_names',
      deletedCount: result.deletedCount,
      deletedProducts: found,
      notFound: notFound.length > 0 ? notFound : null,
    },
  };
}

/**
 * Bulk delete except handler - delete all products EXCEPT specified ones
 */
export async function handleBulkDeleteExcept(args, shopId, token, products) {
  const { excludedProducts } = args;

  if (!excludedProducts || !Array.isArray(excludedProducts) || excludedProducts.length === 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Excluded products array is required',
          field: 'excludedProducts',
        },
      },
    };
  }

  // Find products to KEEP (excluded from deletion)
  const keepProducts = [];
  const keepNames = [];
  const notFoundExclusions = [];

  for (const name of excludedProducts) {
    const matches = fuzzySearchProducts(name, products, 0.4);

    if (matches.length > 0) {
      const match = matches[0].product;
      keepProducts.push(match.id);
      keepNames.push(match.name);
    } else {
      notFoundExclusions.push(name);
    }
  }

  if (keepProducts.length === 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'PRODUCTS_NOT_FOUND',
          message: 'None of the excluded products were found. Cannot proceed with deletion.',
          searchedNames: excludedProducts,
          notFound: notFoundExclusions,
        },
      },
    };
  }

  // Find products to DELETE (all except kept ones)
  const deleteProductIds = products.filter((p) => !keepProducts.includes(p.id)).map((p) => p.id);

  if (deleteProductIds.length === 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'NO_PRODUCTS_TO_DELETE',
          message: 'All products are excluded from deletion',
          keptProducts: keepNames,
        },
      },
    };
  }

  const apiResult = await safeApiCall(productApi.bulkDeleteByIds, shopId, deleteProductIds, token);

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
      action: 'bulk_delete_except',
      deletedCount: result.deletedCount,
      keptProducts: keepNames,
      notFoundExclusions: notFoundExclusions.length > 0 ? notFoundExclusions : null,
    },
  };
}
