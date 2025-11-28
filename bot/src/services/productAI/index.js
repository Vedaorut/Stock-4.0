/**
 * ProductAI Module - Main re-export hub
 *
 * This module provides a clean API for the ProductAI functionality.
 * All submodules are re-exported for easy access.
 */

// Constants
export {
  MAX_HISTORY_MESSAGES,
  CONVERSATION_TIMEOUT,
  STOCK_KEYWORDS,
  STOCK_ACTION_KEYWORDS,
  STOCK_INVALID_TARGET_KEYWORDS,
  STOCK_UPDATE_PATTERNS,
} from './constants.js';

// Utils
export {
  cleanDeepSeekTokens,
  detectJSONInMessage,
  cleanProductCandidate,
  formatUsd,
  formatProductLine,
  formatDuration,
  parseDurationToMs,
} from './utils/index.js';

// Context Management
export {
  noteProductContext,
  updateContextFromResult,
  getConversationHistory,
  saveToConversationHistory,
} from './context/index.js';

// Detection
export { detectStockUpdateIntent, detectSingleProductDiscountIntent } from './detection/index.js';

// Handlers
export {
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
} from './handlers/index.js';

// Routing
export { executeToolCall } from './routing/index.js';

// Main processor
export { processProductCommand } from './processor.js';

// Default export for backward compatibility
import { processProductCommand } from './processor.js';
import { noteProductContext } from './context/index.js';

export default {
  processProductCommand,
  noteProductContext,
};
