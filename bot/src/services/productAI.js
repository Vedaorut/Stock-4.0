/**
 * ProductAI Service - Re-export facade
 *
 * This file maintains backward compatibility by re-exporting
 * all functionality from the productAI module.
 *
 * The actual implementation is in ./productAI/ directory.
 */

// Main function
export { processProductCommand } from './productAI/processor.js';

// Context management
export {
  saveToConversationHistory,
  getConversationHistory,
  noteProductContext,
  updateContextFromResult,
} from './productAI/context/index.js';

// Detection functions
export {
  detectStockUpdateIntent,
  detectSingleProductDiscountIntent,
} from './productAI/detection/index.js';

// Utils (for testing)
export {
  cleanDeepSeekTokens,
  detectJSONInMessage,
  parseDurationToMs,
  formatDuration,
} from './productAI/utils/index.js';

// Routing
export { executeToolCall } from './productAI/routing/index.js';

// Default export for backward compatibility
export { default } from './productAI/index.js';
