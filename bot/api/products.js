import client from './client.js';

/**
 * Products API
 */
export const productsApi = {
  /**
   * Create new product
   * @param {string} token - JWT token
   * @param {object} productData - Product data
   * @returns {Promise<object>} Created product
   */
  async create(token, productData) {
    return await client.post('/api/products', productData, token);
  },

  /**
   * List products with filters
   * @param {object} filters - Filter options (shopId, category, inStock, page, limit)
   * @returns {Promise<object>} Products list with pagination
   */
  async list(filters = {}) {
    const params = new URLSearchParams();

    if (filters.shopId) params.append('shopId', filters.shopId);
    if (filters.category) params.append('category', filters.category);
    if (filters.inStock !== undefined) params.append('inStock', filters.inStock);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);

    const url = params.toString() ? `/api/products?${params}` : '/api/products';
    return await client.get(url);
  },

  /**
   * Get product by ID
   * @param {number} productId - Product ID
   * @returns {Promise<object>} Product details
   */
  async getById(productId) {
    return await client.get(`/api/products/${productId}`);
  },

  /**
   * Update product
   * @param {string} token - JWT token
   * @param {number} productId - Product ID
   * @param {object} updates - Product updates
   * @returns {Promise<object>} Updated product
   */
  async update(token, productId, updates) {
    return await client.put(`/api/products/${productId}`, updates, token);
  },

  /**
   * Delete product
   * @param {string} token - JWT token
   * @param {number} productId - Product ID
   * @returns {Promise<object>} Delete confirmation
   */
  async delete(token, productId) {
    return await client.delete(`/api/products/${productId}`, token);
  }
};
