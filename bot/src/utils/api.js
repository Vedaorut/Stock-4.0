import axios from 'axios';
import config from '../config/index.js';
import logger from './logger.js';

// Create axios instance with base URL
const api = axios.create({
  baseURL: config.backendUrl + '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    logger.debug(`API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    logger.debug(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    if (error.response) {
      // Log full error details including validation errors and request body
      let requestBody = null;
      if (error.config?.data) {
        if (typeof error.config.data === 'string') {
          try {
            requestBody = JSON.parse(error.config.data);
          } catch {
            requestBody = error.config.data;
          }
        } else {
          requestBody = error.config.data;
        }
      }

      logger.error(`API Error: ${error.response.status} ${error.response.config.url}`, {
        responseData: error.response.data,
        requestBody,
        validationErrors: error.response.data?.details || null
      });
    } else if (error.request) {
      logger.error('API Error: No response received', { url: error.config?.url });
    } else {
      logger.error('API Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// API methods
export const authApi = {
  // Register or login user
  async authenticate(telegramId, userData) {
    const requestBody = {
      telegramId: parseInt(telegramId, 10),  // Send as integer, not string
      username: userData.username,
      firstName: userData.firstName || userData.first_name,  // Support both camelCase and snake_case
      lastName: userData.lastName || userData.last_name || ''
    };

    const { data } = await api.post('/auth/register', requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    // Unwrap response: return data.data instead of data
    return data.data || data;
  },

  // Update user role
  async updateRole(role, token) {
    const { data } = await api.patch('/auth/role',
      { role },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    return data.data || data;
  }
};

export const shopApi = {
  // Get user's shop
  async getMyShop(token) {
    const { data } = await api.get('/shops/my', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const shops = data.data || data;
    return Array.isArray(shops) ? shops : [];
  },

  // Create new shop
  async createShop(shopData, token) {
    const { data } = await api.post('/shops', shopData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (shop object) instead of wrapper
    return data.data || data;
  },

  // Search shops
  async searchShops(query, token = null) {
    const config = {
      params: { q: query }
    };

    if (token) {
      config.headers = { Authorization: `Bearer ${token}` };
    }

    const { data } = await api.get('/shops/search', config);
    const shops = data.data || data;
    return Array.isArray(shops) ? shops : [];
  },

  // Get shop by ID
  async getShop(shopId) {
    const { data } = await api.get(`/shops/${shopId}`);
    // Unwrap response: return data.data (shop object) instead of wrapper
    return data.data || data;
  }
};

export const productApi = {
  // Create product
  async createProduct(productData, token) {
    const { data } = await api.post('/products', productData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (product object) instead of wrapper
    return data.data || data;
  },

  // Get shop products
  async getShopProducts(shopId) {
    const { data } = await api.get('/products', {
      params: { shopId }
    });
    // Unwrap response: return data.data (array of products) instead of wrapper
    return data.data || data;
  }
};

export const orderApi = {
  // Get buyer orders
  async getMyOrders(token) {
    const { data } = await api.get('/orders/my', {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (array of orders) instead of wrapper
    const orders = data.data || data;
    return Array.isArray(orders) ? orders : [];
  },

  // Get shop orders (sales)
  async getShopOrders(shopId, token) {
    const { data } = await api.get('/orders', {
      params: { shopId },
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (array of orders) instead of wrapper
    const orders = data.data || data;
    return Array.isArray(orders) ? orders : [];
  }
};

export const paymentApi = {
  // Verify crypto payment
  async verifyPayment(paymentData, token) {
    const { data } = await api.post('/payments/verify', paymentData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (payment object) instead of wrapper
    return data.data || data;
  },

  // Generate crypto address
  async generateAddress(currency, token) {
    const { data } = await api.post('/payments/address',
      { currency },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    // Unwrap response: return data.data (address object) instead of wrapper
    return data.data || data;
  }
};

export const subscriptionApi = {
  // Check if user is subscribed to shop
  async checkSubscription(shopId, token) {
    const { data } = await api.get(`/subscriptions/check/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (object with isSubscribed and subscription) instead of wrapper
    return data.data || data;
  },

  // Subscribe to shop
  async subscribe(shopId, token) {
    const { data } = await api.post(
      '/subscriptions',
      { shopId: Number(shopId) },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    // Unwrap response: return data.data (subscription object) instead of wrapper
    return data.data || data;
  },

  // Get user subscriptions
  async getMySubscriptions(token) {
    const { data } = await api.get('/subscriptions', {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (array of subscriptions) instead of wrapper
    return data.data || data;
  },

  // Unsubscribe from shop
  async unsubscribe(shopId, token) {
    const { data } = await api.delete(`/subscriptions/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data instead of wrapper
    return data.data || data;
  }
};

export const walletApi = {
  // Get shop wallets
  async getWallets(shopId, token) {
    const { data } = await api.get(`/shops/${shopId}/wallets`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data.data || data;
  },

  // Update shop wallets
  async updateWallets(shopId, wallets, token) {
    const { data } = await api.put(
      `/shops/${shopId}/wallets`,
      wallets,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    return data.data || data;
  }
};

// Export named api instance for testing
export { api };
export default api;
