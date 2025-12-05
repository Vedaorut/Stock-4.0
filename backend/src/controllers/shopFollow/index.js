/**
 * Shop Follow Controller
 * Re-exports all handlers for backward compatibility
 */

// Read handlers
export {
  getMyFollows,
  getFollowDetail,
  getFollowProducts,
  getFollowSyncStatus,
  checkFollowLimit,
} from './handlers/readHandlers.js';

// Create handlers
export { createFollow } from './handlers/createHandlers.js';

// Update handlers
export {
  updateFollowMarkup,
  switchFollowMode,
  updateProductMarkup,
  resetProductMarkup,
} from './handlers/updateHandlers.js';

// Delete handlers
export { deleteFollow } from './handlers/deleteHandlers.js';

// Helper exports (for tests/utilities)
export {
  PRO_TIER_FOLLOW_LIMIT,
  toNumber,
  formatFollowResponse,
  formatMonitorProduct,
  formatResellProduct,
} from './helpers.js';
