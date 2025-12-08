/**
 * Buyer Subscriptions Flow Integration Test
 *
 * Тестирует полный цикл подписок покупателя:
 * - Subscribe to shop (checkSubscription → false)
 * - Already subscribed (idempotency)
 * - View subscriptions list
 * - Unsubscribe from shop
 * - Edge cases (own shop, limits, errors)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate } from '../helpers/updateFactories.js';
import { findButton } from '../helpers/callsCaptor.js';
import { api } from '../../src/utils/api.js';

describe('Buyer Subscriptions Flow (P0)', () => {
  let testBot;
  let mock;

  const mockShop = {
    id: 123,
    name: 'Shop A',
    description: 'Test Shop Description',
    seller_username: 'testseller',
    seller_first_name: 'Test Seller',
    tier: 'pro',
  };

  const mockProducts = [
    { id: 1, name: 'Product 1', price: 10.0, stock_quantity: 5, preorder: false },
    { id: 2, name: 'Product 2', price: 20.0, stock_quantity: 0, preorder: true },
  ];

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        role: 'buyer',
        userId: 2,
        user: { id: 2, telegramId: '123456', selectedRole: 'buyer' },
      },
    });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  describe('Subscribe to Shop', () => {
    it('должен подписаться на магазин (checkSubscription → false)', async () => {
      // Step 1: Check subscription (not subscribed)
      // FIX: Use correct API path /shops/:shopId/subscribed
      mock.onGet(/\/shops\/123\/subscribed/).reply(200, {
        data: { subscribed: false },
      });

      // Step 2: Subscribe
      // FIX: Use correct API path /shops/:shopId/subscribe
      mock.onPost('/shops/123/subscribe').reply(200, {
        data: { shopId: 123, userId: 2 },
      });

      // Step 3: Get shop details
      mock.onGet('/shops/123').reply(200, { data: mockShop });

      // Step 4: Get products for section counts
      mock.onGet('/products').reply(200, { data: mockProducts });

      await testBot.handleUpdate(callbackUpdate('subscribe:123'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем что answerCbQuery был вызван с "Готово"
      expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);
      const answers = testBot.captor.getAnswers();
      expect(answers.some((a) => a.text && a.text.includes('Готово'))).toBe(true);

      // Проверяем текст сообщения
      const text = testBot.getLastReplyText();
      expect(text).toContain('Подписка оформлена');
      expect(text).toContain('Shop A');

      // Проверяем что появилась кнопка "Подписан"
      const markup = testBot.getLastMarkup();
      const subscribedBtn = findButton('Подписан', markup);
      expect(subscribedBtn).toBeTruthy();
      expect(subscribedBtn.callback_data).toBe('noop:subscribed');

      // Проверяем что есть кнопка "Отписаться"
      const unsubscribeBtn = findButton('Отписаться', markup);
      expect(unsubscribeBtn).toBeTruthy();
      expect(unsubscribeBtn.callback_data).toBe('unsubscribe:123');
    });

    it('already subscribed → noop toast (идемпотентность)', async () => {
      // Already subscribed
      // FIX: Use correct API path /shops/:shopId/subscribed
      mock.onGet(/\/shops\/123\/subscribed/).reply(200, {
        data: { subscribed: true },
      });

      mock.onGet('/shops/123').reply(200, { data: mockShop });
      mock.onGet('/products').reply(200, { data: mockProducts });

      await testBot.handleUpdate(callbackUpdate('subscribe:123'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем что показали информационное сообщение
      const answers = testBot.captor.getAnswers();
      expect(answers.some((a) => a.text && a.text.includes('уже в ваших подписках'))).toBe(true);

      // Проверяем что текст содержит "уже в ваших подписках"
      const text = testBot.getLastReplyText();
      expect(text).toContain('уже в ваших подписках');

      // Проверяем что кнопка "Подписан" уже отображается
      const markup = testBot.getLastMarkup();
      const subscribedBtn = findButton('Подписан', markup);
      expect(subscribedBtn).toBeTruthy();
    });
  });

  describe('Unsubscribe', () => {
    it('должен отписаться от магазина', async () => {
      // Unsubscribe API
      // FIX: Use correct API path /shops/:shopId/subscribe (DELETE)
      mock.onDelete('/shops/123/subscribe').reply(200, {
        data: { unsubscribed: true },
      });

      // Get shop details
      mock.onGet('/shops/123').reply(200, { data: mockShop });

      // Get products for section counts
      mock.onGet('/products').reply(200, { data: mockProducts });

      await testBot.handleUpdate(callbackUpdate('unsubscribe:123'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем answerCbQuery
      expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);

      // Проверяем текст сообщения
      const text = testBot.getLastReplyText();
      expect(text).toContain('отключена');
      expect(text).toContain('Shop A');

      // Проверяем что кнопка вернулась к "Подписаться"
      const markup = testBot.getLastMarkup();
      const subscribeBtn = findButton('Подписаться', markup);
      expect(subscribeBtn).toBeTruthy();
      expect(subscribeBtn.callback_data).toBe('subscribe:123');

      // Проверяем что нет кнопки "Подписан"
      const subscribedBtn = findButton('Подписан', markup);
      expect(subscribedBtn).toBeNull();
    });

    it('отписка без токена → ошибка авторизации', async () => {
      // Create bot without token
      const noTokenBot = createTestBot({
        skipAuth: true,
        mockSession: {
          token: null,
          role: 'buyer',
          user: { id: 2, telegramId: '123456', selectedRole: 'buyer' },
        },
      });

      await noTokenBot.handleUpdate(callbackUpdate('unsubscribe:123'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем что показали ошибку авторизации
      const answers = noTokenBot.captor.getAnswers();
      expect(answers.some((a) => a.text && a.text.includes('Требуется авторизация'))).toBe(true);

      noTokenBot.reset();
    });
  });

  describe('View Subscriptions', () => {
    it('должен показать список подписок', async () => {
      const mockSubscriptions = [
        { shop_id: 1, shop_name: 'Shop A', tier: 'pro' },
        { shop_id: 2, shop_name: 'Shop B', tier: 'basic' },
      ];

      // FIX: Use correct API path /users/subscriptions
      mock.onGet('/users/subscriptions').reply(200, {
        data: mockSubscriptions,
      });

      await testBot.handleUpdate(callbackUpdate('buyer:subscriptions'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем answerCbQuery
      expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);

      // Проверяем текст сообщения
      const text = testBot.getLastReplyText();
      expect(text).toContain('Shop A');
      expect(text).toContain('Shop B');
      expect(text).toContain('Мои подписки');
    });

    it('empty state → no subscriptions message', async () => {
      // FIX: Use correct API path /users/subscriptions
      mock.onGet('/users/subscriptions').reply(200, { data: [] });

      await testBot.handleUpdate(callbackUpdate('buyer:subscriptions'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем текст сообщения
      const text = testBot.getLastReplyText();
      expect(text).toContain('Нет подписок');
    });

    it('без токена → ошибка авторизации', async () => {
      // Create bot without token
      const noTokenBot = createTestBot({
        skipAuth: true,
        mockSession: {
          token: null,
          role: 'buyer',
          user: { id: 2, telegramId: '123456', selectedRole: 'buyer' },
        },
      });

      await noTokenBot.handleUpdate(callbackUpdate('buyer:subscriptions'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем текст сообщения
      const text = noTokenBot.getLastReplyText();
      expect(text).toContain('Требуется авторизация');

      noTokenBot.reset();
    });
  });

  describe('Edge Cases', () => {
    it('subscribe to own shop → error', async () => {
      // Check subscription
      // FIX: Use correct API path /shops/:shopId/subscribed
      mock.onGet(/\/shops\/123\/subscribed/).reply(200, {
        data: { subscribed: false },
      });

      // Subscribe returns error
      // FIX: Use correct API path /shops/:shopId/subscribe
      mock.onPost('/shops/123/subscribe').reply(400, {
        error: 'Cannot subscribe to your own shop',
      });

      await testBot.handleUpdate(callbackUpdate('subscribe:123'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем что показали ошибку
      const answers = testBot.captor.getAnswers();
      expect(
        answers.some((a) => a.text && a.text.includes('Нельзя подписаться на собственный магазин'))
      ).toBe(true);
    });

    it('subscription limit (BASIC) → upgrade prompt', async () => {
      // Check subscription
      // FIX: Use correct API path /shops/:shopId/subscribed
      mock.onGet(/\/shops\/123\/subscribed/).reply(200, {
        data: { subscribed: false },
      });

      // Subscribe returns limit error
      // FIX: Use correct API path /shops/:shopId/subscribe
      mock.onPost('/shops/123/subscribe').reply(400, {
        error: 'Subscription limit reached',
      });

      await testBot.handleUpdate(callbackUpdate('subscribe:123'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем что показали ошибку (generic error message)
      const answers = testBot.captor.getAnswers();
      expect(answers.some((a) => a.text && a.text.includes('Не удалось оформить подписку'))).toBe(
        true
      );
    });

    it('API error при получении подписок → error message', async () => {
      // API returns error
      // FIX: Use correct API path /users/subscriptions
      mock.onGet('/users/subscriptions').reply(500, {
        error: 'Internal server error',
      });

      await testBot.handleUpdate(callbackUpdate('buyer:subscriptions'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем что показали ошибку
      const text = testBot.getLastReplyText();
      expect(text).toContain('Не удалось выполнить действие');
    });

    it('API error при отписке → error alert', async () => {
      // Unsubscribe API returns error
      // FIX: Use correct API path /shops/:shopId/subscribe (DELETE)
      mock.onDelete('/shops/123/subscribe').reply(500, {
        error: 'Internal server error',
      });

      await testBot.handleUpdate(callbackUpdate('unsubscribe:123'));

      // Wait for async operations
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем что показали ошибку
      const answers = testBot.captor.getAnswers();
      expect(answers.some((a) => a.text && a.text.includes('Не удалось отменить подписку'))).toBe(
        true
      );
    });
  });

  describe('Subscribe/Unsubscribe Full Cycle', () => {
    it('полный цикл: view shop → subscribe → already subscribed → unsubscribe', async () => {
      // Step 1: View shop (not subscribed)
      mock.onGet('/shops/123').reply(200, { data: mockShop });
      mock.onGet('/products').reply(200, { data: mockProducts });
      // FIX: Use correct API path /shops/:shopId/subscribed
      mock.onGet(/\/shops\/123\/subscribed/).reply(200, {
        data: { subscribed: false },
      });

      await testBot.handleUpdate(callbackUpdate('shop:view:123'));
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем кнопку "Подписаться"
      let markup = testBot.getLastMarkup();
      let subscribeBtn = findButton('Подписаться', markup);
      expect(subscribeBtn).toBeTruthy();

      testBot.captor.reset();

      // Step 2: Subscribe
      // FIX: Use correct API paths
      mock.onGet(/\/shops\/123\/subscribed/).reply(200, {
        data: { subscribed: false },
      });
      mock.onPost('/shops/123/subscribe').reply(200, {
        data: { shopId: 123, userId: 2 },
      });
      mock.onGet('/shops/123').reply(200, { data: mockShop });
      mock.onGet('/products').reply(200, { data: mockProducts });

      await testBot.handleUpdate(callbackUpdate('subscribe:123'));
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем кнопку "Подписан"
      markup = testBot.getLastMarkup();
      let subscribedBtn = findButton('Подписан', markup);
      expect(subscribedBtn).toBeTruthy();

      testBot.captor.reset();

      // Step 3: Try to subscribe again (idempotency)
      // FIX: Use correct API path /shops/:shopId/subscribed
      mock.onGet(/\/shops\/123\/subscribed/).reply(200, {
        data: { subscribed: true },
      });
      mock.onGet('/shops/123').reply(200, { data: mockShop });
      mock.onGet('/products').reply(200, { data: mockProducts });

      await testBot.handleUpdate(callbackUpdate('subscribe:123'));
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем toast "уже в подписках"
      const answers = testBot.captor.getAnswers();
      expect(answers.some((a) => a.text && a.text.includes('уже в ваших подписках'))).toBe(true);

      testBot.captor.reset();

      // Step 4: Unsubscribe
      // FIX: Use correct API path /shops/:shopId/subscribe (DELETE)
      mock.onDelete('/shops/123/subscribe').reply(200, {
        data: { unsubscribed: true },
      });
      mock.onGet('/shops/123').reply(200, { data: mockShop });
      mock.onGet('/products').reply(200, { data: mockProducts });

      await testBot.handleUpdate(callbackUpdate('unsubscribe:123'));
      await new Promise((resolve) => setImmediate(resolve));

      // Проверяем кнопку вернулась к "Подписаться"
      markup = testBot.getLastMarkup();
      subscribeBtn = findButton('Подписаться', markup);
      expect(subscribeBtn).toBeTruthy();

      subscribedBtn = findButton('Подписан', markup);
      expect(subscribedBtn).toBeNull();
    });
  });
});
