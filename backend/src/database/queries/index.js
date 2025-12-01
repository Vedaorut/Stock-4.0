/**
 * Barrel export for all database queries
 * Centralized import point for all query modules
 */

export { default as userQueries } from './userQueries.js';
export { default as shopQueries } from './shopQueries.js';
export { default as productQueries } from './productQueries.js';
export { default as orderQueries } from './orderQueries.js';
export { default as orderItemQueries } from './orderItemQueries.js';
export { default as paymentQueries } from './paymentQueries.js';
export { default as invoiceQueries } from './invoiceQueries.js';
export { default as subscriptionQueries } from './subscriptionQueries.js';
export { default as refreshTokenQueries } from './refreshTokenQueries.js';

// Import existing worker and webhook queries from models/
export { workerQueries } from '../../models/workerQueries.js';
export { processedWebhookQueries } from '../../models/processedWebhookQueries.js';

// Default export for backwards compatibility
export default {
  userQueries: (await import('./userQueries.js')).default,
  shopQueries: (await import('./shopQueries.js')).default,
  productQueries: (await import('./productQueries.js')).default,
  orderQueries: (await import('./orderQueries.js')).default,
  orderItemQueries: (await import('./orderItemQueries.js')).default,
  paymentQueries: (await import('./paymentQueries.js')).default,
  invoiceQueries: (await import('./invoiceQueries.js')).default,
  subscriptionQueries: (await import('./subscriptionQueries.js')).default,
  refreshTokenQueries: (await import('./refreshTokenQueries.js')).default,
  workerQueries: (await import('../../models/workerQueries.js')).workerQueries,
  processedWebhookQueries: (await import('../../models/processedWebhookQueries.js'))
    .processedWebhookQueries,
};
