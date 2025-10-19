import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Base HTTP client with retry logic and error handling
 */
class ApiClient {
  constructor() {
    this.baseURL = process.env.BACKEND_URL || 'http://localhost:3000';
    this.timeout = parseInt(process.env.API_TIMEOUT) || 10000;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this._setupInterceptors();
  }

  /**
   * Setup request/response interceptors
   */
  _setupInterceptors() {
    // Response interceptor with retry logic
    this.client.interceptors.response.use(
      response => response,
      async (error) => {
        const config = error.config;

        // Retry logic for server errors (500+)
        if (error.response?.status >= 500 && (!config.retryCount || config.retryCount < 3)) {
          config.retryCount = (config.retryCount || 0) + 1;

          console.warn(
            `🔄 Retry ${config.retryCount}/3 for ${config.method.toUpperCase()} ${config.url}`
          );

          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, config.retryCount - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));

          return this.client.request(config);
        }

        throw error;
      }
    );
  }

  /**
   * Make HTTP request
   * @param {string} method - HTTP method
   * @param {string} url - Endpoint URL
   * @param {object} data - Request body
   * @param {string} token - JWT token
   * @returns {Promise<object>} Response data
   */
  async request(method, url, data = null, token = null) {
    try {
      const config = {
        method,
        url,
        data
      };

      // Add authorization header if token provided
      if (token) {
        config.headers = {
          'Authorization': `Bearer ${token}`
        };
      }

      const response = await this.client.request(config);
      return response.data;
    } catch (error) {
      console.error(
        `❌ API ${method.toUpperCase()} ${url} failed:`,
        error.response?.data || error.message
      );
      throw this._handleError(error);
    }
  }

  /**
   * Handle and format errors
   * @param {Error} error - Axios error
   * @returns {Error} Formatted error
   */
  _handleError(error) {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const message = error.response.data?.error || error.response.data?.message;

      if (status === 401) {
        return new Error('Ошибка авторизации. Попробуйте войти заново.');
      }
      if (status === 403) {
        return new Error('Доступ запрещен.');
      }
      if (status === 404) {
        return new Error(message || 'Ресурс не найден.');
      }
      if (status === 429) {
        return new Error('Слишком много запросов. Попробуйте позже.');
      }
      if (status >= 500) {
        return new Error('Ошибка сервера. Попробуйте позже.');
      }

      return new Error(message || 'Ошибка запроса.');
    }

    if (error.request) {
      // Request was made but no response received
      return new Error('Ошибка сети. Проверьте подключение к интернету.');
    }

    // Something else happened
    return new Error(error.message || 'Неизвестная ошибка.');
  }

  /**
   * GET request helper
   */
  async get(url, token = null) {
    return this.request('GET', url, null, token);
  }

  /**
   * POST request helper
   */
  async post(url, data, token = null) {
    return this.request('POST', url, data, token);
  }

  /**
   * PUT request helper
   */
  async put(url, data, token = null) {
    return this.request('PUT', url, data, token);
  }

  /**
   * DELETE request helper
   */
  async delete(url, token = null) {
    return this.request('DELETE', url, null, token);
  }
}

// Export singleton instance
export default new ApiClient();
