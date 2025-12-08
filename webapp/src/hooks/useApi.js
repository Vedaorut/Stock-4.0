import { useRef } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore';
import { refreshAuthToken, isTokenRefreshInitialized } from '../utils/tokenRefresh';
import { getApiBaseUrl } from '../utils/apiBase';
import { mockApi } from '../mock/api'; // Import mock adapter

// Base API URL (can be moved to .env)
const API_BASE_URL = getApiBaseUrl();

// ============================================
// P1 FIX: Token Refresh Singleton
// Prevents race condition when multiple 401s trigger parallel refresh attempts
// ============================================
let isRefreshing = false;
let refreshSubscribers = [];

/**
 * Subscribe to token refresh completion
 * @param {Function} callback - Called with new token when refresh completes
 */
function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback);
}

/**
 * Notify all subscribers that token has been refreshed
 * @param {string|null} token - New token or null if refresh failed
 * @param {Error|null} error - Error if refresh failed
 */
function onTokenRefreshed(token, error = null) {
  refreshSubscribers.forEach((callback) => callback(token, error));
  refreshSubscribers = [];
}

// ============================================
// API Response Cache
// ============================================
const apiCache = new Map();
const MAX_CACHE_SIZE = 100;

/**
 * Set cache with LRU limit
 * @param {string} key - Cache key
 * @param {object} value - Value to cache
 */
function setCacheWithLimit(key, value) {
  // Prune expired entries first
  const now = Date.now();
  for (const [k, v] of apiCache.entries()) {
    if (now > v.expiry) {
      apiCache.delete(k);
    }
  }

  // If still over limit, remove oldest
  if (apiCache.size >= MAX_CACHE_SIZE) {
    const firstKey = apiCache.keys().next().value;
    apiCache.delete(firstKey);
  }

  apiCache.set(key, value);
}

const CACHE_TTL = {
  '/shops/my': 5 * 60 * 1000,      // 5 minutes
  '/shops/': 5 * 60 * 1000,         // 5 minutes for shop details
  '/products': 2 * 60 * 1000,       // 2 minutes
  '/follows': 3 * 60 * 1000,        // 3 minutes
  '/orders': 1 * 60 * 1000,         // 1 minute
  default: 60 * 1000                 // 1 minute default
};

function getCacheKey(method, endpoint) {
  return `${method}:${endpoint}`;
}

function getCacheTTL(endpoint) {
  for (const [pattern, ttl] of Object.entries(CACHE_TTL)) {
    if (pattern !== 'default' && endpoint.startsWith(pattern)) {
      return ttl;
    }
  }
  return CACHE_TTL.default;
}

function shouldCache(method) {
  return method === 'GET';
}

/**
 * Invalidate cache entries matching a pattern
 * @param {string|null} pattern - Pattern to match (null clears all)
 */
export function invalidateCache(pattern = null) {
  if (pattern) {
    for (const key of apiCache.keys()) {
      if (key.includes(pattern)) {
        apiCache.delete(key);
      }
    }
  } else {
    apiCache.clear();
  }
}

// Demo mode flag
const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

// ============================================
// FIX BUG-WEBAPP-006: Retry Configuration
// ============================================
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  retryableCodes: ['ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT'],
  retryableStatuses: [502, 503, 504, 408], // Bad Gateway, Service Unavailable, Gateway Timeout, Request Timeout
};

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
function getRetryDelay(attempt) {
  const exponentialDelay = RETRY_CONFIG.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 200; // Add 0-200ms jitter
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelay);
}

/**
 * Check if error is retryable
 * @param {Error} error - Axios error
 * @returns {boolean}
 */
function isRetryableError(error) {
  // Network errors
  if (RETRY_CONFIG.retryableCodes.includes(error.code)) {
    return true;
  }
  // Server errors (5xx)
  if (error.response && RETRY_CONFIG.retryableStatuses.includes(error.response.status)) {
    return true;
  }
  // Offline detection
  if (!navigator.onLine) {
    return true;
  }
  return false;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

          // DEMO MODE INTERCEPTION
          if (IS_DEMO_MODE) {
            // eslint-disable-next-line no-console
            console.log(`[DemoMode] Intercepting ${method} ${endpoint}`);
            const apiMethod = mockApi[method.toLowerCase()];
            if (apiMethod) {
              return await apiMethod(endpoint, data);
            }
            return { error: 'Method not implemented in mock' };
          }

          // Check cache for GET requests
          const cacheKey = getCacheKey(method, endpoint);
          if (shouldCache(method)) {
            const cached = apiCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < getCacheTTL(endpoint)) {
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log(`[Cache] HIT for ${endpoint}`);
              }
              return { data: cached.data, error: null };
            }
          }

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

          // FIX BUG-WEBAPP-006: Request with retry logic
          const retryCount = config._retryCount || 0;

          try {
            const currentToken = tokenGetter();
            const response = await makeRequest(currentToken);

            // Cache successful GET responses
            if (shouldCache(method)) {
              setCacheWithLimit(cacheKey, {
                data: response.data,
                timestamp: Date.now(),
                expiry: Date.now() + getCacheTTL(endpoint)
              });
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log(`[Cache] STORED ${endpoint}`);
              }
            }

            return { data: response.data, error: null };
          } catch (err) {
            if (import.meta.env.DEV) {
              console.error(`API ${method} ${endpoint} error:`, err);
            }

            // Handle external AbortSignal (from useEffect cleanup) - don't retry
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
              return { data: null, error: 'Request cancelled' };
            }

            // FIX BUG-WEBAPP-006: Retry logic for network/server errors
            if (isRetryableError(err) && retryCount < RETRY_CONFIG.maxRetries) {
              const delay = getRetryDelay(retryCount);
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log(`[useApi] Retrying ${method} ${endpoint} (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries}) in ${delay}ms`);
              }

              // Wait before retry
              await sleep(delay);

              // Recursive call with incremented retry count
              return createRequest(tokenGetter)(method, endpoint, data, {
                ...config,
                _retryCount: retryCount + 1,
              });
            }

            // Handle axios native timeout (after retries exhausted)
            if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
              return { data: null, error: 'Request timeout - please check your connection and try again' };
            }

            // Handle 401 Unauthorized - attempt token refresh and retry ONCE
            // P1 FIX: Use singleton to prevent parallel refresh attempts
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

              // P1 FIX: If already refreshing, wait for completion instead of starting new refresh
              if (isRefreshing) {
                if (import.meta.env.DEV) {
                  // eslint-disable-next-line no-console
                  console.log('[useApi] ⏳ Token refresh in progress, waiting...', endpoint);
                }

                // Wait for ongoing refresh to complete
                return new Promise((resolve) => {
                  subscribeTokenRefresh((newToken, refreshError) => {
                    if (refreshError || !newToken) {
                      resolve({ data: null, error: 'Session expired. Please restart the app from Telegram.' });
                      return;
                    }

                    // Retry with new token
                    makeRequest(newToken)
                      .then((retryResponse) => {
                        if (shouldCache(method)) {
                          setCacheWithLimit(cacheKey, {
                            data: retryResponse.data,
                            timestamp: Date.now(),
                            expiry: Date.now() + getCacheTTL(endpoint)
                          });
                        }
                        resolve({ data: retryResponse.data, error: null });
                      })
                      .catch((retryErr) => {
                        const apiError = retryErr.response?.data;
                        const errorMessage = apiError?.error || apiError?.message || retryErr.message || 'An error occurred';
                        resolve({ data: null, error: errorMessage });
                      });
                  });
                });
              }

              // Start refresh process
              isRefreshing = true;

              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[useApi] 🔄 Got 401, starting token refresh for:', endpoint);
              }

              try {
                await refreshAuthToken();

                // Get fresh token after refresh
                const newToken = tokenGetter();

                if (import.meta.env.DEV) {
                  // eslint-disable-next-line no-console
                  console.log('[useApi] ✅ Token refreshed, notifying subscribers');
                }

                // Notify waiting requests
                onTokenRefreshed(newToken, null);
                isRefreshing = false;

                // Retry the request with new token (mark as retry to prevent infinite loop)
                const retryResponse = await makeRequest(newToken);

                // Cache successful GET responses after retry
                if (shouldCache(method)) {
                  setCacheWithLimit(cacheKey, {
                    data: retryResponse.data,
                    timestamp: Date.now(),
                    expiry: Date.now() + getCacheTTL(endpoint)
                  });
                }

                return { data: retryResponse.data, error: null };
              } catch (refreshError) {
                if (import.meta.env.DEV) {
                  console.error('[useApi] ❌ Token refresh failed:', {
                    error: refreshError.message,
                    endpoint,
                    hint: 'initData may have expired. Restart the app from Telegram.',
                  });
                }

                // Notify waiting requests about failure
                onTokenRefreshed(null, refreshError);
                isRefreshing = false;

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

      // POST request - invalidates cache on success
      post: async (endpoint, data, config = {}) => {
        const result = await request('POST', endpoint, data, config);
        if (!result.error) {
          // Invalidate related cache entries
          const basePath = '/' + endpoint.split('/')[1]; // e.g., /orders -> /orders
          invalidateCache(basePath);
        }
        return result;
      },

      // PUT request - invalidates cache on success
      put: async (endpoint, data, config = {}) => {
        const result = await request('PUT', endpoint, data, config);
        if (!result.error) {
          const basePath = '/' + endpoint.split('/')[1];
          invalidateCache(basePath);
        }
        return result;
      },

      // DELETE request - invalidates cache on success
      delete: async (endpoint, config = {}) => {
        const result = await request('DELETE', endpoint, null, config);
        if (!result.error) {
          const basePath = '/' + endpoint.split('/')[1];
          invalidateCache(basePath);
        }
        return result;
      },

      // PATCH request - invalidates cache on success
      patch: async (endpoint, data, config = {}) => {
        const result = await request('PATCH', endpoint, data, config);
        if (!result.error) {
          const basePath = '/' + endpoint.split('/')[1];
          invalidateCache(basePath);
        }
        return result;
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
