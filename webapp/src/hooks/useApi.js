import { useRef } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore';
import { refreshAuthToken, isTokenRefreshInitialized } from '../utils/tokenRefresh';
import { getApiBaseUrl } from '../utils/apiBase';

// Базовый URL API (можно вынести в .env)
const API_BASE_URL = getApiBaseUrl();

/**
 * Hook для API вызовов с stable reference
 * Использует useRef pattern чтобы возвращать ОДИНАКОВЫЙ объект на каждый render
 * @returns {Object} Объект с методами API (stable reference)
 */
export function useApi() {
  // Create stable API reference with useRef
  const apiRef = useRef(null);

  // Initialize only once
  if (!apiRef.current) {
    // Token getter that always returns current token from store
    const getToken = () => useStore.getState().token;

    // Create request function with token getter closure
    const createRequest =
      (tokenGetter) =>
      async (method, endpoint, data = null, config = {}) => {
        // Track retry attempt to prevent infinite loops
        const isRetry = config._isRetryAfter401 || false;

        // Helper function to make the actual request
        const makeRequest = async (currentToken) => {
          const initData = window.Telegram?.WebApp?.initData || '';

          const axiosConfig = {
            method,
            url: `${API_BASE_URL}${endpoint}`,
            headers: {
              'Content-Type': 'application/json',
              'X-Telegram-Init-Data': initData,
              ...(currentToken && { Authorization: `Bearer ${currentToken}` }),
              ...config.headers,
            },
            timeout: config.timeout || 15000,
            signal: config.signal,
            ...config,
          };

          // Remove internal flag from config
          delete axiosConfig._isRetryAfter401;

          if (method !== 'GET' && method !== 'DELETE' && data !== null) {
            axiosConfig.data = data;
          }

          return await axios(axiosConfig);
        };

        try {
          const currentToken = tokenGetter();
          const response = await makeRequest(currentToken);
          return { data: response.data, error: null };
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error(`API ${method} ${endpoint} error:`, err);
          }

          // Handle axios native timeout
          if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
            return { data: null, error: 'Request timeout - please check your connection' };
          }

          // Handle external AbortSignal (from useEffect cleanup)
          if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
            return { data: null, error: 'Request cancelled' };
          }

          // Handle 401 Unauthorized - attempt token refresh and retry ONCE
          if (err.response?.status === 401 && !isRetry && isTokenRefreshInitialized()) {
            // Token refresh flow (debug via browser devtools)

            try {
              await refreshAuthToken();

              // Get fresh token after refresh
              const newToken = tokenGetter();

              // Retry the request with new token (mark as retry to prevent infinite loop)
              const retryResponse = await makeRequest(newToken);
              return { data: retryResponse.data, error: null };
            } catch (refreshError) {
              if (import.meta.env.DEV) {
                console.error('[useApi] Token refresh failed:', refreshError);
              }
              // Token refresh failed - return original 401 error
              return { data: null, error: 'Session expired. Please restart the app.' };
            }
          }

          // Regular errors
          const apiError = err.response?.data;
          const errorMessage =
            apiError?.error || apiError?.message || err.message || 'Произошла ошибка';
          return { data: null, error: errorMessage };
        }
      };

    // Create request function with token getter
    const request = createRequest(getToken);

    // Create stable API methods - эти функции НИКОГДА не пересоздаются
    apiRef.current = {
      // GET запрос
      get: async (endpoint, config = {}) => {
        return await request('GET', endpoint, null, config);
      },

      // POST запрос
      post: async (endpoint, data, config = {}) => {
        return await request('POST', endpoint, data, config);
      },

      // PUT запрос
      put: async (endpoint, data, config = {}) => {
        return await request('PUT', endpoint, data, config);
      },

      // DELETE запрос
      delete: async (endpoint, config = {}) => {
        return await request('DELETE', endpoint, null, config);
      },

      // PATCH запрос
      patch: async (endpoint, data, config = {}) => {
        return await request('PATCH', endpoint, data, config);
      },

      // Универсальный fetchApi wrapper (для совместимости с Settings modals)
      fetchApi: async (endpoint, options = {}) => {
        const method = options.method?.toUpperCase() || 'GET';
        const data = options.body || null;
        const config = { ...options };
        delete config.method;
        delete config.body;

        let result;
        switch (method) {
          case 'GET':
            result = await apiRef.current.get(endpoint, config);
            break;
          case 'POST':
            result = await apiRef.current.post(endpoint, data, config);
            break;
          case 'PUT':
            result = await apiRef.current.put(endpoint, data, config);
            break;
          case 'DELETE':
            result = await apiRef.current.delete(endpoint, config);
            break;
          case 'PATCH':
            result = await apiRef.current.patch(endpoint, data, config);
            break;
          default:
            throw new Error(`Unsupported HTTP method: ${method}`);
        }

        // Возвращаем только data (для совместимости с fetch API)
        if (result.error) {
          throw new Error(result.error);
        }
        return result.data;
      },
    };
  }

  // Return SAME reference every time - это ключевая фича
  return apiRef.current;
}

/**
 * Hook для конкретных API endpoints
 */
export function useShopApi() {
  const api = useApi();

  // Используем useRef для stable methods reference
  const methodsRef = useRef(null);
  const combinedRef = useRef(null); // ✅ FIX: stable combined reference

  if (!methodsRef.current) {
    methodsRef.current = {
      // Получить список магазинов
      getShops: async () => {
        return await api.get('/shops');
      },

      // Получить магазин по ID
      getShop: async (shopId) => {
        return await api.get(`/shops/${shopId}`);
      },

      // Получить товары магазина
      getShopProducts: async (shopId) => {
        return await api.get(`/shops/${shopId}/products`);
      },

      // Получить подписки пользователя
      getSubscriptions: async () => {
        return await api.get('/subscriptions');
      },

      // Создать заказ
      createOrder: async (orderData) => {
        return await api.post('/orders', orderData);
      },

      // Подтвердить оплату (submit transaction hash)
      confirmPayment: async (orderId, paymentData) => {
        return await api.post(`/orders/${orderId}/submit-payment`, paymentData);
      },

      // Получить заказы пользователя
      getMyOrders: async () => {
        return await api.get('/orders/my');
      },
    };
  }

  // ✅ FIX: Create combined object ONCE to prevent infinite re-renders
  if (!combinedRef.current) {
    combinedRef.current = { ...api, ...methodsRef.current };
  }

  return combinedRef.current;
}

/**
 * Hook для API follows
 */
export function useFollowsApi() {
  const api = useApi();

  // Используем useRef для stable methods reference
  const methodsRef = useRef(null);
  const combinedRef = useRef(null); // ✅ FIX: stable combined reference

  if (!methodsRef.current) {
    methodsRef.current = {
      // Детали подписки
      getDetail: async (followId, options = {}) => {
        const response = await api.get(`/follows/${followId}`, { signal: options.signal });
        // api.get returns { data, error } - check for errors
        if (response.error) {
          if (import.meta.env.DEV) {
            console.error('Error getting follow detail:', response.error);
          }
          return { error: response.error };
        }
        return response;
      },

      // Товары подписки
      getProducts: async (followId, options = {}) => {
        const { signal, ...params } = options;
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `/follows/${followId}/products?${queryString}` : `/follows/${followId}/products`;
        const response = await api.get(url, { signal });
        // api.get returns { data, error } - check for errors
        if (response.error) {
          if (import.meta.env.DEV) {
            console.error('Error getting follow products:', response.error);
          }
          return { error: response.error };
        }
        return response;
      },

      // Изменить наценку
      updateMarkup: async (followId, markupData) => {
        try {
          // Support both old (number) and new (object) format for backward compatibility
          const payload = typeof markupData === 'number' 
            ? { markupPercentage: markupData, markupType: 'percentage' }
            : {
                markupType: markupData.markupType || 'percentage',
                markupPercentage: markupData.markupPercentage || 0,
                markupFixed: markupData.markupFixed || 0,
              };
          const response = await api.put(`/follows/${followId}/markup`, payload);
          return response.data;
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('Error updating markup:', error);
          }
          throw error;
        }
      },

      // Сменить режим
      switchMode: async (followId, mode, markupData = null) => {
        try {
          const body = { mode };
          
          // Support both old (number) and new (object) format for backward compatibility
          if (markupData !== null) {
            if (typeof markupData === 'number') {
              // Old format: just markupPercentage
              body.markupPercentage = markupData;
              body.markupType = 'percentage';
            } else {
              // New format: { markupType, markupPercentage, markupFixed }
              body.markupType = markupData.markupType || 'percentage';
              body.markupPercentage = markupData.markupPercentage || 0;
              body.markupFixed = markupData.markupFixed || 0;
            }
          }
          
          const response = await api.put(`/follows/${followId}/mode`, body);
          return response.data;
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('Error switching mode:', error);
          }
          throw error;
        }
      },

      // Удалить подписку
      deleteFollow: async (followId) => {
        try {
          await api.delete(`/follows/${followId}`);
          return { success: true };
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('Error deleting follow:', error);
          }
          throw error;
        }
      },

      // Per-product markup: установить индивидуальную наценку на товар
      updateProductMarkup: async (followId, productId, markupData) => {
        try {
          const payload = {
            markupType: markupData.markupType || 'percentage',
            markupPercentage: markupData.markupPercentage || 0,
            markupFixed: markupData.markupFixed || 0,
          };
          const response = await api.put(`/follows/${followId}/products/${productId}/markup`, payload);
          return response.data;
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('Error updating product markup:', error);
          }
          throw error;
        }
      },

      // Per-product markup: сбросить наценку товара к глобальной
      resetProductMarkup: async (followId, productId) => {
        try {
          const response = await api.delete(`/follows/${followId}/products/${productId}/markup`);
          return response.data;
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('Error resetting product markup:', error);
          }
          throw error;
        }
      },
    };
  }

  // ✅ FIX: Create combined object ONCE to prevent infinite re-renders
  if (!combinedRef.current) {
    combinedRef.current = { ...api, ...methodsRef.current };
  }

  return combinedRef.current;
}
