import axios from 'axios';
import axiosRetry from 'axios-retry';
import config from '../../config/index.js';
import logger from '../logger.js';

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

export { api, paymentAxios, logger };
export default api;
