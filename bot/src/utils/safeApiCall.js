import logger from './logger.js';

/**
 * Safe wrapper for Backend API calls
 *
 * Guarantees correct handling of:
 * - 200 OK with success: false in response body
 * - HTTP 4xx/5xx errors
 * - Network errors (timeout, connection refused)
 *
 * @param {Function} apiFunction - API function to call
 * @param {...any} args - Arguments to pass to apiFunction
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function safeApiCall(apiFunction, ...args) {
  try {
    const response = await apiFunction(...args);

    // API client can return two formats:
    // 1. Wrapper: { success: true, data: ... } or { success: false, error: ... }
    // 2. Unwrapped: just data (product, shop, etc.) - already unpacked by api.js

    // Check that response is an object
    if (!response || typeof response !== 'object') {
      logger.warn('API call returned non-object response:', response);
      return {
        success: false,
        error: 'Unexpected response format from server',
      };
    }

    // Check wrapper format (has 'success' field)
    if ('success' in response) {
      // Wrapper: { success: true, data: ... }
      if (response.success && 'data' in response) {
        return {
          success: true,
          data: response.data,
        };
      }

      // Wrapper: { success: false, error: ... }
      if (response.success === false) {
        const errorMessage = response.error || response.message || 'Unknown API error';
        logger.warn('API call returned failure status:', {
          error: errorMessage,
          response,
        });
        return {
          success: false,
          error: errorMessage,
        };
      }

      // Wrapper format but strange (success: true without data)
      logger.warn('API call returned wrapper without data field:', response);
      return {
        success: false,
        error: 'Unexpected response format from server',
      };
    }

    // Unwrapped format: API client returned data directly (product, shop, etc.)
    // This is a successful response since no exception was thrown
    logger.debug('API call returned unwrapped data (success):', {
      hasId: !!response.id,
      hasName: !!response.name,
      keys: Object.keys(response).slice(0, 5),
    });
    return {
      success: true,
      data: response,
    };
  } catch (error) {
    // Handle network errors and HTTP errors (4xx, 5xx)
    logger.error('API call exception:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
    });

    let errorMessage = 'Network or server error';

    if (error.response) {
      // HTTP error (4xx, 5xx)
      const status = error.response.status;
      const backendError = error.response.data?.error || error.response.data?.message;

      if (status === 400) {
        errorMessage = `Invalid data: ${backendError || 'check parameters'}`;
      } else if (status === 401) {
        errorMessage = 'Authorization error';
      } else if (status === 403) {
        errorMessage = 'Access denied';
      } else if (status === 404) {
        errorMessage = `Not found: ${backendError || 'resource does not exist'}`;
      } else if (status === 409) {
        errorMessage = `Conflict: ${backendError || 'data already exists'}`;
      } else if (status === 422) {
        errorMessage = `Validation error: ${backendError || 'check data'}`;
      } else if (status >= 500) {
        errorMessage = `Server error (${status}): ${backendError || 'try again later'}`;
      } else {
        errorMessage = `Error ${status}: ${backendError || 'unknown error'}`;
      }
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Server unavailable (ECONNREFUSED)';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Server response timeout exceeded';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Server not found (check BACKEND_URL)';
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Format result for AI
 * Transforms error into structure understandable for AI response generation
 */
export function formatResultForAI(result, actionType) {
  if (!result.success) {
    return {
      success: false,
      message: result.error,
      data: {
        error: {
          code: 'API_ERROR',
          message: result.error,
        },
      },
    };
  }

  return {
    success: true,
    data: {
      action: actionType,
      ...result.data,
    },
  };
}
