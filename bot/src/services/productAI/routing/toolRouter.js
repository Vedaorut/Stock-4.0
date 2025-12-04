/**
 * Tool Router - Routes AI tool calls to appropriate handlers
 */

import logger from '../../../utils/logger.js';

// Import all handlers
import {
  handleAddProduct,
  handleBulkAddProducts,
  handleDeleteProduct,
  handleBulkDeleteAll,
  handleBulkDeleteByNames,
  handleBulkDeleteExcept,
  handleListProducts,
  handleSearchProduct,
  handleGetProductInfo,
  handleUpdateProduct,
  handleBulkUpdateProducts,
  handleRecordSale,
  handleApplyDiscount,
  handleRemoveDiscount,
  handleBulkUpdatePrices,
  handleShowCapabilities,
} from '../handlers/index.js';

/**
 * Execute tool call from AI
 *
 * @param {string} functionName - Function to execute
 * @param {Object} args - Function arguments
 * @param {Object} context - Context with shopId, token, products
 * @returns {Object} Result object
 */
export async function executeToolCall(functionName, args, context) {
  const { shopId, token, products, ctx, clarifiedProductId } = context;

  try {
    switch (functionName) {
      case 'addProduct':
        return await handleAddProduct(args, shopId, token);

      case 'bulkAddProducts':
        return await handleBulkAddProducts(args, shopId, token);

      case 'deleteProduct':
        return await handleDeleteProduct(args, shopId, token, products, clarifiedProductId);

      case 'listProducts':
        return await handleListProducts(products);

      case 'searchProduct':
        return await handleSearchProduct(args, products);

      case 'updateProduct':
        return await handleUpdateProduct(args, shopId, token, products, clarifiedProductId);

      case 'bulkUpdateProducts':
        return await handleBulkUpdateProducts(args, shopId, token, products);

      case 'bulkDeleteAll':
        return await handleBulkDeleteAll(args, shopId, token, ctx);

      case 'bulkDeleteByNames':
        return await handleBulkDeleteByNames(args, shopId, token, products);

      case 'bulkDeleteExcept':
        return await handleBulkDeleteExcept(args, shopId, token, products);

      case 'recordSale':
        return await handleRecordSale(args, shopId, token, products, clarifiedProductId);

      case 'getProductInfo':
        return await handleGetProductInfo(args, products, clarifiedProductId);

      case 'applyDiscount':
        return await handleApplyDiscount(args, shopId, token, products);

      case 'removeDiscount':
        return await handleRemoveDiscount(args, shopId, token, products);

      case 'bulkUpdatePrices':
        return await handleBulkUpdatePrices(args, shopId, token, products);

      case 'showCapabilities':
        return await handleShowCapabilities({ lang: ctx?.session?.language || 'ru' });

      default:
        return {
          success: false,
          message: `Unknown operation: ${functionName}`,
        };
    }
  } catch (error) {
    logger.error(`Tool execution error (${functionName}):`, error);
    return {
      success: false,
      message: `Execution error: ${error.message}`,
    };
  }
}
