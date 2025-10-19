import client from './client.js';

/**
 * Authentication API
 */
export const authApi = {
  /**
   * Register new user
   * @param {object} telegramUser - Telegram user object
   * @returns {Promise<object>} User data with JWT token
   */
  async register(telegramUser) {
    return await client.post('/api/auth/register', {
      telegramId: telegramUser.id.toString(),
      username: telegramUser.username,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name
    });
  },

  /**
   * Login user via Telegram Web App
   * @param {object} telegramUser - Telegram user object
   * @param {string} initData - Telegram WebApp init data
   * @returns {Promise<object>} User data with JWT token
   */
  async login(telegramUser, initData = null) {
    return await client.post('/api/auth/login', {
      telegramId: telegramUser.id.toString(),
      username: telegramUser.username,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      initData
    });
  },

  /**
   * Get current user profile
   * @param {string} token - JWT token
   * @returns {Promise<object>} User profile
   */
  async getProfile(token) {
    return await client.get('/api/auth/profile', token);
  },

  /**
   * Update user profile
   * @param {string} token - JWT token
   * @param {object} updates - Profile updates
   * @returns {Promise<object>} Updated user
   */
  async updateProfile(token, updates) {
    return await client.put('/api/auth/profile', updates, token);
  }
};
