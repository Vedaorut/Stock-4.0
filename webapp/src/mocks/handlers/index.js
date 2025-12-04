// MSW Handlers - collect all API handlers into one array
import { shopsHandlers } from './shops.js';
import { productsHandlers } from './products.js';
import { ordersHandlers } from './orders.js';
import { followsHandlers } from './follows.js';
import { settingsHandlers } from './settings.js';
import { analyticsHandlers } from './analytics.js';
import { subscriptionsHandlers } from './subscriptions.js';
import { authHandlers } from './auth.js';

// Export all handlers as single array
export const handlers = [
  ...shopsHandlers,
  ...productsHandlers,
  ...ordersHandlers,
  ...followsHandlers,
  ...settingsHandlers,
  ...analyticsHandlers,
  ...subscriptionsHandlers,
  ...authHandlers,
];

// For convenience, also export individually
export {
  shopsHandlers,
  productsHandlers,
  ordersHandlers,
  followsHandlers,
  settingsHandlers,
  analyticsHandlers,
  subscriptionsHandlers,
  authHandlers,
};
