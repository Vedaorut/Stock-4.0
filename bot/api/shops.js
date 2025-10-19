import client from './client.js';

/**
 * Shops API
 */
export const shopsApi = {
  /**
   * Create new shop
   * @param {string} token - JWT token
   * @param {object} shopData - Shop data
   * @returns {Promise<object>} Created shop
   */
  async create(token, shopData) {
    return await client.post('/api/shops', shopData, token);
  },

  /**
   * Get current user's shops
   * @param {string} token - JWT token
   * @returns {Promise<Array>} User's shops
   */
  async getMyShops(token) {
    return await client.get('/api/shops/my', token);
  },

  /**
   * Get shop by ID
   * @param {number} shopId - Shop ID
   * @returns {Promise<object>} Shop details
   */
  async getById(shopId) {
    return await client.get(`/api/shops/${shopId}`);
  },

  /**
   * List all active shops
   * @param {object} filters - Search filters
   * @returns {Promise<Array>} Active shops
   */
  async listActive(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const url = params ? `/api/shops/active?${params}` : '/api/shops/active';
    return await client.get(url);
  },

  /**
   * Search shops by name
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching shops
   */
  async search(query) {
    return await client.get(`/api/shops/active?search=${encodeURIComponent(query)}`);
  },

  /**
   * Update shop
   * @param {string} token - JWT token
   * @param {number} shopId - Shop ID
   * @param {object} updates - Shop updates
   * @returns {Promise<object>} Updated shop
   */
  async update(token, shopId, updates) {
    return await client.put(`/api/shops/${shopId}`, updates, token);
  },

  /**
   * Delete shop
   * @param {string} token - JWT token
   * @param {number} shopId - Shop ID
   * @returns {Promise<object>} Delete confirmation
   */
  async delete(token, shopId) {
    return await client.delete(`/api/shops/${shopId}`, token);
  }
};
