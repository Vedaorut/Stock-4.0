import axios from 'axios';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 10000;

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: BACKEND_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
apiClient.interceptors.request.use(
  (config) => {
    // Token will be added per request if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor with retry logic and error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Retry logic for network errors and 5xx server errors
    const shouldRetry = !error.response || error.response.status >= 500;
    const retryCount = config.retryCount || 0;

    if (shouldRetry && retryCount < 3) {
      config.retryCount = retryCount + 1;

      // Exponential backoff: 100ms, 300ms, 900ms
      const delays = [100, 300, 900];
      const delay = delays[retryCount] || 900;

      logger.warn(
        `🔄 Retry ${config.retryCount}/3 for ${config.method?.toUpperCase()} ${config.url} ` +
          `(delay: ${delay}ms)`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient.request(config);
    }

    // Error logging
    if (error.response) {
      // Server responded with error status
      logger.error('API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      // Request was made but no response received
      logger.error('Network Error: No response from server');
    } else {
      // Something else happened
      logger.error('Request Error:', error.message);
    }

    return Promise.reject(error);
  }
);

// User API functions
// NOTE: These functions use internal API for bot-to-backend trusted auth
// The /api/users/* endpoints don't exist - use /api/internal/auth/bot-register instead
import crypto from 'crypto';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
const BOT_TOKEN = process.env.BOT_TOKEN;

export async function createUser(telegramId, username, firstName, _role) {
  // DEPRECATED: Use authApi.authenticate from bot/src/utils/api.js instead
  // This function now uses internal auth endpoint
  try {
    if (!INTERNAL_SECRET || !BOT_TOKEN) {
      throw new Error('INTERNAL_SECRET and BOT_TOKEN required for bot auth');
    }

    const requestBody = {
      telegramId: parseInt(telegramId, 10),
      username: username || null,
      firstName: firstName || null,
    };

    const timestamp = Date.now().toString();
    const payload = JSON.stringify(requestBody) + timestamp;
    const signature = crypto
      .createHmac('sha256', BOT_TOKEN)
      .update(payload)
      .digest('hex');

    const response = await apiClient.post('/api/internal/auth/bot-register', requestBody, {
      headers: {
        'x-internal-secret': INTERNAL_SECRET,
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      },
    });
    return { success: true, data: response.data.user || response.data, token: response.data.token };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || 'Ошибка создания пользователя',
    };
  }
}

export async function getUser(telegramId) {
  // DEPRECATED: Use authApi.authenticate from bot/src/utils/api.js instead
  // This function now uses internal auth endpoint (registers if not exists, returns existing user otherwise)
  try {
    if (!INTERNAL_SECRET || !BOT_TOKEN) {
      throw new Error('INTERNAL_SECRET and BOT_TOKEN required for bot auth');
    }

    const requestBody = {
      telegramId: parseInt(telegramId, 10),
    };

    const timestamp = Date.now().toString();
    const payload = JSON.stringify(requestBody) + timestamp;
    const signature = crypto
      .createHmac('sha256', BOT_TOKEN)
      .update(payload)
      .digest('hex');

    const response = await apiClient.post('/api/internal/auth/bot-register', requestBody, {
      headers: {
        'x-internal-secret': INTERNAL_SECRET,
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      },
    });
    return { success: true, data: response.data.user || response.data };
  } catch (error) {
    if (error.response?.status === 404) {
      return { success: false, notFound: true };
    }
    return {
      success: false,
      error: error.response?.data?.message || 'Ошибка получения данных пользователя',
    };
  }
}

export async function updateUser(_telegramId, _updates) {
  // DEPRECATED: User updates should be done via JWT-authenticated endpoints
  // This function is no longer supported - /api/users/* doesn't exist
  logger.warn('updateUser() is deprecated - use authApi.updateRole() with JWT token instead');
  return {
    success: false,
    error: 'updateUser is deprecated. Use authApi.updateRole() with JWT token.',
  };
}

// Shop API functions
export async function createShop(telegramId, shopName, paymentHash) {
  try {
    const response = await apiClient.post('/api/shops', {
      telegramId: telegramId.toString(),
      name: shopName,
      paymentHash,
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка создания магазина' };
  }
}

export async function getShopByOwner(telegramId) {
  // DEPRECATED: /api/shops/owner/:telegramId doesn't exist
  // Now uses internal auth to get token, then /shops/my
  try {
    if (!INTERNAL_SECRET || !BOT_TOKEN) {
      throw new Error('INTERNAL_SECRET and BOT_TOKEN required for bot auth');
    }

    // First authenticate to get JWT token
    const requestBody = { telegramId: parseInt(telegramId, 10) };
    const timestamp = Date.now().toString();
    const payload = JSON.stringify(requestBody) + timestamp;
    const signature = crypto
      .createHmac('sha256', BOT_TOKEN)
      .update(payload)
      .digest('hex');

    const authResponse = await apiClient.post('/api/internal/auth/bot-register', requestBody, {
      headers: {
        'x-internal-secret': INTERNAL_SECRET,
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      },
    });

    const token = authResponse.data.token;
    if (!token) {
      return { success: false, error: 'Failed to get auth token' };
    }

    // Now get user's shops with the token
    const response = await apiClient.get('/api/shops/my', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const shops = response.data.data || response.data;
    if (Array.isArray(shops) && shops.length > 0) {
      return { success: true, data: shops[0] }; // Return first shop
    }
    return { success: false, notFound: true };
  } catch (error) {
    if (error.response?.status === 404) {
      return { success: false, notFound: true };
    }
    return { success: false, error: error.response?.data?.message || 'Ошибка получения магазина' };
  }
}

export async function getShopByName(shopName) {
  try {
    const response = await apiClient.get(`/api/shops/search?name=${encodeURIComponent(shopName)}`);
    return { success: true, data: response.data };
  } catch (error) {
    if (error.response?.status === 404) {
      return { success: false, notFound: true };
    }
    return { success: false, error: error.response?.data?.message || 'Магазин не найден' };
  }
}

export async function getShopById(shopId) {
  try {
    const response = await apiClient.get(`/api/shops/${shopId}`);
    return { success: true, data: response.data };
  } catch (error) {
    if (error.response?.status === 404) {
      return { success: false, notFound: true };
    }
    return { success: false, error: error.response?.data?.message || 'Магазин не найден' };
  }
}

export async function updateShop(shopId, updates) {
  try {
    const response = await apiClient.patch(`/api/shops/${shopId}`, updates);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка обновления магазина' };
  }
}

// Product API functions
export async function createProduct(shopId, productData) {
  try {
    const response = await apiClient.post('/api/products', {
      shopId,
      ...productData,
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка добавления товара' };
  }
}

export async function getProducts(shopId) {
  try {
    // Fixed: /api/products/shop/:shopId doesn't exist, use /api/products?shopId=
    const response = await apiClient.get('/api/products', {
      params: { shopId },
    });
    const products = response.data.data || response.data;
    return { success: true, data: Array.isArray(products) ? products : [] };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка получения товаров' };
  }
}

export async function getProductById(productId) {
  try {
    const response = await apiClient.get(`/api/products/${productId}`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка получения товара' };
  }
}

export async function updateProduct(productId, updates) {
  try {
    const response = await apiClient.patch(`/api/products/${productId}`, updates);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка обновления товара' };
  }
}

export async function deleteProduct(productId) {
  try {
    const response = await apiClient.delete(`/api/products/${productId}`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка удаления товара' };
  }
}

// Order API functions
// NOTE: Order endpoints require JWT authentication. Legacy handlers without tokens
// must first authenticate via internal API to get a token.

/**
 * Helper to get auth token for telegramId (used by legacy handlers)
 */
async function getAuthToken(telegramId) {
  if (!INTERNAL_SECRET || !BOT_TOKEN) {
    throw new Error('INTERNAL_SECRET and BOT_TOKEN required');
  }

  const requestBody = { telegramId: parseInt(telegramId, 10) };
  const timestamp = Date.now().toString();
  const payload = JSON.stringify(requestBody) + timestamp;
  const signature = crypto
    .createHmac('sha256', BOT_TOKEN)
    .update(payload)
    .digest('hex');

  const authResponse = await apiClient.post('/api/internal/auth/bot-register', requestBody, {
    headers: {
      'x-internal-secret': INTERNAL_SECRET,
      'x-internal-timestamp': timestamp,
      'x-internal-signature': signature,
    },
  });

  return authResponse.data.token;
}

export async function getOrdersByShop(shopId, telegramId = null) {
  // Fixed: /api/orders/shop/:shopId doesn't exist, use /api/shops/:shopId/orders (requires auth)
  // If telegramId provided, we can authenticate; otherwise this will fail
  try {
    if (!telegramId) {
      // Without telegramId we can't authenticate - return deprecation error
      logger.warn('getOrdersByShop called without telegramId - requires authentication');
      return { success: false, error: 'Authentication required. Pass telegramId parameter.' };
    }

    const token = await getAuthToken(telegramId);
    if (!token) {
      return { success: false, error: 'Failed to get auth token' };
    }

    const response = await apiClient.get(`/api/shops/${shopId}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const payload = response.data.data || response.data;
    const orders = Array.isArray(payload?.orders) ? payload.orders : (Array.isArray(payload) ? payload : []);
    return { success: true, data: orders };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка получения заказов' };
  }
}

export async function getOrdersByBuyer(telegramId) {
  // Fixed: /api/orders/buyer/:telegramId doesn't exist, use /api/orders/my (requires auth)
  try {
    const token = await getAuthToken(telegramId);
    if (!token) {
      return { success: false, error: 'Failed to get auth token' };
    }

    const response = await apiClient.get('/api/orders/my', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const orders = response.data.data || response.data;
    return { success: true, data: Array.isArray(orders) ? orders : [] };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка получения заказов' };
  }
}

export async function updateOrderStatus(orderId, status) {
  try {
    const response = await apiClient.patch(`/api/orders/${orderId}/status`, { status });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || 'Ошибка обновления статуса заказа',
    };
  }
}

// Subscription API functions
export async function subscribeToShop(telegramId, shopId) {
  // Fixed: Subscription endpoint requires JWT auth
  try {
    const token = await getAuthToken(telegramId);
    if (!token) {
      return { success: false, error: 'Failed to get auth token' };
    }

    const response = await apiClient.post('/api/subscriptions', {
      shopId: Number(shopId),
      telegramId: String(telegramId), // Still pass for backward compat
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { success: true, data: response.data.data || response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка подписки на магазин' };
  }
}

export async function getSubscriptions(telegramId) {
  try {
    const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
    if (!INTERNAL_SECRET) {
      throw new Error('INTERNAL_SECRET not configured');
    }

    const response = await apiClient.get(`/api/internal/subscriptions/${telegramId}`, {
      headers: {
        'x-internal-secret': INTERNAL_SECRET,
      },
    });

    // Transform response to match expected format: sub.shop.id, sub.shop.name, sub.shopId
    const rawData = response.data.data || [];
    const transformedData = rawData.map((sub) => ({
      id: sub.id,
      shopId: sub.shop_id,
      shop: {
        id: sub.shop_id,
        name: sub.shop_name,
        logo: sub.shop_logo,
        description: sub.shop_description,
      },
      createdAt: sub.created_at,
    }));

    return { success: true, data: transformedData };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка получения подписок' };
  }
}

export async function unsubscribeFromShop(telegramId, shopId) {
  // Fixed: /api/subscriptions/:telegramId/:shopId doesn't exist
  // Use /api/subscriptions/:shopId with JWT auth instead
  try {
    const token = await getAuthToken(telegramId);
    if (!token) {
      return { success: false, error: 'Failed to get auth token' };
    }

    const response = await apiClient.delete(`/api/subscriptions/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { success: true, data: response.data.data || response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка отписки от магазина' };
  }
}

export default apiClient;
