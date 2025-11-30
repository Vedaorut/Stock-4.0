import axios from 'axios';
import axiosRetry from 'axios-retry';
import crypto from 'crypto';
import config from '../config/index.js';
import logger from './logger.js';

// Create axios instance with base URL
// Default timeout: 10s for normal requests
const api = axios.create({
  baseURL: config.backendUrl + '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Create axios instance for payment endpoints with longer timeout
// Payment endpoints need 60s timeout for blockchain API queries
const paymentAxios = axios.create({
  baseURL: config.backendUrl + '/api',
  timeout: 60000, // 60 seconds for blockchain queries
  headers: {
    'Content-Type': 'application/json',
  },
});

// P1-BOT-002 FIX: Configure retry logic for network errors
// Retry 3 times with exponential backoff (1s, 2s, 4s)
// Only retry on network errors (ECONNREFUSED, ETIMEDOUT), NOT on 4xx errors
axiosRetry(api, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Retry on network errors
    if (axiosRetry.isNetworkError(error)) {
      logger.warn('Network error detected, retrying...', {
        url: error.config?.url,
        attempt: error.config?.['axios-retry']?.retryCount || 0,
      });
      return true;
    }
    // Retry on 5xx server errors (but not 4xx client errors)
    if (error.response?.status >= 500) {
      logger.warn('Server error detected, retrying...', {
        url: error.config?.url,
        status: error.response.status,
        attempt: error.config?.['axios-retry']?.retryCount || 0,
      });
      return true;
    }
    // Don't retry on 4xx client errors (bad request, unauthorized, etc.)
    return false;
  },
  onRetry: (retryCount, error) => {
    logger.info('Retrying API request', {
      url: error.config?.url,
      retryCount,
      error: error.message,
    });
  },
});

// Apply same retry logic to payment API
axiosRetry(paymentAxios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    if (axiosRetry.isNetworkError(error)) {
      logger.warn('Payment API network error, retrying...', {
        url: error.config?.url,
        attempt: error.config?.['axios-retry']?.retryCount || 0,
      });
      return true;
    }
    if (error.response?.status >= 500) {
      logger.warn('Payment API server error, retrying...', {
        url: error.config?.url,
        status: error.response.status,
        attempt: error.config?.['axios-retry']?.retryCount || 0,
      });
      return true;
    }
    return false;
  },
  onRetry: (retryCount, error) => {
    logger.info('Retrying payment API request', {
      url: error.config?.url,
      retryCount,
      error: error.message,
    });
  },
});

// Apply interceptors to payment API instance
paymentAxios.interceptors.request.use(
  (config) => {
    logger.debug(`Payment API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error('Payment API Request Error:', error);
    return Promise.reject(error);
  }
);

paymentAxios.interceptors.response.use(
  (response) => {
    logger.debug(`Payment API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    if (error.response) {
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

      logger.error(`Payment API Error: ${error.response.status} ${error.response.config.url}`, {
        responseData: error.response.data,
        requestBody,
        validationErrors: error.response.data?.details || null,
      });
    } else if (error.request) {
      logger.error('Payment API Error: No response received', { url: error.config?.url });
    } else {
      logger.error('Payment API Error:', error.message);
    }
    return Promise.reject(error);
  }
);

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
        validationErrors: error.response.data?.details || null,
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
  // Register or login user via internal API (bot-to-backend trusted auth)
  async authenticate(telegramId, userData) {
    const requestBody = {
      telegramId: parseInt(telegramId, 10), // Send as integer, not string
      username: userData.username,
      firstName: userData.firstName || userData.first_name, // Support both camelCase and snake_case
      lastName: userData.lastName || userData.last_name || '',
    };

    if (!config.internalSecret) {
      throw new Error('Missing INTERNAL_SECRET for bot internal auth');
    }

    if (!config.botToken) {
      throw new Error('Missing BOT_TOKEN for request signing');
    }

    // Generate HMAC signature using BOT_TOKEN (not INTERNAL_SECRET)
    // This proves request comes from bot - even if INTERNAL_SECRET leaks,
    // attacker cannot forge signature without BOT_TOKEN
    const timestamp = Date.now().toString();
    const payload = JSON.stringify(requestBody) + timestamp;
    const signature = crypto
      .createHmac('sha256', config.botToken)
      .update(payload)
      .digest('hex');

    // Use internal API endpoint with x-internal-secret header
    // This bypasses Telegram initData verification for bot auth
    const { data } = await api.post('/internal/auth/bot-register', requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': config.internalSecret,
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      },
    });
    // Unwrap response: return { token, user }
    return data.data || data;
  },

  // Update user role
  async updateRole(role, token) {
    const { data } = await api.patch(
      '/auth/role',
      { role },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },
};

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
    const config = {
      params: { q: query },
    };

    if (token) {
      config.headers = { Authorization: `Bearer ${token}` };
    }

    const { data } = await api.get('/shops/search', config);
    const shops = data.data || data;
    return Array.isArray(shops) ? shops : [];
  },

  // Get shop by ID
  async getShop(shopId, token = null) {
    const config = {};
    if (token) {
      config.headers = { Authorization: `Bearer ${token}` };
    }
    const { data } = await api.get(`/shops/${shopId}`, config);
    // Unwrap response: return data.data (shop object) instead of wrapper
    return data.data || data;
  },

  // Get accessible shops (owner + worker)
  async getAccessibleShops(token) {
    const { data } = await api.get('/shops/accessible', {
      headers: { Authorization: `Bearer ${token}` },
    });
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
        shopId: shopId, // camelCase для соответствия Backend API
        percentage: discountData.percentage,
        type: discountData.type, // 'permanent' or 'timer'
        duration: discountData.duration, // milliseconds or null
        excluded_product_ids: discountData.excludedProductIds || [], // НОВОЕ!
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
      { shopId: shopId }, // camelCase для соответствия Backend API
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.data instead of wrapper
    return data.data || data;
  },
};

export const orderApi = {
  // Get buyer orders
  async getMyOrders(token) {
    const { data } = await api.get('/orders/my', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (array of orders) instead of wrapper
    const orders = data.data || data;
    return Array.isArray(orders) ? orders : [];
  },

  // Get shop orders (sales)
  async getShopOrders(shopId, token, options = {}) {
    try {
      const params = {
        shop_id: shopId,
      };

      if (options.status) {
        params.status = Array.isArray(options.status) ? options.status.join(',') : options.status;
      }

      if (options.limit) {
        params.limit = options.limit;
      }

      if (options.page) {
        params.page = options.page;
      }

      logger.info('getShopOrders request:', {
        shopId,
        filters: options,
        params,
        hasToken: !!token,
      });

      // Prefer new worker-friendly endpoint, fallback to legacy
      let data;
      try {
        const response = await api.get(`/shops/${shopId}/orders`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
        data = response.data;
      } catch (err) {
        if (err.response?.status !== 404) {
          throw err;
        }
        const response = await api.get('/orders', {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
        data = response.data;
      }

      logger.info('getShopOrders response:', {
        status: 200,
        dataStructure: {
          hasData: !!data,
          hasDataData: !!data?.data,
          isArray: Array.isArray(data),
          dataIsArray: Array.isArray(data?.data),
          payloadHasOrders: !!(data?.data?.orders || data?.orders),
          ordersCount:
            data?.data?.orders?.length ||
            data?.data?.length ||
            data?.orders?.length ||
            data?.length ||
            0,
        },
      });

      // Unwrap response: return data.data (array of orders) instead of wrapper
      const payload = data.data || data;
      const orders = Array.isArray(payload?.orders) ? payload.orders : payload;
      return Array.isArray(orders) ? orders : [];
    } catch (error) {
      logger.error('getShopOrders error:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        shopId,
        filters: options,
      });
      throw error; // Re-throw to be caught by handler
    }
  },

  // Get active orders count
  async getActiveOrdersCount(shopId, token) {
    const { data } = await api.get('/orders/active/count', {
      headers: { Authorization: `Bearer ${token}` },
      params: { shop_id: shopId },
    });

    const count = data?.data?.count ?? data?.count ?? 0;
    return Number.isFinite(Number(count)) ? Number(count) : 0;
  },

  // Update order status
  async updateOrderStatus(orderId, status, token) {
    const { data } = await api.put(
      `/orders/${orderId}/status`,
      { status },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data.data || data;
  },

  // Bulk update order status
  async bulkUpdateOrderStatus(orderIds, status, token) {
    const { data } = await api.post(
      '/orders/bulk-status',
      { order_ids: orderIds, status },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data.data || data;
  },

  /**
   * Get order analytics for period
   */
  async getAnalytics(shopId, startDate, endDate, token) {
    try {
      const response = await api.get('/orders/analytics', {
        params: {
          shop_id: shopId,
          from: startDate,
          to: endDate,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data.data;
    } catch (error) {
      logger.error('Error fetching analytics:', error);
      throw error;
    }
  },
};

// P0-BOT-7 FIX: Use paymentAxios with 60s timeout for payment endpoints
export const paymentApi = {
  // Verify crypto payment (blockchain query - needs 60s timeout)
  async verifyPayment(paymentData, token) {
    const { data } = await paymentAxios.post('/payments/verify', paymentData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (payment object) instead of wrapper
    return data.data || data;
  },

  // Generate crypto address
  async generateAddress(currency, token) {
    const { data } = await paymentAxios.post(
      '/payments/address',
      { currency },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    // Unwrap response: return data.data (address object) instead of wrapper
    return data.data || data;
  },
};

export const subscriptionApi = {
  // Get subscription pricing (tier prices from backend)
  async getPricing() {
    try {
      const { data } = await api.get('/subscriptions/pricing');
      return data;
    } catch (error) {
      logger.error('Failed to fetch subscription pricing:', error);
      // Fallback prices if API fails
      return {
        basic: { price: 25, currency: 'USD', period: '30 days' },
        pro: { price: 35, currency: 'USD', period: '30 days' },
      };
    }
  },

  // Check if user is subscribed to shop
  async checkSubscription(shopId, token) {
    const { data } = await api.get(`/subscriptions/check/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (object with isSubscribed and subscription) instead of wrapper
    return data.data || data;
  },

  // Subscribe to shop
  async subscribe(shopId, token, telegramId = null) {
    const { data } = await api.post(
      '/subscriptions',
      {
        shopId: Number(shopId),
        telegramId: telegramId ? String(telegramId) : undefined,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.data (subscription object) instead of wrapper
    return data.data || data;
  },

  // Get user subscriptions
  async getMySubscriptions(token) {
    const { data } = await api.get('/subscriptions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (array of subscriptions) instead of wrapper
    return data.data || data;
  },

  // Unsubscribe from shop
  async unsubscribe(shopId, token) {
    const { data } = await api.delete(`/subscriptions/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data instead of wrapper
    return data.data || data;
  },

  // Get shop subscribers (shop owner only)
  async getShopSubscribers(shopId, token) {
    const { data } = await api.get(`/subscriptions/shop/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (object with subscribers array and count) instead of wrapper
    return data.data || data;
  },

  // Generate payment invoice for subscription (blockchain query - needs 60s timeout)
  async generateSubscriptionInvoice(subscriptionId, chain, token) {
    const { data } = await paymentAxios.post(
      `/subscriptions/${subscriptionId}/payment/generate`,
      { chain },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.invoice instead of wrapper
    return data.invoice || data.data || data;
  },

  // Get payment status for subscription (blockchain query - needs 60s timeout)
  async getSubscriptionPaymentStatus(subscriptionId, token) {
    const { data } = await paymentAxios.get(`/subscriptions/${subscriptionId}/payment/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.payment instead of wrapper
    return data.payment || data.data || data;
  },

  // Manual confirmation by tx hash (server verifies on-chain)
  async confirmSubscriptionPayment(subscriptionId, txHash, token) {
    const { data } = await paymentAxios.post(
      `/subscriptions/${subscriptionId}/payment/confirm`,
      { txHash },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },

  async generateUpgradeInvoice(subscriptionId, chain, token) {
    const { data } = await paymentAxios.post(
      `/subscriptions/${subscriptionId}/upgrade/payment/generate`,
      { chain },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.invoice || data.data || data;
  },

  async getUpgradePaymentStatus(subscriptionId, token) {
    const { data } = await paymentAxios.get(
      `/subscriptions/${subscriptionId}/upgrade/payment/status`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.payment || data.data || data;
  },

  async confirmUpgradePayment(subscriptionId, txHash, token) {
    const { data } = await paymentAxios.post(
      `/subscriptions/${subscriptionId}/upgrade/payment/confirm`,
      { txHash },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },

  // Create pending subscription (first-time shop creation)
  async createPending(tier, token) {
    const { data } = await api.post(
      '/subscriptions/pending',
      { tier },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.data instead of wrapper
    return data.data || data;
  },

  // Get subscription status for shop
  async getStatus(shopId, token) {
    const { data } = await api.get(`/subscriptions/status/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data instead of wrapper
    return data.data || data;
  },

  // Create CrystalPay invoice for subscription payment
  async createCrystalPayInvoice(subscriptionId, method, purpose, token) {
    const { data } = await api.post(
      `/payments/subscriptions/${subscriptionId}/invoice/crystalpay`,
      { method, purpose },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return invoice data
    return data.data || data;
  },

  // Get invoice status (for CrystalPay webhooks)
  async getInvoiceStatus(invoiceId, token) {
    const { data } = await api.get(`/invoices/${invoiceId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return status data
    return data.data || data;
  },
};

export const notificationApi = {
  async migrateChannel(shopId, newChannel, token) {
    const { data } = await api.post(
      '/notifications/migrate-channel',
      {
        shop_id: Number(shopId),
        new_channel: newChannel,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },
};

export const followApi = {
  // P1-BOT-004: Validate circular dependency
  async validateCircular(followerShopId, sourceShopId, token) {
    try {
      const { data } = await api.post(
        '/follows/validate-circular',
        {
          followerShopId: Number(followerShopId),
          sourceShopId: Number(sourceShopId),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return data.data || data;
    } catch (error) {
      // If endpoint doesn't exist yet, skip validation (backward compatible)
      if (error.response?.status === 404) {
        logger.warn('Circular validation endpoint not found, skipping validation');
        return { valid: true };
      }
      throw error;
    }
  },

  // Get my follows (HTTP - requires JWT token)
  async getMyFollows(shopId, token) {
    const { data } = await api.get('/follows/my', {
      params: { shopId },
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Get follow detail
  async getFollowDetail(followId, token) {
    const { data } = await api.get(`/follows/${followId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Get follow products (monitor/resell)
  async getFollowProducts(followId, token, params = {}) {
    const { data } = await api.get(`/follows/${followId}/products`, {
      params,
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Check follow limit (FREE tier = 2)
  async checkFollowLimit(shopId, token) {
    const { data } = await api.get('/follows/check-limit', {
      params: { shopId },
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Create follow
  async createFollow(followData, token) {
    const { data } = await api.post('/follows', followData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Update markup - supports both number (legacy) and object (new)
  async updateMarkup(followId, markupData, token) {
    // Backward compatible: if markupData is a number, treat as percentage
    const payload = typeof markupData === 'number'
      ? { markupPercentage: markupData, markupType: 'percentage' }
      : {
          markupType: markupData.markupType || 'percentage',
          markupPercentage: markupData.markupPercentage || 0,
          markupFixed: markupData.markupFixed || 0,
        };

    const { data } = await api.put(
      `/follows/${followId}/markup`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },

  // Switch mode (monitor ↔ resell)
  // Supports both old format (markupData as number) and new format (markupData as object)
  async switchMode(followId, mode, token, markupData = null) {
    const requestBody = { mode };

    if (markupData !== null) {
      if (typeof markupData === 'number') {
        // Old format: just a number (treated as percentage)
        requestBody.markupPercentage = Number(markupData);
        requestBody.markupType = 'percentage';
      } else {
        // New format: { markupType, markupPercentage, markupFixed }
        requestBody.markupType = markupData.markupType || 'percentage';
        requestBody.markupPercentage = markupData.markupPercentage || 0;
        requestBody.markupFixed = markupData.markupFixed || 0;
      }
    }

    const { data } = await api.put(`/follows/${followId}/mode`, requestBody, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Delete follow
  async deleteFollow(followId, token) {
    const { data } = await api.delete(`/follows/${followId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },
};

export const walletApi = {
  // Get shop wallets
  async getWallets(shopId, token) {
    const { data } = await api.get(`/shops/${shopId}/wallets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Update shop wallets
  async updateWallets(shopId, wallets, token) {
    const { data } = await api.put(`/shops/${shopId}/wallets`, wallets, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Generate QR code for wallet
  async generateQR(qrData, token) {
    const { data } = await api.post('/payments/qr', qrData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  },
};

// Export named api instance for testing
export { api };
export default api;
