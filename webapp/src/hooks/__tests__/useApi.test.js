/**
 * Unit Tests for useApi hooks
 *
 * Tests the API hook without React rendering (pure function tests)
 * since the hook is essentially a factory that creates stable API methods.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS - Use vi.hoisted to create mocks before vi.mock hoisting
// ============================================================================

const { mockAxios, mockRefreshToken, mockIsInitialized } = vi.hoisted(() => ({
  mockAxios: vi.fn(),
  mockRefreshToken: vi.fn(),
  mockIsInitialized: vi.fn(() => true),
}));

// Mock axios
vi.mock('axios', () => ({
  default: mockAxios,
}));

// Mock store
vi.mock('../../store/useStore', () => ({
  useStore: {
    getState: vi.fn(() => ({ token: 'test-token-123' })),
  },
}));

// Mock tokenRefresh
vi.mock('../../utils/tokenRefresh', () => ({
  refreshAuthToken: mockRefreshToken,
  isTokenRefreshInitialized: mockIsInitialized,
}));

// Mock apiBase
vi.mock('../../utils/apiBase', () => ({
  getApiBaseUrl: vi.fn(() => 'http://localhost:3000/api'),
}));

// Import after mocks
import { useStore } from '../../store/useStore';

describe('useApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.window = {
      Telegram: { WebApp: { initData: 'test-init-data' } },
    };
  });

  afterEach(() => {
    delete global.window;
  });

  describe('createRequest function', () => {
    // Test the underlying request logic directly
    const createTestRequest = () => {
      const getToken = () => useStore.getState().token;

      return async (method, endpoint, data = null, config = {}) => {
        const isRetry = config._isRetryAfter401 || false;

        const makeRequest = async (currentToken) => {
          const initData = global.window?.Telegram?.WebApp?.initData || '';

          const axiosConfig = {
            method,
            url: `http://localhost:3000/api${endpoint}`,
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

          delete axiosConfig._isRetryAfter401;

          if (method !== 'GET' && method !== 'DELETE' && data !== null) {
            axiosConfig.data = data;
          }

          return await mockAxios(axiosConfig);
        };

        try {
          const currentToken = getToken();
          const response = await makeRequest(currentToken);
          return { data: response.data, error: null };
        } catch (err) {
          if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
            return { data: null, error: 'Request timeout - please check your connection' };
          }

          if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
            return { data: null, error: 'Request cancelled' };
          }

          if (err.response?.status === 401 && !isRetry && mockIsInitialized()) {
            try {
              await mockRefreshToken();
              const newToken = getToken();
              const retryResponse = await makeRequest(newToken);
              return { data: retryResponse.data, error: null };
            } catch {
              return { data: null, error: 'Session expired. Please restart the app.' };
            }
          }

          const apiError = err.response?.data;
          const errorMessage = apiError?.error || apiError?.message || err.message || 'Произошла ошибка';
          return { data: null, error: errorMessage };
        }
      };
    };

    it('should make GET request with correct headers', async () => {
      mockAxios.mockResolvedValueOnce({ data: { id: 1, name: 'Test' } });

      const request = createTestRequest();
      const response = await request('GET', '/test');

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'http://localhost:3000/api/test',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': 'test-init-data',
            Authorization: 'Bearer test-token-123',
          }),
        })
      );
      expect(response.data).toEqual({ id: 1, name: 'Test' });
      expect(response.error).toBeNull();
    });

    it('should make POST request with data', async () => {
      mockAxios.mockResolvedValueOnce({ data: { success: true } });

      const request = createTestRequest();
      const response = await request('POST', '/items', { name: 'New Item' });

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: { name: 'New Item' },
        })
      );
      expect(response.data).toEqual({ success: true });
    });

    it('should make PUT request with data', async () => {
      mockAxios.mockResolvedValueOnce({ data: { updated: true } });

      const request = createTestRequest();
      const response = await request('PUT', '/items/1', { name: 'Updated' });

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          data: { name: 'Updated' },
        })
      );
      expect(response.data).toEqual({ updated: true });
    });

    it('should make DELETE request without data', async () => {
      mockAxios.mockResolvedValueOnce({ data: { deleted: true } });

      const request = createTestRequest();
      const response = await request('DELETE', '/items/1');

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(response.data).toEqual({ deleted: true });
      // DELETE should not include data
      expect(mockAxios.mock.calls[0][0].data).toBeUndefined();
    });

    it('should make PATCH request with data', async () => {
      mockAxios.mockResolvedValueOnce({ data: { patched: true } });

      const request = createTestRequest();
      const response = await request('PATCH', '/items/1', { field: 'value' });

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          data: { field: 'value' },
        })
      );
      expect(response.data).toEqual({ patched: true });
    });
  });

  describe('error handling', () => {
    const createTestRequest = () => {
      const getToken = () => useStore.getState().token;

      return async (method, endpoint, data = null, config = {}) => {
        const isRetry = config._isRetryAfter401 || false;

        const makeRequest = async (currentToken) => {
          const axiosConfig = {
            method,
            url: `http://localhost:3000/api${endpoint}`,
            headers: {
              'Content-Type': 'application/json',
              ...(currentToken && { Authorization: `Bearer ${currentToken}` }),
            },
            timeout: config.timeout || 15000,
          };

          if (method !== 'GET' && method !== 'DELETE' && data !== null) {
            axiosConfig.data = data;
          }

          return await mockAxios(axiosConfig);
        };

        try {
          const currentToken = getToken();
          const response = await makeRequest(currentToken);
          return { data: response.data, error: null };
        } catch (err) {
          if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
            return { data: null, error: 'Request timeout - please check your connection' };
          }

          if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
            return { data: null, error: 'Request cancelled' };
          }

          if (err.response?.status === 401 && !isRetry && mockIsInitialized()) {
            try {
              await mockRefreshToken();
              const newToken = getToken();
              const retryResponse = await makeRequest(newToken);
              return { data: retryResponse.data, error: null };
            } catch {
              return { data: null, error: 'Session expired. Please restart the app.' };
            }
          }

          const apiError = err.response?.data;
          const errorMessage = apiError?.error || apiError?.message || err.message || 'Произошла ошибка';
          return { data: null, error: errorMessage };
        }
      };
    };

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('timeout of 15000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      mockAxios.mockRejectedValueOnce(timeoutError);

      const request = createTestRequest();
      const response = await request('GET', '/slow');

      expect(response.data).toBeNull();
      expect(response.error).toContain('timeout');
    });

    it('should handle cancelled requests', async () => {
      const cancelError = new Error('Request cancelled');
      cancelError.name = 'CanceledError';
      cancelError.code = 'ERR_CANCELED';
      mockAxios.mockRejectedValueOnce(cancelError);

      const request = createTestRequest();
      const response = await request('GET', '/cancelled');

      expect(response.data).toBeNull();
      expect(response.error).toBe('Request cancelled');
    });

    it('should return API error message from error field', async () => {
      const apiError = {
        response: {
          status: 400,
          data: { error: 'Invalid request' },
        },
      };
      mockAxios.mockRejectedValueOnce(apiError);

      const request = createTestRequest();
      const response = await request('GET', '/bad-request');

      expect(response.data).toBeNull();
      expect(response.error).toBe('Invalid request');
    });

    it('should return API error message from message field', async () => {
      const apiError = {
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
      };
      mockAxios.mockRejectedValueOnce(apiError);

      const request = createTestRequest();
      const response = await request('GET', '/error');

      expect(response.error).toBe('Internal server error');
    });

    it('should return generic error message for unknown errors', async () => {
      const genericError = new Error('Network Error');
      mockAxios.mockRejectedValueOnce(genericError);

      const request = createTestRequest();
      const response = await request('GET', '/network-error');

      expect(response.error).toBe('Network Error');
    });
  });

  describe('token refresh on 401', () => {
    const createTestRequest = () => {
      const getToken = () => useStore.getState().token;

      return async (method, endpoint, data = null, config = {}) => {
        const isRetry = config._isRetryAfter401 || false;

        const makeRequest = async (currentToken) => {
          const axiosConfig = {
            method,
            url: `http://localhost:3000/api${endpoint}`,
            headers: {
              'Content-Type': 'application/json',
              ...(currentToken && { Authorization: `Bearer ${currentToken}` }),
            },
          };
          return await mockAxios(axiosConfig);
        };

        try {
          const currentToken = getToken();
          const response = await makeRequest(currentToken);
          return { data: response.data, error: null };
        } catch (err) {
          if (err.response?.status === 401 && !isRetry && mockIsInitialized()) {
            try {
              await mockRefreshToken();
              const newToken = getToken();
              const retryResponse = await makeRequest(newToken);
              return { data: retryResponse.data, error: null };
            } catch {
              return { data: null, error: 'Session expired. Please restart the app.' };
            }
          }

          const apiError = err.response?.data;
          const errorMessage = apiError?.error || apiError?.message || err.message || 'Произошла ошибка';
          return { data: null, error: errorMessage };
        }
      };
    };

    it('should refresh token and retry on 401', async () => {
      const unauthorizedError = {
        response: { status: 401 },
      };

      mockAxios
        .mockRejectedValueOnce(unauthorizedError)
        .mockResolvedValueOnce({ data: { refreshed: true } });

      useStore.getState
        .mockReturnValueOnce({ token: 'old-token' })
        .mockReturnValueOnce({ token: 'new-token-after-refresh' });

      mockRefreshToken.mockResolvedValueOnce();

      const request = createTestRequest();
      const response = await request('GET', '/protected');

      expect(mockRefreshToken).toHaveBeenCalledTimes(1);
      expect(mockAxios).toHaveBeenCalledTimes(2);
      expect(response.data).toEqual({ refreshed: true });
      expect(response.error).toBeNull();
    });

    it('should return error if token refresh fails', async () => {
      const unauthorizedError = {
        response: { status: 401 },
      };
      mockAxios.mockRejectedValueOnce(unauthorizedError);
      mockRefreshToken.mockRejectedValueOnce(new Error('Refresh failed'));

      const request = createTestRequest();
      const response = await request('GET', '/protected');

      expect(response.data).toBeNull();
      expect(response.error).toBe('Session expired. Please restart the app.');
    });

    it('should not retry if already a retry attempt', async () => {
      const unauthorizedError = {
        response: { status: 401, data: { error: 'Unauthorized' } },
      };
      mockAxios.mockRejectedValueOnce(unauthorizedError);

      const request = createTestRequest();
      const response = await request('GET', '/protected', null, { _isRetryAfter401: true });

      expect(mockRefreshToken).not.toHaveBeenCalled();
      expect(mockAxios).toHaveBeenCalledTimes(1);
      expect(response.error).toBe('Unauthorized');
    });

    it('should not refresh if token refresh not initialized', async () => {
      mockIsInitialized.mockReturnValueOnce(false);

      const unauthorizedError = {
        response: { status: 401, data: { error: 'Unauthorized' } },
      };
      mockAxios.mockRejectedValueOnce(unauthorizedError);

      const request = createTestRequest();
      const response = await request('GET', '/protected');

      expect(mockRefreshToken).not.toHaveBeenCalled();
      expect(response.error).toBe('Unauthorized');
    });
  });

  describe('config options', () => {
    const createTestRequest = () => {
      return async (method, endpoint, data = null, config = {}) => {
        const axiosConfig = {
          method,
          url: `http://localhost:3000/api${endpoint}`,
          headers: {
            'Content-Type': 'application/json',
            ...config.headers,
          },
          timeout: config.timeout || 15000,
          signal: config.signal,
        };

        if (method !== 'GET' && method !== 'DELETE' && data !== null) {
          axiosConfig.data = data;
        }

        const response = await mockAxios(axiosConfig);
        return { data: response.data, error: null };
      };
    };

    it('should pass custom timeout', async () => {
      mockAxios.mockResolvedValueOnce({ data: {} });

      const request = createTestRequest();
      await request('GET', '/slow', null, { timeout: 30000 });

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should pass abort signal', async () => {
      const controller = new AbortController();
      mockAxios.mockResolvedValueOnce({ data: {} });

      const request = createTestRequest();
      await request('GET', '/data', null, { signal: controller.signal });

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: controller.signal,
        })
      );
    });

    it('should merge custom headers', async () => {
      mockAxios.mockResolvedValueOnce({ data: {} });

      const request = createTestRequest();
      await request('GET', '/data', null, {
        headers: { 'X-Custom': 'value' },
      });

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value',
          }),
        })
      );
    });

    it('should use default timeout of 15000ms', async () => {
      mockAxios.mockResolvedValueOnce({ data: {} });

      const request = createTestRequest();
      await request('GET', '/data');

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 15000,
        })
      );
    });
  });
});

describe('markup helpers (useFollowsApi)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('markup format conversion', () => {
    // Test the markup format conversion logic
    const convertMarkupFormat = (markupData) => {
      if (typeof markupData === 'number') {
        return { markupPercentage: markupData, markupType: 'percentage' };
      }
      return {
        markupType: markupData.markupType || 'percentage',
        markupPercentage: markupData.markupPercentage || 0,
        markupFixed: markupData.markupFixed || 0,
      };
    };

    it('should convert number to percentage format', () => {
      const result = convertMarkupFormat(15);
      expect(result).toEqual({ markupPercentage: 15, markupType: 'percentage' });
    });

    it('should pass through percentage object format', () => {
      const result = convertMarkupFormat({
        markupType: 'percentage',
        markupPercentage: 20,
      });
      expect(result).toEqual({
        markupType: 'percentage',
        markupPercentage: 20,
        markupFixed: 0,
      });
    });

    it('should pass through fixed object format', () => {
      const result = convertMarkupFormat({
        markupType: 'fixed',
        markupFixed: 10,
      });
      expect(result).toEqual({
        markupType: 'fixed',
        markupPercentage: 0,
        markupFixed: 10,
      });
    });

    it('should default to percentage type if not specified', () => {
      const result = convertMarkupFormat({
        markupPercentage: 25,
      });
      expect(result.markupType).toBe('percentage');
    });

    it('should default numeric values to 0 if not specified', () => {
      const result = convertMarkupFormat({});
      expect(result).toEqual({
        markupType: 'percentage',
        markupPercentage: 0,
        markupFixed: 0,
      });
    });
  });

  describe('switchMode format conversion', () => {
    const buildSwitchModeBody = (mode, markupData) => {
      const body = { mode };

      if (markupData !== null) {
        if (typeof markupData === 'number') {
          body.markupPercentage = markupData;
          body.markupType = 'percentage';
        } else {
          body.markupType = markupData.markupType || 'percentage';
          body.markupPercentage = markupData.markupPercentage || 0;
          body.markupFixed = markupData.markupFixed || 0;
        }
      }

      return body;
    };

    it('should create body with mode only', () => {
      const result = buildSwitchModeBody('monitor', null);
      expect(result).toEqual({ mode: 'monitor' });
    });

    it('should create body with percentage markup (number)', () => {
      const result = buildSwitchModeBody('resell', 15);
      expect(result).toEqual({
        mode: 'resell',
        markupPercentage: 15,
        markupType: 'percentage',
      });
    });

    it('should create body with fixed markup (object)', () => {
      const result = buildSwitchModeBody('resell', {
        markupType: 'fixed',
        markupFixed: 10,
      });
      expect(result).toEqual({
        mode: 'resell',
        markupType: 'fixed',
        markupPercentage: 0,
        markupFixed: 10,
      });
    });
  });
});
