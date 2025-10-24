/**
 * Integration Tests for Channel Migration Wizard
 */

import { callbackUpdate, textUpdate } from '../helpers/updateFactories.js';
import { createTestBot } from '../helpers/testBot.js';
import MockAdapter from 'axios-mock-adapter';
import { api } from '../../src/utils/api.js';

describe('Channel Migration Wizard Integration Tests', () => {
  let mock;
  let testBot;

  beforeEach(() => {
    mock = new MockAdapter(api);
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-token',
        shopId: 1,
        shopName: 'Test Shop',
        role: 'seller'
      }
    });
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Happy Path - Full Migration Flow', () => {
    it('should complete migration wizard successfully', async () => {
      // Step 1: Check eligibility
      mock.onGet('/shops/1/migration/check').reply(200, {
        eligible: true,
        shop: { id: 1, name: 'Test Shop', tier: 'pro' },
        limits: { used: 0, limit: 2, remaining: 2, resetDate: '2025-11-01' },
        subscriberCount: 10
      });

      // Enter scene via callback
      await testBot.handleUpdate(callbackUpdate('seller:migrate_channel'));
      await new Promise(resolve => setImmediate(resolve));

      let text = testBot.getLastReplyText();
      expect(text).toContain('Миграция Telegram канала');
      expect(text).toContain('Подписчиков: 10');
      expect(text).toContain('Использовано рассылок: 0/2');

      // Step 2: Proceed to URL input
      await testBot.handleUpdate(callbackUpdate('migration:proceed'));
      await new Promise(resolve => setImmediate(resolve));

      text = testBot.getLastReplyText();
      expect(text).toContain('отправьте ссылку');
      expect(text).toContain('новый канал');

      // Step 3: Enter new channel URL
      await testBot.handleUpdate(textUpdate('https://t.me/new_channel'));
      await new Promise(resolve => setImmediate(resolve));

      text = testBot.getLastReplyText();
      expect(text).toContain('старую ссылку');
      expect(text).toContain('Пропустить');

      // Step 4: Skip old URL
      mock.onPost('/shops/1/migration').reply(201, {
        migrationId: 1,
        shopId: 1,
        shopName: 'Test Shop',
        newChannelUrl: 'https://t.me/new_channel',
        subscriberCount: 10,
        status: 'pending'
      });

      // Mock getShopSubscribers (через broadcastService)
      mock.onGet('/subscriptions').reply(200, {
        data: [
          { user_id: 1, telegram_id: '123456' },
          { user_id: 2, telegram_id: '789012' }
        ]
      });

      await testBot.handleUpdate(callbackUpdate('migration:skip_old'));
      await new Promise(resolve => setImmediate(resolve));

      text = testBot.getLastReplyText();
      // Should show success message
      expect(text).toContain('Рассылка запущена');
    });
  });

  describe('Error Cases', () => {
    it('should reject free tier users', async () => {
      mock.onGet('/shops/1/migration/check').reply(200, {
        eligible: false,
        error: 'UPGRADE_REQUIRED',
        message: 'Channel migration is a PRO feature.'
      });

      await testBot.handleUpdate(callbackUpdate('seller:migrate_channel'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Миграция канала недоступна');
      expect(text).toContain('PRO');
    });

    it('should reject when limit exceeded', async () => {
      mock.onGet('/shops/1/migration/check').reply(200, {
        eligible: false,
        error: 'LIMIT_EXCEEDED',
        message: 'You have reached the maximum of 2 migrations per month.',
        data: { used: 2, limit: 2, remaining: 0 }
      });

      await testBot.handleUpdate(callbackUpdate('seller:migrate_channel'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('недоступна');
      expect(text).toContain('maximum');
    });

    it('should validate channel URL format', async () => {
      mock.onGet('/shops/1/migration/check').reply(200, {
        eligible: true,
        shop: { id: 1, name: 'Test Shop', tier: 'pro' },
        limits: { used: 0, limit: 2, remaining: 2 },
        subscriberCount: 10
      });

      await testBot.handleUpdate(callbackUpdate('seller:migrate_channel'));
      await new Promise(resolve => setImmediate(resolve));

      await testBot.handleUpdate(callbackUpdate('migration:proceed'));
      await new Promise(resolve => setImmediate(resolve));

      // Invalid URL
      await testBot.handleUpdate(textUpdate('invalid-url'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Некорректная ссылка');
    });

    it('should handle API errors gracefully', async () => {
      mock.onGet('/shops/1/migration/check').reply(500, {
        error: 'Internal server error'
      });

      await testBot.handleUpdate(callbackUpdate('seller:migrate_channel'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Ошибка');
    });
  });

  describe('Cancel Flow', () => {
    it('should allow cancel at any step', async () => {
      mock.onGet('/shops/1/migration/check').reply(200, {
        eligible: true,
        shop: { id: 1, name: 'Test Shop', tier: 'pro' },
        limits: { used: 0, limit: 2, remaining: 2 },
        subscriberCount: 10
      });

      await testBot.handleUpdate(callbackUpdate('seller:migrate_channel'));
      await new Promise(resolve => setImmediate(resolve));

      // Cancel from confirmation
      await testBot.handleUpdate(callbackUpdate('seller:main'));
      await new Promise(resolve => setImmediate(resolve));

      // Should exit scene
      const session = testBot.getSession();
      expect(session.scene).toBeUndefined();
    });
  });

  describe('No Shop Scenario', () => {
    it('should handle missing shopId', async () => {
      // Use setSessionState to override shopId
      testBot.setSessionState({ shopId: null });

      await testBot.handleUpdate(callbackUpdate('seller:migrate_channel'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Магазин не найден');
    });
  });

  describe('URL Validation', () => {
    beforeEach(async () => {
      mock.onGet('/shops/1/migration/check').reply(200, {
        eligible: true,
        shop: { id: 1, name: 'Test Shop', tier: 'pro' },
        limits: { used: 0, limit: 2, remaining: 2 },
        subscriberCount: 10
      });

      await testBot.handleUpdate(callbackUpdate('seller:migrate_channel'));
      await new Promise(resolve => setImmediate(resolve));

      await testBot.handleUpdate(callbackUpdate('migration:proceed'));
      await new Promise(resolve => setImmediate(resolve));
    });

    it('should accept t.me links', async () => {
      await testBot.handleUpdate(textUpdate('https://t.me/test_channel'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).not.toContain('Некорректная');
      expect(text).toContain('старую ссылку');
    });

    it('should accept @username format', async () => {
      await testBot.handleUpdate(textUpdate('@test_channel'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).not.toContain('Некорректная');
    });

    it('should reject invalid format', async () => {
      await testBot.handleUpdate(textUpdate('not-a-link'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Некорректная ссылка');
    });
  });
});
