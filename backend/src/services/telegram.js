import crypto from 'crypto';
import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Telegram API service
 */
class TelegramService {
  constructor() {
    this.botToken = config.telegram.botToken;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Verify Telegram Web App init data
   * @param {string} initData - Init data from Telegram Web App
   * @returns {boolean} - True if valid
   */
  verifyInitData(initData) {
    try {
      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get('hash');
      urlParams.delete('hash');

      // Sort params alphabetically
      const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      // Create secret key
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(this.botToken)
        .digest();

      // Calculate hash
      const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      return calculatedHash === hash;
    } catch (error) {
      logger.error('Init data verification error', { error: error.message, stack: error.stack });
      return false;
    }
  }

  /**
   * Parse Telegram init data
   * @param {string} initData - Init data from Telegram Web App
   * @returns {object} - Parsed user data
   */
  parseInitData(initData) {
    try {
      const urlParams = new URLSearchParams(initData);
      const userJson = urlParams.get('user');

      if (!userJson) {
        throw new Error('User data not found in init data');
      }

      const user = JSON.parse(userJson);

      return {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        username: user.username,
        languageCode: user.language_code,
        isPremium: user.is_premium
      };
    } catch (error) {
      logger.error('Init data parsing error', { error: error.message, stack: error.stack });
      throw new Error('Invalid init data format');
    }
  }

  /**
   * Send message to user
   * @param {number} chatId - Telegram chat ID
   * @param {string} text - Message text
   * @param {object} options - Additional options (reply_markup, parse_mode, etc.)
   */
  async sendMessage(chatId, text, options = {}) {
    try {
      const response = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        ...options
      });

      return response.data.result;
    } catch (error) {
      logger.error('Send message error', { error: error.response?.data || error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Send notification about new order
   * @param {number} sellerTelegramId - Seller's Telegram ID
   * @param {object} orderData - Order information
   */
  async notifyNewOrder(sellerTelegramId, orderData) {
    const message = `
🛍 New Order #${orderData.id}

📦 Product: ${orderData.product_name}
💰 Amount: ${orderData.total_price} ${orderData.currency}
👤 Buyer: ${orderData.buyer_username || 'Anonymous'}

Status: Pending Payment
    `.trim();

    return this.sendMessage(sellerTelegramId, message);
  }

  /**
   * Send payment confirmation notification
   * @param {number} buyerTelegramId - Buyer's Telegram ID
   * @param {object} orderData - Order information
   */
  async notifyPaymentConfirmed(buyerTelegramId, orderData) {
    const message = `
✅ Payment Confirmed

Order #${orderData.id}
📦 ${orderData.product_name}
💰 ${orderData.total_price} ${orderData.currency}

Your order is being processed by the seller.
    `.trim();

    return this.sendMessage(buyerTelegramId, message);
  }

  /**
   * Send order status update notification
   * @param {number} buyerTelegramId - Buyer's Telegram ID
   * @param {object} orderData - Order information
   */
  async notifyOrderStatusUpdate(buyerTelegramId, orderData) {
    const statusEmoji = {
      pending: '⏳',
      confirmed: '✅',
      shipped: '🚚',
      delivered: '📦',
      cancelled: '❌'
    };

    const emoji = statusEmoji[orderData.status] || '📋';

    const message = `
${emoji} Order Status Update

Order #${orderData.id}
Status: ${orderData.status.toUpperCase()}
📦 ${orderData.product_name}
    `.trim();

    return this.sendMessage(buyerTelegramId, message);
  }

  /**
   * Get bot info
   */
  async getBotInfo() {
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);
      return response.data.result;
    } catch (error) {
      logger.error('Get bot info error', { error: error.response?.data || error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Set webhook
   * @param {string} url - Webhook URL
   */
  async setWebhook(url) {
    try {
      const response = await axios.post(`${this.apiUrl}/setWebhook`, {
        url,
        allowed_updates: ['message', 'callback_query']
      });

      return response.data.result;
    } catch (error) {
      logger.error('Set webhook error', { error: error.response?.data || error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook() {
    try {
      const response = await axios.post(`${this.apiUrl}/deleteWebhook`);
      return response.data.result;
    } catch (error) {
      logger.error('Delete webhook error', { error: error.response?.data || error.message, stack: error.stack });
      throw error;
    }
  }
}

export default new TelegramService();
