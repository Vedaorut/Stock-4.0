/**
 * ProductAI Sale Handlers
 *
 * Handles sale-related operations:
 * - handleRecordSale - decrease stock for a sale
 */

import logger from '../../../utils/logger.js';
import { productApi } from '../../../utils/api.js';
import { fuzzySearchProducts } from '../../../utils/fuzzyMatch.js';
import { safeApiCall } from '../../../utils/safeApiCall.js';

/**
 * Record sale handler (decrease stock)
 */
export async function handleRecordSale(args, shopId, token, products, clarifiedProductId = null) {
  const { productName, quantity = 1 } = args; // Default quantity to 1 if not specified

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

  if (quantity <= 0) {
    return {
      success: false,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Quantity must be greater than 0',
          field: 'quantity',
          value: quantity,
        },
      },
    };
  }

  // If clarifiedProductId is provided, use it directly
  let product = null;
  if (clarifiedProductId) {
    product = products.find((p) => p.id === clarifiedProductId);
    if (product) {
      logger.info('record_sale_clarified', {
        shopId,
        productId: clarifiedProductId,
        productName: product.name,
        quantity,
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
          operation: 'record_sale',
        },
      };
    }

    product = matches[0];
  }

  const currentStock = product.stock_quantity || 0;

  // Check if enough stock
  if (currentStock < quantity) {
    return {
      success: false,
      data: {
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: 'Not enough stock available',
          productName: product.name,
          requested: quantity,
          available: currentStock,
          shortage: quantity - currentStock,
        },
      },
    };
  }

  const newStock = currentStock - quantity;

  const apiResult = await safeApiCall(
    productApi.updateProduct,
    product.id,
    {
      stockQuantity: newStock,
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
          productName: product.name,
        },
      },
    };
  }

  return {
    success: true,
    data: {
      action: 'sale_recorded',
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
      },
      sale: {
        quantity,
        previousStock: currentStock,
        newStock,
      },
    },
  };
}
