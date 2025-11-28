import axios from 'axios';
import dotenv from 'dotenv';

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

      console.warn(
        `🔄 Retry ${config.retryCount}/3 for ${config.method?.toUpperCase()} ${config.url} ` +
          `(delay: ${delay}ms)`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient.request(config);
    }

    // Error logging
    if (error.response) {
      // Server responded with error status
      console.error('API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      // Request was made but no response received
      console.error('Network Error: No response from server');
    } else {
      // Something else happened
      console.error('Request Error:', error.message);
    }

    return Promise.reject(error);
  }
);

// User API functions
export async function createUser(telegramId, username, firstName, role) {
  try {
    const response = await apiClient.post('/api/users', {
      telegramId: telegramId.toString(),
      username,
      firstName,
      role, // 'buyer' or 'seller'
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || 'Ошибка создания пользователя',
    };
  }
}

export async function getUser(telegramId) {
  try {
    const response = await apiClient.get(`/api/users/telegram/${telegramId}`);
    return { success: true, data: response.data };
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

export async function updateUser(telegramId, updates) {
  try {
    const response = await apiClient.patch(`/api/users/telegram/${telegramId}`, updates);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || 'Ошибка обновления пользователя',
    };
  }
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
  try {
    const response = await apiClient.get(`/api/shops/owner/${telegramId}`);
    return { success: true, data: response.data };
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
    const response = await apiClient.get(`/api/products/shop/${shopId}`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка получения товаров' };
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
export async function getOrdersByShop(shopId) {
  try {
    const response = await apiClient.get(`/api/orders/shop/${shopId}`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка получения заказов' };
  }
}

export async function getOrdersByBuyer(telegramId) {
  try {
    const response = await apiClient.get(`/api/orders/buyer/${telegramId}`);
    return { success: true, data: response.data };
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
  try {
    const response = await apiClient.post('/api/subscriptions', {
      telegramId: telegramId.toString(),
      shopId,
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка подписки на магазин' };
  }
}

export async function getSubscriptions(telegramId) {
  try {
    const response = await apiClient.get(`/api/subscriptions/${telegramId}`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка получения подписок' };
  }
}

export async function unsubscribeFromShop(telegramId, shopId) {
  try {
    const response = await apiClient.delete(`/api/subscriptions/${telegramId}/${shopId}`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Ошибка отписки от магазина' };
  }
}

export default apiClient;
