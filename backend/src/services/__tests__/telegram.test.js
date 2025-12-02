import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import crypto from 'crypto';

/**
 * Unit tests for TelegramService
 * 
 * Tests cover:
 * - verifyInitData: security-critical init data verification
 * - parseInitData: parsing user data from init data
 * - sendMessage: base message sending
 * - Notification methods: order, payment, status updates
 * - API methods: getBotInfo, setWebhook, deleteWebhook
 */

const TEST_BOT_TOKEN = 'test-bot-token-123';

// Mock config BEFORE import
jest.unstable_mockModule('../../config/env.js', () => ({
  config: {
    telegram: {
      botToken: TEST_BOT_TOKEN,
    },
    nodeEnv: 'development',
  },
}));

const mockAxiosPost = jest.fn();
const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    post: mockAxiosPost,
    get: mockAxiosGet,
  },
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import AFTER mocks
const telegramService = (await import('../telegram.js')).default;

/**
 * Generate valid Telegram init data for testing
 */
function generateValidInitData(botToken, userData = {}) {
  const user = JSON.stringify({
    id: 123456789,
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
    language_code: 'en',
    is_premium: true,
    ...userData,
  });
  const auth_date = Math.floor(Date.now() / 1000).toString();

  const dataCheckString = `auth_date=${auth_date}\nuser=${user}`;
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return `auth_date=${auth_date}&user=${encodeURIComponent(user)}&hash=${hash}`;
}

describe('TelegramService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ data: { result: { message_id: 123 } } });
    mockAxiosGet.mockResolvedValue({ data: { result: { id: 123, username: 'testbot' } } });
  });

  describe('verifyInitData', () => {
    it('should return true for valid init data', () => {
      const validData = generateValidInitData(TEST_BOT_TOKEN);
      expect(telegramService.verifyInitData(validData)).toBe(true);
    });

    it('should return false for invalid hash', () => {
      const validData = generateValidInitData(TEST_BOT_TOKEN);
      const tamperedData = validData.replace(/hash=[a-f0-9]+/, 'hash=invalidhash123');
      expect(telegramService.verifyInitData(tamperedData)).toBe(false);
    });

    it('should return false for tampered data', () => {
      const validData = generateValidInitData(TEST_BOT_TOKEN);
      // Change auth_date but keep same hash
      const tamperedData = validData.replace(/auth_date=\d+/, 'auth_date=9999999999');
      expect(telegramService.verifyInitData(tamperedData)).toBe(false);
    });

    it('should return false for malformed data', () => {
      expect(telegramService.verifyInitData('not-valid-data')).toBe(false);
      expect(telegramService.verifyInitData('')).toBe(false);
    });

    it('should return false when hash is missing', () => {
      const user = JSON.stringify({ id: 123 });
      const dataWithoutHash = `auth_date=123&user=${encodeURIComponent(user)}`;
      expect(telegramService.verifyInitData(dataWithoutHash)).toBe(false);
    });

    it('should return false for wrong bot token', () => {
      const dataWithWrongToken = generateValidInitData('wrong-token');
      expect(telegramService.verifyInitData(dataWithWrongToken)).toBe(false);
    });
  });

  describe('parseInitData', () => {
    it('should parse valid init data', () => {
      const validData = generateValidInitData(TEST_BOT_TOKEN, {
        id: 987654321,
        first_name: 'John',
        last_name: 'Doe',
        username: 'johndoe',
        language_code: 'ru',
        is_premium: false,
      });

      const result = telegramService.parseInitData(validData);

      expect(result).toEqual({
        id: 987654321,
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        languageCode: 'ru',
        isPremium: false,
      });
    });

    it('should throw error when user field is missing', () => {
      const dataWithoutUser = 'auth_date=123&hash=abc';
      expect(() => telegramService.parseInitData(dataWithoutUser)).toThrow('Invalid init data format');
    });

    it('should throw error for malformed JSON', () => {
      const dataWithBadJson = 'user=not-valid-json&hash=abc';
      expect(() => telegramService.parseInitData(dataWithBadJson)).toThrow('Invalid init data format');
    });

    it('should handle partial user data', () => {
      const user = JSON.stringify({ id: 123, first_name: 'Test' });
      const partialData = `user=${encodeURIComponent(user)}&hash=abc`;
      
      const result = telegramService.parseInitData(partialData);
      
      expect(result.id).toBe(123);
      expect(result.firstName).toBe('Test');
      expect(result.lastName).toBeUndefined();
      expect(result.username).toBeUndefined();
    });
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { result: { message_id: 456, chat: { id: 123 } } },
      });

      const result = await telegramService.sendMessage(123, 'Hello!');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          chat_id: 123,
          text: 'Hello!',
        })
      );
      expect(result).toEqual({ message_id: 456, chat: { id: 123 } });
    });

    it('should pass additional options', async () => {
      await telegramService.sendMessage(123, 'Test', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chat_id: 123,
          text: 'Test',
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
        })
      );
    });

    it('should return null when chatId is missing', async () => {
      const result = await telegramService.sendMessage(null, 'Test');
      expect(result).toBeNull();
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should throw on API error', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('API Error'));

      await expect(telegramService.sendMessage(123, 'Test')).rejects.toThrow('API Error');
    });
  });

  describe('notifyNewOrder', () => {
    it('should format new order notification correctly', async () => {
      const orderData = {
        id: 1,
        product_name: 'Test Product',
        total_price: 100,
        currency: 'USD',
        buyer_username: 'buyer123',
      };

      await telegramService.notifyNewOrder(12345, orderData);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chat_id: 12345,
          text: expect.stringContaining('New Order #1'),
        })
      );
    });

    it('should handle anonymous buyer', async () => {
      const orderData = {
        id: 2,
        product_name: 'Product',
        total_price: 50,
        currency: 'EUR',
        buyer_username: null,
      };

      await telegramService.notifyNewOrder(12345, orderData);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: expect.stringContaining('Anonymous'),
        })
      );
    });
  });

  describe('notifyPaymentConfirmed', () => {
    it('should format payment confirmation for buyer', async () => {
      const orderData = {
        product_name: 'Digital Product',
        quantity: 1,
        total_price: 25,
        seller_username: 'seller',
        shop_name: 'Test Shop',
      };

      await telegramService.notifyPaymentConfirmed(123, orderData);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: expect.stringContaining('Заказ оформлен'),
        })
      );
    });

    it('should include quantity when more than 1', async () => {
      const orderData = {
        product_name: 'Item',
        quantity: 5,
        total_price: 100,
        seller_username: 'seller',
        shop_name: 'Shop',
      };

      await telegramService.notifyPaymentConfirmed(123, orderData);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: expect.stringContaining('5 шт'),
        })
      );
    });
  });

  describe('notifyPaymentConfirmedSeller', () => {
    it('should include delivery button', async () => {
      const orderData = {
        productName: 'Product',
        quantity: 1,
        totalPrice: 50,
        currency: 'BTC',
        buyerUsername: 'buyer',
        orderId: 123,
      };

      await telegramService.notifyPaymentConfirmedSeller(456, orderData);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Отметить выдачу', callback_data: 'order:deliver:123' }],
            ],
          },
        })
      );
    });
  });

  describe('notifyOrderStatusUpdate', () => {
    it('should use correct emoji for each status', async () => {
      const statuses = [
        { status: 'pending', emoji: '⏳' },
        { status: 'confirmed', emoji: '✅' },
        { status: 'shipped', emoji: '🚚' },
        { status: 'delivered', emoji: '📦' },
        { status: 'cancelled', emoji: '❌' },
      ];

      for (const { status, emoji } of statuses) {
        mockAxiosPost.mockClear();
        
        await telegramService.notifyOrderStatusUpdate(123, {
          id: 1,
          status,
          product_name: 'Product',
        });

        expect(mockAxiosPost).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            text: expect.stringContaining(emoji),
          })
        );
      }
    });

    it('should use default emoji for unknown status', async () => {
      await telegramService.notifyOrderStatusUpdate(123, {
        id: 1,
        status: 'unknown_status',
        product_name: 'Product',
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: expect.stringContaining('📋'),
        })
      );
    });
  });

  describe('notifySubscriptionActivated', () => {
    it('should format PRO subscription notification', async () => {
      await telegramService.notifySubscriptionActivated(123, {
        shopName: 'My Shop',
        tier: 'pro',
        nextPaymentDue: '2025-01-15',
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: expect.stringContaining('⭐'),
          parse_mode: 'HTML',
        })
      );
    });

    it('should return null when telegramId is missing', async () => {
      const result = await telegramService.notifySubscriptionActivated(null, {});
      expect(result).toBeNull();
    });
  });

  describe('notifySubscriptionPendingSetup', () => {
    it('should include create shop button', async () => {
      await telegramService.notifySubscriptionPendingSetup(123, { tier: 'basic' });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: '🏪 Создать магазин',
                  callback_data: 'start_create_shop:basic',
                }),
              ]),
            ]),
          },
        })
      );
    });
  });

  describe('getBotInfo', () => {
    it('should return bot info', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { result: { id: 123, username: 'mybot', first_name: 'My Bot' } },
      });

      const result = await telegramService.getBotInfo();

      expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining('/getMe'));
      expect(result).toEqual({ id: 123, username: 'mybot', first_name: 'My Bot' });
    });

    it('should throw on API error', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Network error'));

      await expect(telegramService.getBotInfo()).rejects.toThrow('Network error');
    });
  });

  describe('setWebhook', () => {
    it('should set webhook with URL', async () => {
      await telegramService.setWebhook('https://example.com/webhook');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('/setWebhook'),
        expect.objectContaining({
          url: 'https://example.com/webhook',
          allowed_updates: ['message', 'callback_query'],
        })
      );
    });
  });

  describe('deleteWebhook', () => {
    it('should delete webhook', async () => {
      await telegramService.deleteWebhook();

      expect(mockAxiosPost).toHaveBeenCalledWith(expect.stringContaining('/deleteWebhook'));
    });
  });
});
