import crypto from 'crypto';
import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';
import { t, DEFAULT_LANGUAGE } from '../i18n/index.js';

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
      const authDate = urlParams.get('auth_date');
      urlParams.delete('hash');

      // BUG-AUTH-002 FIX: Validate auth_date to prevent replay attacks
      // Reject initData older than 5 minutes (300 seconds)
      if (!authDate) {
        logger.warn('Init data verification failed: missing auth_date');
        return false;
      }

      const authTimestamp = parseInt(authDate, 10);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const maxAge = 5 * 60; // 5 minutes in seconds

      if (isNaN(authTimestamp) || currentTimestamp - authTimestamp > maxAge) {
        logger.warn('Init data verification failed: auth_date too old or invalid', {
          authDate: authTimestamp,
          currentTime: currentTimestamp,
          ageSeconds: currentTimestamp - authTimestamp,
          maxAgeSeconds: maxAge,
        });
        return false;
      }

      // Sort params alphabetically
      const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      // Create secret key
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(this.botToken).digest();

      // Calculate hash
      const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      const hashBuffer = Buffer.from(hash, 'hex');
      const calculatedHashBuffer = Buffer.from(calculatedHash, 'hex');

      if (hashBuffer.length !== calculatedHashBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(hashBuffer, calculatedHashBuffer);
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
        isPremium: user.is_premium,
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
    if (!this.botToken || !chatId) {
      logger.warn('Telegram send skipped: missing token or chatId', { chatId });
      return null;
    }

    if (config.nodeEnv === 'test') {
      logger.debug('Telegram send mocked in test environment', { chatId, text });
      return null;
    }

    try {
      const response = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        ...options,
      });

      return response.data.result;
    } catch (error) {
      logger.error('Send message error', {
        error: error.response?.data || error.message,
        stack: error.stack,
      });
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
   * Send payment confirmation notification to buyer
   * @param {number} buyerTelegramId - Buyer's Telegram ID
   * @param {object} orderData - Order information
   * @param {string} lang - User language preference
   */
  async notifyPaymentConfirmed(buyerTelegramId, orderData, lang = DEFAULT_LANGUAGE) {
    const quantityStr = orderData.quantity > 1
      ? `\n${t('order.confirmed.quantity', { quantity: orderData.quantity }, lang)}`
      : '';

    const message = `
✅ ${t('order.confirmed.title', {}, lang)}

${t('order.confirmed.product', { productName: orderData.product_name }, lang)}${quantityStr}
${t('order.confirmed.amount', { amount: orderData.total_price }, lang)}

${t('order.confirmed.seller', { username: orderData.seller_username }, lang)}
${t('order.confirmed.shop', { shopName: orderData.shop_name }, lang)}

${t('order.confirmed.contactSeller', {}, lang)}
    `.trim();

    return this.sendMessage(buyerTelegramId, message);
  }

  /**
   * Send payment confirmation notification to seller
   * @param {number} sellerTelegramId - Seller's Telegram ID
   * @param {object} orderData - Order information
   * @param {string} lang - User language preference
   */
  async notifyPaymentConfirmedSeller(sellerTelegramId, orderData, lang = DEFAULT_LANGUAGE) {
    const quantityStr = orderData.quantity > 1
      ? `\n${t('order.new.quantity', { quantity: orderData.quantity }, lang)}`
      : '';

    // Add source shop info for resell products
    let sourceStr = '';
    if (orderData.sourceInfo) {
      sourceStr = `\n\n📦 ${t('order.new.sourceShop', { shopName: orderData.sourceInfo.shopName }, lang)}`;
      if (orderData.sourceInfo.ownerUsername) {
        sourceStr += `\n👤 ${t('order.new.sourceContact', { username: orderData.sourceInfo.ownerUsername }, lang)}`;
      }
    }

    const message = `
🛍 ${t('order.new.title', {}, lang)}

${t('order.new.product', { productName: orderData.productName }, lang)}${quantityStr}
${t('order.new.amount', { amount: orderData.totalPrice }, lang)}
${t('order.new.payment', { currency: orderData.currency }, lang)}

${t('order.new.buyer', { username: orderData.buyerUsername }, lang)}${sourceStr}
    `.trim();

    return this.sendMessage(sellerTelegramId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('order.new.markDelivered', {}, lang), callback_data: `order:deliver:${orderData.orderId}` }],
        ],
      },
    });
  }

  /**
   * Send order status update notification
   * @param {number} buyerTelegramId - Buyer's Telegram ID
   * @param {object} orderData - Order information
   * @param {string} lang - User language preference
   */
  async notifyOrderStatusUpdate(buyerTelegramId, orderData, lang = DEFAULT_LANGUAGE) {
    const statusEmoji = {
      pending: '⏳',
      paid: '✅',
      completed: '📦',
      cancelled: '❌',
      expired: '⏰',
      // Legacy statuses
      confirmed: '✅',
      shipped: '🚚',
      delivered: '📦',
    };

    const emoji = statusEmoji[orderData.status] || '📋';
    const statusKey = `order.status.${orderData.status}`;
    const status = t(statusKey, {}, lang);

    const message = `
${emoji} ${t('order.status.title', {}, lang)}

${t('order.status.orderId', { orderId: orderData.id }, lang)}
${t('order.status.status', { status }, lang)}
📦 ${orderData.product_name}
    `.trim();

    return this.sendMessage(buyerTelegramId, message);
  }

  /**
   * Notify shop team about order completion (выдача)
   * @param {number} telegramId - Recipient's Telegram ID
   * @param {object} orderData - Order information
   * @param {string} lang - User language preference
   */
  async notifyOrderCompleted(telegramId, orderData, lang = DEFAULT_LANGUAGE) {
    const quantityStr = orderData.quantity > 1
      ? `\n${t('order.completed.quantity', { quantity: orderData.quantity }, lang)}`
      : '';

    const completedByStr = orderData.completedByUsername
      ? `\n\n👤 ${t('order.completed.completedBy', { username: orderData.completedByUsername }, lang)}`
      : '';

    const message = `
✅ ${t('order.completed.title', {}, lang)}

${t('order.completed.orderId', { orderId: orderData.orderId }, lang)}
${t('order.completed.product', { productName: orderData.productName }, lang)}${quantityStr}
${t('order.completed.amount', { amount: orderData.totalPrice }, lang)}
${t('order.completed.buyer', { username: orderData.buyerUsername }, lang)}${completedByStr}
    `.trim();

    return this.sendMessage(telegramId, message);
  }

  /**
   * Notify buyer that their payment was submitted
   * @param {number} buyerTelegramId - Buyer's Telegram ID
   * @param {object} data - { shopName, productName, amount, cryptoAmount, currency, txHash }
   * @param {string} lang - User language preference
   */
  async notifyPaymentSubmittedBuyer(buyerTelegramId, data, lang = DEFAULT_LANGUAGE) {
    if (!buyerTelegramId) {
      return null;
    }

    const truncatedTxHash = data.txHash.length > 16
      ? `${data.txHash.slice(0, 8)}...${data.txHash.slice(-8)}`
      : data.txHash;

    const message = `<b>${t('order.submitted.buyer.title', {}, lang)}</b>

${t('order.submitted.buyer.shop', { shopName: data.shopName }, lang)}
${t('order.submitted.buyer.product', { productName: data.productName }, lang)}
${t('order.submitted.buyer.amountUsd', { amount: parseFloat(data.amount).toFixed(2) }, lang)}
${t('order.submitted.buyer.amountCrypto', { cryptoAmount: data.cryptoAmount, currency: data.currency }, lang)}

${t('order.submitted.buyer.txHash', { txHash: truncatedTxHash }, lang)}

${t('order.submitted.buyer.verifying', {}, lang)}`;

    return this.sendMessage(buyerTelegramId, message.trim(), { parse_mode: 'HTML' });
  }

  /**
   * Notify seller that buyer claimed payment
   * @param {number} sellerTelegramId - Seller's Telegram ID
   * @param {object} data - { orderId, productName, amount, cryptoAmount, currency, buyerUsername, txHash }
   * @param {string} lang - User language preference
   */
  async notifyPaymentSubmittedSeller(sellerTelegramId, data, lang = DEFAULT_LANGUAGE) {
    if (!sellerTelegramId) {
      return null;
    }

    const truncatedTxHash = data.txHash.length > 16
      ? `${data.txHash.slice(0, 8)}...${data.txHash.slice(-8)}`
      : data.txHash;

    // Fix double @@ - remove @ if username already has it
    const cleanUsername = data.buyerUsername?.replace(/^@/, '') || '';
    const buyerDisplay = cleanUsername ? `@${cleanUsername}` : 'Anonymous';

    // Generate explorer link based on currency
    const explorerUrl = this._getExplorerUrl(data.currency, data.txHash);
    const txDisplay = explorerUrl
      ? `<a href="${explorerUrl}">${truncatedTxHash}</a>`
      : truncatedTxHash;

    const message = `<b>${t('order.submitted.seller.title', {}, lang)}</b>

${t('order.submitted.seller.orderId', { orderId: data.orderId }, lang)}
${t('order.submitted.seller.product', { productName: data.productName }, lang)}
${t('order.submitted.seller.amount', { amount: parseFloat(data.amount).toFixed(2), cryptoAmount: data.cryptoAmount, currency: data.currency }, lang)}
${t('order.submitted.seller.buyer', { username: buyerDisplay }, lang)}

🔗 TX: ${txDisplay}

${t('order.submitted.seller.warning', {}, lang)}`;

    return this.sendMessage(sellerTelegramId, message.trim(), { parse_mode: 'HTML' });
  }

  /**
   * Notify shop owner about successful subscription activation
   * @param {number} telegramId - Owner Telegram ID
   * @param {object} payload - { shopName, tier, nextPaymentDue }
   * @param {string} lang - User language preference
   */
  async notifySubscriptionActivated(telegramId, payload = {}, lang = DEFAULT_LANGUAGE) {
    if (!telegramId) {
      return null;
    }

    const tierEmoji = payload.tier === 'max' ? '👑' : '⭐';
    const tierLabel = (payload.tier || 'pro').toUpperCase();
    const dateLocale = lang === 'en' ? 'en-US' : 'ru-RU';
    const nextDue = payload.nextPaymentDue
      ? new Date(payload.nextPaymentDue).toLocaleDateString(dateLocale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })
      : t('common.notSpecified', {}, lang);

    const message = `${tierEmoji} <b>${t('subscription.activated.title', {}, lang)}</b>

<b>${payload.shopName || t('subscription.activated.shopName', { shopName: '' }, lang)}</b>
${t('subscription.activated.tier', { tier: tierLabel }, lang)}
${t('subscription.activated.validUntil', { date: nextDue }, lang)}`;

    return this.sendMessage(telegramId, message.trim(), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: `📋 ${t('subscription.activated.goToMenu', {}, lang)}`, callback_data: 'back_to_main' }],
        ],
      },
    });
  }

  /**
   * Notify user that subscription оплачена, но магазин ещё не создан
   * @param {number} telegramId - User Telegram ID
   * @param {object} payload - { tier }
   * @param {string} lang - User language preference
   */
  async notifySubscriptionPendingSetup(telegramId, payload = {}, lang = DEFAULT_LANGUAGE) {
    if (!telegramId) {
      return null;
    }

    const tierEmoji = payload.tier === 'max' ? '👑' : '⭐';
    const tierLabel = (payload.tier || 'pro').toUpperCase();

    const message = `${tierEmoji} <b>${t('subscription.pendingSetup.title', {}, lang)}</b>

${t('subscription.pendingSetup.tier', { tier: tierLabel }, lang)}

${t('subscription.pendingSetup.createShop', {}, lang)}`;

    return this.sendMessage(telegramId, message.trim(), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `🏪 ${t('subscription.pendingSetup.createShopButton', {}, lang)}`,
              callback_data: `start_create_shop:${(payload.tier || 'pro').toLowerCase()}`,
            },
          ],
          [{ text: `📋 ${t('subscription.pendingSetup.menuButton', {}, lang)}`, callback_data: 'back_to_main' }],
        ],
      },
    });
  }

  /**
   * Get bot info
   */
  async getBotInfo() {
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);
      return response.data.result;
    } catch (error) {
      logger.error('Get bot info error', {
        error: error.response?.data || error.message,
        stack: error.stack,
      });
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
        allowed_updates: ['message', 'callback_query'],
      });

      return response.data.result;
    } catch (error) {
      logger.error('Set webhook error', {
        error: error.response?.data || error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get blockchain explorer URL for transaction
   * @param {string} currency - BTC, ETH, LTC, USDT_TRC20
   * @param {string} txHash - Transaction hash
   * @returns {string|null} Explorer URL or null
   */
  _getExplorerUrl(currency, txHash) {
    if (!txHash) {return null;}

    const explorers = {
      BTC: `https://blockchair.com/bitcoin/transaction/${txHash}`,
      LTC: `https://blockchair.com/litecoin/transaction/${txHash}`,
      ETH: `https://etherscan.io/tx/${txHash}`,
      USDT_TRC20: `https://tronscan.org/#/transaction/${txHash}`,
    };

    return explorers[currency] || null;
  }

  /**
   * Delete webhook
   */
  async deleteWebhook() {
    try {
      const response = await axios.post(`${this.apiUrl}/deleteWebhook`);
      return response.data.result;
    } catch (error) {
      logger.error('Delete webhook error', {
        error: error.response?.data || error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Send feedback message to admin
   * @param {object} feedbackData - Feedback information
   * @param {string} feedbackData.category - Feedback category (Bug Report, Feature Request, etc.)
   * @param {string} feedbackData.message - Feedback message content
   * @param {object} feedbackData.user - User information
   * @param {number} feedbackData.user.id - User database ID
   * @param {number} feedbackData.user.telegramId - User Telegram ID
   * @param {string} feedbackData.user.username - User Telegram username
   * @param {string} feedbackData.user.firstName - User first name
   * @param {string} feedbackData.user.lastName - User last name
   * @returns {Promise<object|null>} - Telegram API response or null if admin ID not configured
   */
  async sendFeedbackToAdmin(feedbackData) {
    const adminTelegramId = config.telegram.adminTelegramId;

    if (!adminTelegramId) {
      logger.warn('Admin Telegram ID not configured, skipping feedback notification');
      return null;
    }

    const { category, message, user } = feedbackData;

    // Build user display string
    const usernameDisplay = user.username ? `@${user.username.replace(/^@/, '')}` : 'No username';
    const nameDisplay = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Anonymous';

    const feedbackMessage = `<b>New Feedback</b>

<b>From:</b> ${usernameDisplay} (${nameDisplay})
<b>User ID:</b> ${user.id}
<b>Telegram ID:</b> ${user.telegramId}
<b>Category:</b> ${category}

<b>Message:</b>
${message}

---
<i>Sent via Status Stock</i>`;

    try {
      const result = await this.sendMessage(adminTelegramId, feedbackMessage, {
        parse_mode: 'HTML',
      });

      logger.info('Feedback sent to admin', {
        userId: user.id,
        category,
        adminTelegramId,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send feedback to admin', {
        error: error.response?.data || error.message,
        userId: user.id,
        category,
      });
      throw error;
    }
  }
}

export default new TelegramService();
