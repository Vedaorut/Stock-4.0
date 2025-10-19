import client from './client.js';

/**
 * Orders API
 */
export const ordersApi = {
  /**
   * Create new order
   * @param {string} token - JWT token
   * @param {object} orderData - Order data
   * @returns {Promise<object>} Created order
   */
  async create(token, orderData) {
    return await client.post('/api/orders', orderData, token);
  },

  /**
   * Get current user's orders
   * @param {string} token - JWT token
   * @param {object} filters - Filter options (status, page, limit)
   * @returns {Promise<object>} Orders list with pagination
   */
  async getMyOrders(token, filters = {}) {
    const params = new URLSearchParams();

    if (filters.status) params.append('status', filters.status);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);

    const url = params.toString() ? `/api/orders/my?${params}` : '/api/orders/my';
    return await client.get(url, token);
  },

  /**
   * Get order by ID
   * @param {string} token - JWT token
   * @param {number} orderId - Order ID
   * @returns {Promise<object>} Order details
   */
  async getById(token, orderId) {
    return await client.get(`/api/orders/${orderId}`, token);
  },

  /**
   * Update order status
   * @param {string} token - JWT token
   * @param {number} orderId - Order ID
   * @param {string} status - New status
   * @returns {Promise<object>} Updated order
   */
  async updateStatus(token, orderId, status) {
    return await client.put(`/api/orders/${orderId}/status`, { status }, token);
  }
};
