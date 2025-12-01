// Re-export from modular API structure for backward compatibility
// All imports like: import { shopApi } from '../utils/api.js' continue to work

export {
  authApi,
  shopApi,
  workerApi,
  productApi,
  orderApi,
  paymentApi,
  subscriptionApi,
  followApi,
  walletApi,
  notificationApi,
  api,
} from './api/index.js';

export { api as default } from './api/index.js';
