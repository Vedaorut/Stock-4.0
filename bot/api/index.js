/**
 * API Client for Status Stock Backend
 *
 * Centralized API integration for Telegram Bot
 * All endpoints use JWT authentication and include retry logic
 */

export { authApi } from './auth.js';
export { shopsApi } from './shops.js';
export { productsApi } from './products.js';
export { ordersApi } from './orders.js';
export { subscriptionsApi } from './subscriptions.js';
export { paymentsApi } from './payments.js';

// Export base client for custom requests
export { default as apiClient } from './client.js';
