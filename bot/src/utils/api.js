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
      logger.error(`API Error: ${error.response.status} ${error.response.config.url}`, {
        responseData: error.response.data,
        requestBody: error.config.data ? JSON.parse(error.config.data) : null,
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
  }
};

export const shopApi = {
  // Get user's shop
  async getMyShop(token) {
    const { data } = await api.get('/shops/my', {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (array of shops) instead of wrapper
    return data.data || data;
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
  async searchShops(query) {
    const { data } = await api.get('/shops/search', {
      params: { q: query }
    });
    // Unwrap response: return data.data (array of shops) instead of wrapper
    return data.data || data;
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
    const { data } = await api.get(`/products/shop/${shopId}`);
    // Unwrap response: return data.data (array of products) instead of wrapper
    return data.data || data;
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
  // Subscribe to shop
  async subscribe(shopId, token) {
    const { data } = await api.post(`/subscriptions/${shopId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (subscription object) instead of wrapper
    return data.data || data;
  },

  // Get user subscriptions
  async getMySubscriptions(token) {
    const { data } = await api.get('/subscriptions/my', {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Unwrap response: return data.data (array of subscriptions) instead of wrapper
    return data.data || data;
  }
};

export default api;
