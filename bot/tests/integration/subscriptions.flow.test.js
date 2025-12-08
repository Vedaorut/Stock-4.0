/**
 * Subscriptions Flow Integration Test
 *
 * Тестирует subscribe/unsubscribe flow с идемпотентностью и button flip
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate } from '../helpers/updateFactories.js';
import { findButton } from '../helpers/callsCaptor.js';
import { api } from '../../src/utils/api.js';

describe('Subscriptions Flow - Subscribe/Unsubscribe/Idempotency (P0)', () => {
  let testBot;
  let mock;

  const shopId = '123';
  const mockShop = {
    id: shopId,
    name: 'Test Shop',
    description: 'Test Shop Description',
    seller_username: 'testseller',
    seller_first_name: 'Test Seller',
  };

  const mockProducts = [
    { id: 1, name: 'Product 1', price: 10.0 },
    { id: 2, name: 'Product 2', price: 20.0 },
  ];

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        user: { id: 1, telegramId: '123456', selectedRole: 'buyer' },
      },
    });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('подписка на магазин: shop:view → subscribe → кнопка flip → unsubscribe → кнопка flip', async () => {
    // Step 1: View shop (not subscribed)
    mock.onGet(`/shops/${shopId}`).reply(200, { data: mockShop });
    // ✅ FIX: API использует /products?shopId=X, а НЕ /products/shop/X
    mock.onGet('/products').reply(200, { data: mockProducts });
    // FIX: Use correct API path /shops/:shopId/subscribed
    mock.onGet(`/shops/${shopId}/subscribed`).reply(200, {
      data: { subscribed: false },
    });

    await testBot.handleUpdate(callbackUpdate(`shop:view:${shopId}`));

    // ✅ FIX: Дать время на async API calls (3 calls: getShop, getProducts, checkSubscription)
    await new Promise((resolve) => setImmediate(resolve));

    // Проверяем что answerCbQuery был вызван
    expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);

    // Проверяем что есть кнопка "Подписаться"
    const markup1 = testBot.getLastMarkup();
    const subscribeBtn = findButton('Подписаться', markup1);
    expect(subscribeBtn).toBeTruthy();
    expect(subscribeBtn.callback_data).toBe(`subscribe:${shopId}`);

    testBot.captor.reset();

    // Step 2: Subscribe to shop
    // FIX: Use correct API path /shops/:shopId/subscribe
    mock.onPost(`/shops/${shopId}/subscribe`).reply(200, { data: { shopId, userId: 1 } });
    mock.onGet(`/shops/${shopId}`).reply(200, { data: mockShop });
    // FIX: Use correct API path /shops/:shopId/subscribed
    mock.onGet(`/shops/${shopId}/subscribed`).reply(200, {
      data: { subscribed: false }, // Before subscribe
    });

    await testBot.handleUpdate(callbackUpdate(`subscribe:${shopId}`));

    // ✅ FIX: Дать время на async subscribe API call
    await new Promise((resolve) => setImmediate(resolve));

    // Проверяем answerCbQuery (toast shows "Готово")
    expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);
    const answers = testBot.captor.getAnswers();
    expect(answers.some((a) => a.text && a.text.includes('Готово'))).toBe(true);

    // Проверяем что сообщение содержит подтверждение подписки
    const messageText = testBot.getLastReplyText();
    expect(messageText).toContain('Подписка оформлена');

    // Проверяем что кнопка изменилась на "Подписан"
    const markup2 = testBot.getLastMarkup();
    const subscribedBtn = findButton('Подписан', markup2);
    expect(subscribedBtn).toBeTruthy();
    expect(subscribedBtn.callback_data).toBe('noop:subscribed');

    // Проверяем что есть кнопка "Отписаться"
    const unsubscribeBtn = findButton('Отписаться', markup2);
    expect(unsubscribeBtn).toBeTruthy();
    expect(unsubscribeBtn.callback_data).toBe(`unsubscribe:${shopId}`);

    testBot.captor.reset();

    // Step 3: Попытка повторной подписки (идемпотентность)
    // FIX: Use correct API path /shops/:shopId/subscribed
    mock.onGet(`/shops/${shopId}/subscribed`).reply(200, {
      data: { subscribed: true }, // Already subscribed
    });
    mock.onGet(`/shops/${shopId}`).reply(200, { data: mockShop });

    await testBot.handleUpdate(callbackUpdate(`subscribe:${shopId}`));

    // ✅ FIX: Дать время на async check subscription call
    await new Promise((resolve) => setImmediate(resolve));

    // Проверяем что показали информационное сообщение
    const answers2 = testBot.captor.getAnswers();
    expect(answers2.some((a) => a.text && a.text.includes('уже в ваших подписках'))).toBe(true);

    // Проверяем что markup остался с кнопкой "Подписан"
    const markup3 = testBot.getLastMarkup();
    const stillSubscribedBtn = findButton('Подписан', markup3);
    expect(stillSubscribedBtn).toBeTruthy();

    testBot.captor.reset();

    // Step 4: Unsubscribe from shop
    // FIX: Use correct API path /shops/:shopId/subscribe (DELETE)
    mock.onDelete(`/shops/${shopId}/subscribe`).reply(200, { data: { success: true } });
    mock.onGet(`/shops/${shopId}`).reply(200, { data: mockShop });

    await testBot.handleUpdate(callbackUpdate(`unsubscribe:${shopId}`));

    // ✅ FIX: Дать время на async unsubscribe API call
    await new Promise((resolve) => setImmediate(resolve));

    // Проверяем answerCbQuery
    expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);

    // Проверяем что кнопка вернулась к "Подписаться"
    const markup4 = testBot.getLastMarkup();
    const resubscribeBtn = findButton('Подписаться', markup4);
    expect(resubscribeBtn).toBeTruthy();
    expect(resubscribeBtn.callback_data).toBe(`subscribe:${shopId}`);

    // Проверяем что нет кнопки "Подписан"
    const noSubscribedBtn = findButton('Подписан', markup4);
    expect(noSubscribedBtn).toBeNull();
  });

  it('нельзя подписаться на свой магазин', async () => {
    // Mock subscribe API with error
    // FIX: Use correct API path /shops/:shopId/subscribed
    mock.onGet(`/shops/${shopId}/subscribed`).reply(200, {
      data: { subscribed: false },
    });
    // FIX: Use correct API path /shops/:shopId/subscribe
    mock.onPost(`/shops/${shopId}/subscribe`).reply(400, {
      error: 'Cannot subscribe to your own shop',
    });

    await testBot.handleUpdate(callbackUpdate(`subscribe:${shopId}`));

    // Проверяем что показали ошибку
    const answers = testBot.captor.getAnswers();
    expect(
      answers.some((a) => a.text && a.text.includes('Нельзя подписаться на собственный магазин'))
    ).toBe(true);
  });

  it('отписка без токена → ошибка', async () => {
    // Create new testBot without token
    const noTokenBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: null, // No token
        user: { id: 1, telegramId: '123456', selectedRole: 'buyer' },
      },
    });

    await noTokenBot.handleUpdate(callbackUpdate(`unsubscribe:${shopId}`));

    // Проверяем что показали ошибку авторизации
    const answers = noTokenBot.captor.getAnswers();
    expect(answers.some((a) => a.text && a.text.includes('Требуется авторизация'))).toBe(true);

    noTokenBot.reset();
  });
});
