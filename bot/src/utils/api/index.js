// Re-export all API modules for backward compatibility
// Usage: import { shopApi, orderApi } from '../utils/api.js'
// Now:   import { shopApi, orderApi } from '../utils/api/index.js'

export { authApi } from './auth.js';
export { shopApi, workerApi } from './shops.js';
export { productApi } from './products.js';
export { orderApi } from './orders.js';
export { paymentApi, subscriptionApi } from './payments.js';
export { followApi } from './follows.js';
export { walletApi } from './wallets.js';
export { notificationApi } from './notifications.js';
export { api } from './config.js';
export default api;

// Re-export api as named export for testing
import { api } from './config.js';
