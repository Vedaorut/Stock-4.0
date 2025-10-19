import client from './client.js';

/**
 * Subscriptions API
 */
export const subscriptionsApi = {
  /**
   * Subscribe to a shop
   * @param {string} token - JWT token
   * @param {number} shopId - Shop ID
   * @returns {Promise<object>} Subscription data
   */
  async subscribe(token, shopId) {
    return await client.post('/api/subscriptions', { shopId }, token);
  },

  /**
   * Get current user's subscriptions
   * @param {string} token - JWT token
   * @param {object} pagination - Pagination options
   * @returns {Promise<object>} Subscriptions list
   */
  async getMySubscriptions(token, pagination = {}) {
    const params = new URLSearchParams();

    if (pagination.page) params.append('page', pagination.page);
    if (pagination.limit) params.append('limit', pagination.limit);

    const url = params.toString() ? `/api/subscriptions?${params}` : '/api/subscriptions';
    return await client.get(url, token);
  },

  /**
   * Get shop subscribers (shop owner only)
   * @param {string} token - JWT token
   * @param {number} shopId - Shop ID
   * @returns {Promise<Array>} Shop subscribers
   */
  async getShopSubscribers(token, shopId) {
    return await client.get(`/api/subscriptions/shop/${shopId}`, token);
  },

  /**
   * Check if user is subscribed to shop
   * @param {string} token - JWT token
   * @param {number} shopId - Shop ID
   * @returns {Promise<object>} Subscription status
   */
  async checkSubscription(token, shopId) {
    return await client.get(`/api/subscriptions/check/${shopId}`, token);
  },

  /**
   * Unsubscribe from a shop
   * @param {string} token - JWT token
   * @param {number} shopId - Shop ID
   * @returns {Promise<object>} Unsubscribe confirmation
   */
  async unsubscribe(token, shopId) {
    return await client.delete(`/api/subscriptions/${shopId}`, token);
  }
};
