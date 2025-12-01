import { api, logger } from './config.js';

export const shopApi = {
  // Get user's shop
  async getMyShop(token) {
    const { data } = await api.get('/shops/my', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const shops = data.data || data;
    return Array.isArray(shops) ? shops : [];
  },

  // Create new shop
  async createShop(shopData, token) {
    const { data } = await api.post('/shops', shopData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (shop object) instead of wrapper
    return data.data || data;
  },

  // Search shops
  async searchShops(query, token = null) {
    const reqConfig = {
      params: { q: query },
    };

    if (token) {
      reqConfig.headers = { Authorization: `Bearer ${token}` };
    }

    const { data } = await api.get('/shops/search', reqConfig);
    const shops = data.data || data;
    return Array.isArray(shops) ? shops : [];
  },

  // Get shop by ID
  async getShop(shopId, token = null) {
    const reqConfig = {};
    if (token) {
      reqConfig.headers = { Authorization: `Bearer ${token}` };
    }
    const { data } = await api.get(`/shops/${shopId}`, reqConfig);
    // Unwrap response: return data.data (shop object) instead of wrapper
    return data.data || data;
  },

  // Get worker shops only (not owner)
  async getWorkerShops(token) {
    try {
      const { data } = await api.get('/shops/worker', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data.data || data;
    } catch (error) {
      // Backward compatibility: some backends expose /shops/workspace
      if (error.response?.status === 404) {
        const { data } = await api.get('/shops/workspace', {
          headers: { Authorization: `Bearer ${token}` },
        });
        return data.data || data;
      }
      throw error;
    }
  },

  // Worker/seller: get products for specific shop with auth
  async getShopProductsSecure(shopId, token) {
    const { data } = await api.get(`/shops/${shopId}/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Worker/seller: create product within a shop
  async createShopProduct(shopId, productData, token) {
    const { data } = await api.post(`/shops/${shopId}/products`, productData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Worker/seller: update product within a shop
  async updateShopProduct(shopId, productId, productData, token) {
    const { data } = await api.put(`/shops/${shopId}/products/${productId}`, productData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Worker/seller: delete product within a shop
  async deleteShopProduct(shopId, productId, token) {
    const { data } = await api.delete(`/shops/${shopId}/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },
};

export const workerApi = {
  // Add worker to shop
  async addWorker(shopId, workerData, token) {
    const { data } = await api.post(`/shops/${shopId}/workers`, workerData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // List shop workers
  async listWorkers(shopId, token) {
    const { data } = await api.get(`/shops/${shopId}/workers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Remove worker
  async removeWorker(shopId, workerId, token) {
    const { data } = await api.delete(`/shops/${shopId}/workers/${workerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },
};
