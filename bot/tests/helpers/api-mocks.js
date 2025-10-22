/**
 * Centralized API Mocking using axios-mock-adapter
 */

import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { testUsers, testTokens } from '../fixtures/users.js';
import { testShops, testProducts, testOrders } from '../fixtures/shops.js';

/**
 * Create and configure axios mock adapter
 * @param {Object} axios - Axios instance to mock
 * @returns {MockAdapter} Configured mock adapter
 */
export function setupApiMocks(axiosInstance = axios) {
  const mock = new MockAdapter(axiosInstance);

  // Auth endpoints
  mock.onPost('/api/auth/login').reply(200, {
    token: testTokens.seller,
    user: testUsers.seller
  });

  mock.onGet('/api/auth/profile').reply(200, testUsers.seller);

  // Shops endpoints
  mock.onPost('/api/shops').reply(201, testShops.active);
  mock.onGet('/api/shops/my').reply(200, [testShops.active]);
  mock.onGet(/\/api\/shops\/\d+/).reply(200, testShops.active);
  mock.onGet('/api/shops/active').reply(200, [testShops.active]);

  // Products endpoints
  mock.onPost('/api/products').reply(201, testProducts.inStock);
  mock.onGet('/api/products').reply(200, {
    products: [testProducts.inStock, testProducts.outOfStock],
    total: 2,
    page: 1,
    limit: 20
  });

  // Orders endpoints
  mock.onPost('/api/orders').reply(201, testOrders.pending);
  mock.onGet('/api/orders/my').reply(200, {
    orders: [testOrders.pending],
    total: 1
  });

  // Subscriptions endpoints
  mock.onPost('/api/subscriptions').reply(201, {
    shopId: 1,
    subscribedAt: new Date().toISOString()
  });
  mock.onDelete(/\/api\/subscriptions\/\d+/).reply(200, {
    message: 'Unsubscribed successfully'
  });

  // Payments endpoints
  mock.onPost('/api/payments/verify').reply(200, {
    verified: true,
    confirmations: 3,
    amount: 0.001
  });

  return mock;
}

/**
 * Create mock for specific endpoint
 */
export function mockEndpoint(mock, method, url, status, data) {
  const methodMap = {
    'GET': mock.onGet,
    'POST': mock.onPost,
    'PUT': mock.onPut,
    'DELETE': mock.onDelete
  };

  methodMap[method](url).reply(status, data);
}

/**
 * Reset all mocks
 */
export function resetApiMocks(mock) {
  mock.reset();
}

/**
 * Restore axios to original state
 */
export function restoreApiMocks(mock) {
  mock.restore();
}
