import { api } from './config.js';

export const productApi = {
  // Create product
  async createProduct(productData, token) {
    const { data } = await api.post('/products', productData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (product object) instead of wrapper
    return data.data || data;
  },

  // Get shop products
  async getShopProducts(shopId) {
    const { data } = await api.get('/products', {
      params: { shopId },
    });
    // Unwrap response: return data.data (array of products) instead of wrapper
    return data.data || data;
  },

  // Update product
  async updateProduct(productId, productData, token) {
    const { data } = await api.put(`/products/${productId}`, productData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (product object) instead of wrapper
    return data.data || data;
  },

  // Delete product
  async deleteProduct(productId, token) {
    const { data } = await api.delete(`/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data instead of wrapper
    return data.data || data;
  },

  // Bulk delete all products from a shop
  async bulkDeleteAll(shopId, token) {
    const { data } = await api.post(
      '/products/bulk-delete-all',
      { shopId },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.data (result with deletedCount and deletedProducts) instead of wrapper
    return data.data || data;
  },

  // Bulk delete specific products by IDs
  async bulkDeleteByIds(shopId, productIds, token) {
    const { data } = await api.post(
      '/products/bulk-delete-by-ids',
      { shopId, productIds },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.data (result with deletedCount and deletedProducts) instead of wrapper
    return data.data || data;
  },

  // Apply bulk discount to all products in a shop
  async applyBulkDiscount(shopId, token, discountData) {
    const { data } = await api.post(
      '/products/bulk-discount',
      {
        shopId: shopId, // camelCase for Backend API
        percentage: discountData.percentage,
        type: discountData.type, // 'permanent' or 'timer'
        duration: discountData.duration, // milliseconds or null
        excluded_product_ids: discountData.excludedProductIds || [], // NEW!
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.data (result with productsUpdated and products) instead of wrapper
    return data.data || data;
  },

  // Remove bulk discount from all products in a shop
  async removeBulkDiscount(shopId, token) {
    const { data } = await api.post(
      '/products/bulk-discount/remove',
      { shopId: shopId }, // camelCase for Backend API
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.data instead of wrapper
    return data.data || data;
  },
};
