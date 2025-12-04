/**
 * ProductAI Handlers - Re-export all handlers
 *
 * Consolidated exports for all product operation handlers:
 * - Query handlers (list, search, get info)
 * - Add handlers (single, bulk)
 * - Delete handlers (single, bulk variants)
 * - Update handlers (single, bulk)
 * - Sale handlers
 * - Discount handlers
 */

// Query handlers
export { handleListProducts, handleSearchProduct, handleGetProductInfo } from './queryHandlers.js';

// Add handlers
export { handleAddProduct, handleBulkAddProducts } from './addHandlers.js';

// Delete handlers
export {
  handleDeleteProduct,
  handleBulkDeleteAll,
  handleBulkDeleteByNames,
  handleBulkDeleteExcept,
} from './deleteHandlers.js';

// Update handlers
export { handleUpdateProduct, handleBulkUpdateProducts } from './updateHandlers.js';

// Sale handlers
export { handleRecordSale } from './saleHandlers.js';

// Discount handlers
export {
  handleApplyDiscount,
  handleRemoveDiscount,
  handleBulkUpdatePrices,
} from './discountHandlers.js';

// Utility handlers
export { handleShowCapabilities } from './showCapabilities.js';
