import { useRef } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore';
import { refreshAuthToken, isTokenRefreshInitialized } from '../utils/tokenRefresh';
import { getApiBaseUrl } from '../utils/apiBase';

// Base API URL (can be moved to .env)
const API_BASE_URL = getApiBaseUrl();

/**
 * Hook for API calls with stable reference
 * Uses useRef pattern to return the SAME object on every render
 * @returns {Object} Object with API methods (stable reference)
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
            const errorCode = err.response?.data?.code;

            // USER_NOT_FOUND means DB was reset - clear token and force re-auth
            if (errorCode === 'USER_NOT_FOUND') {
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[useApi] 🔄 User not found in DB, clearing token and re-authenticating');
              }
              useStore.getState().setToken(null);
            }

            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log('[useApi] 🔄 Got 401, attempting token refresh for:', endpoint);
            }

            try {
              await refreshAuthToken();

              // Get fresh token after refresh
              const newToken = tokenGetter();

              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[useApi] ✅ Token refreshed, retrying request');
              }

              // Retry the request with new token (mark as retry to prevent infinite loop)
              const retryResponse = await makeRequest(newToken);
              return { data: retryResponse.data, error: null };
            } catch (refreshError) {
              if (import.meta.env.DEV) {
                console.error('[useApi] ❌ Token refresh failed:', {
                  error: refreshError.message,
                  endpoint,
                  hint: 'initData may have expired. Restart the app from Telegram.',
                });
              }
              // Token refresh failed - return user-friendly error
              return { data: null, error: 'Session expired. Please restart the app from Telegram.' };
            }
          }

          // Regular errors
          const apiError = err.response?.data;
          const errorMessage =
            apiError?.error || apiError?.message || err.message || 'An error occurred';
          return { data: null, error: errorMessage };
        }
      };

    // Create request function with token getter
    const request = createRequest(getToken);

    // Create stable API methods - these functions are NEVER recreated
    apiRef.current = {
      // GET request
      get: async (endpoint, config = {}) => {
        return await request('GET', endpoint, null, config);
      },

      // POST request
      post: async (endpoint, data, config = {}) => {
        return await request('POST', endpoint, data, config);
      },

      // PUT request
      put: async (endpoint, data, config = {}) => {
        return await request('PUT', endpoint, data, config);
      },

      // DELETE request
      delete: async (endpoint, config = {}) => {
        return await request('DELETE', endpoint, null, config);
      },

      // PATCH request
      patch: async (endpoint, data, config = {}) => {
        return await request('PATCH', endpoint, data, config);
      },

      // Universal fetchApi wrapper (for compatibility with Settings modals)
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

        // Return only data (for compatibility with fetch API)
        if (result.error) {
          throw new Error(result.error);
        }
        return result.data;
      },
    };
  }

  // Return SAME reference every time - this is the key feature
  return apiRef.current;
}

/**
 * Hook for specific API endpoints
 */
export function useShopApi() {
  const api = useApi();

  // Use useRef for stable methods reference
  const methodsRef = useRef(null);
  const combinedRef = useRef(null); // FIX: stable combined reference

  if (!methodsRef.current) {
    methodsRef.current = {
      // Get list of shops
      getShops: async () => {
        return await api.get('/shops');
      },

      // Get shop by ID
      getShop: async (shopId) => {
        return await api.get(`/shops/${shopId}`);
      },

      // Get shop products
      getShopProducts: async (shopId) => {
        return await api.get(`/shops/${shopId}/products`);
      },

      // Get user subscriptions
      getSubscriptions: async () => {
        return await api.get('/subscriptions');
      },

      // Create order
      createOrder: async (orderData) => {
        return await api.post('/orders', orderData);
      },

      // Confirm payment (submit transaction hash)
      confirmPayment: async (orderId, paymentData) => {
        return await api.post(`/orders/${orderId}/submit-payment`, paymentData);
      },

      // Get user orders
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
 * Hook for follows API
 */
export function useFollowsApi() {
  const api = useApi();

  // Use useRef for stable methods reference
  const methodsRef = useRef(null);
  const combinedRef = useRef(null); // FIX: stable combined reference

  if (!methodsRef.current) {
    methodsRef.current = {
      // Follow details
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

      // Follow products
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

      // Update markup
      updateMarkup: async (followId, markupData) => {
        // Support both old (number) and new (object) format for backward compatibility
        const payload = typeof markupData === 'number'
          ? { markupPercentage: markupData, markupType: 'percentage' }
          : {
              markupType: markupData.markupType || 'percentage',
              markupPercentage: markupData.markupPercentage || 0,
              markupFixed: markupData.markupFixed || 0,
            };
        const response = await api.put(`/follows/${followId}/markup`, payload);
        if (response.error) {
          if (import.meta.env.DEV) {
            console.error('Error updating markup:', response.error);
          }
          throw new Error(response.error);
        }
        return response;
      },

      // Switch mode
      switchMode: async (followId, mode, markupData = null) => {
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
        if (response.error) {
          if (import.meta.env.DEV) {
            console.error('Error switching mode:', response.error);
          }
          throw new Error(response.error);
        }
        return response;
      },

      // Delete follow
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

      // Per-product markup: set individual product markup
      updateProductMarkup: async (followId, productId, markupData) => {
        const payload = {
          markupType: markupData.markupType || 'percentage',
          markupPercentage: markupData.markupPercentage || 0,
          markupFixed: markupData.markupFixed || 0,
        };
        const response = await api.put(`/follows/${followId}/products/${productId}/markup`, payload);
        if (response.error) {
          if (import.meta.env.DEV) {
            console.error('Error updating product markup:', response.error);
          }
          throw new Error(response.error);
        }
        return response;
      },

      // Per-product markup: reset product markup to global
      resetProductMarkup: async (followId, productId) => {
        const response = await api.delete(`/follows/${followId}/products/${productId}/markup`);
        if (response.error) {
          if (import.meta.env.DEV) {
            console.error('Error resetting product markup:', response.error);
          }
          throw new Error(response.error);
        }
        return response;
      },
    };
  }

  // ✅ FIX: Create combined object ONCE to prevent infinite re-renders
  if (!combinedRef.current) {
    combinedRef.current = { ...api, ...methodsRef.current };
  }

  return combinedRef.current;
}
