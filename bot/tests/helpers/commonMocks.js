/**
 * Common Mock Helpers for Bot Tests
 *
 * Provides reusable mock functions for frequently used API endpoints
 */

/**
 * Mock shop validation endpoint (required by validateShopBeforeScene middleware)
 *
 * @param {MockAdapter} mock - axios-mock-adapter instance
 * @param {number} shopId - Shop ID to mock
 * @param {object} shopData - Additional shop data to include
 */
export function mockShopValidation(mock, shopId = 1, shopData = {}) {
  mock.onGet(`/shops/${shopId}`).reply(200, {
    data: {
      id: shopId,
      name: shopData.name || 'Test Shop',
      tier: shopData.tier || 'basic',
      owner_id: shopData.owner_id || 1,
      seller_id: shopData.seller_id || 1,
      ...shopData,
    },
  });
}

/**
 * Mock follow limit check endpoint (called by createFollow scene on entry)
 *
 * @param {MockAdapter} mock - axios-mock-adapter instance
 * @param {object} options - Limit options
 * @param {boolean} options.reached - Whether limit is reached (default: false)
 * @param {number} options.count - Current follow count (default: 0)
 * @param {number} options.limit - Maximum allowed follows (default: 2)
 */
export function mockFollowLimit(mock, options = {}) {
  const { reached = false, count = 0, limit = 2 } = options;
  mock.onGet('/follows/check-limit').reply(200, {
    data: { reached, count, limit },
  });
}

/**
 * Mock circular follow validation endpoint (called by createFollow scene before creating follow)
 *
 * @param {MockAdapter} mock - axios-mock-adapter instance
 * @param {object} options - Validation options
 * @param {boolean} options.valid - Whether circular follow is valid (default: true)
 */
export function mockValidateCircular(mock, options = {}) {
  const { valid = true } = options;
  mock.onPost('/follows/validate-circular').reply(200, {
    data: { valid },
  });
}

/**
 * Mock shop orders endpoint (GET /shops/:shopId/orders)
 * Used by orderApi.getShopOrders()
 *
 * @param {MockAdapter} mock - axios-mock-adapter instance
 * @param {number} shopId - Shop ID to mock
 * @param {Array} orders - Array of order objects
 * @param {object} pagination - Pagination metadata (optional)
 */
export function mockShopOrders(mock, shopId, orders = [], pagination = null) {
  const paginationData = pagination || {
    total: orders.length,
    totalPages: Math.max(1, Math.ceil(orders.length / 5)),
    page: 1,
    limit: 5,
    hasMore: false,
  };

  mock.onGet(`/shops/${shopId}/orders`).reply(200, {
    success: true,
    data: orders,
    pagination: paginationData,
  });
}

/**
 * Mock shop orders error (for testing error handling)
 *
 * @param {MockAdapter} mock - axios-mock-adapter instance
 * @param {number} shopId - Shop ID to mock
 * @param {number} status - HTTP status code (default: 500)
 * @param {string} error - Error message
 */
export function mockShopOrdersError(mock, shopId, status = 500, error = 'Internal server error') {
  mock.onGet(`/shops/${shopId}/orders`).reply(status, {
    success: false,
    error,
  });
}
