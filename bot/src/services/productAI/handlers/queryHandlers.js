/**
 * ProductAI Query Handlers
 *
 * Handles read-only product operations:
 * - handleListProducts - list all products
 * - handleSearchProduct - search products by query
 * - handleGetProductInfo - get single product info
 */

import logger from '../../../utils/logger.js';

/**
 * List products handler
 */
export async function handleListProducts(products) {
  return {
    success: true,
    data: {
      action: 'products_listed',
      totalCount: products.length,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        stock_quantity: p.stock_quantity || 0,
      })),
    },
  };
}

/**
 * Search product handler
 */
export async function handleSearchProduct(args, products) {
  const { query } = args;

  if (!query) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Search query is required',
          field: 'query',
        },
      },
    };
  }

  // Search (case-insensitive, partial match)
  const matches = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  if (matches.length === 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'NO_RESULTS',
          message: 'No products found',
          searchQuery: query,
          suggestion: 'Try a different search term',
        },
      },
    };
  }

  return {
    success: true,
    data: {
      action: 'products_found',
      searchQuery: query,
      totalFound: matches.length,
      products: matches.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        stock_quantity: p.stock_quantity || 0,
      })),
    },
  };
}

/**
 * Get product info handler
 */
export async function handleGetProductInfo(args, products, clarifiedProductId = null) {
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
      logger.info('get_product_info_clarified', {
        productId: clarifiedProductId,
        productName: product.name,
      });

      return {
        success: true,
        data: {
          action: 'product_info_retrieved',
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            stock_quantity: product.stock_quantity || 0,
          },
        },
      };
    }
  }

  // If no clarified product, search for product
  const matches = products.filter((p) => p.name.toLowerCase().includes(productName.toLowerCase()));

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
        operation: 'info',
      },
    };
  }

  product = matches[0];

  return {
    success: true,
    data: {
      action: 'product_info_retrieved',
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
        stock_quantity: product.stock_quantity || 0,
      },
    },
  };
}
