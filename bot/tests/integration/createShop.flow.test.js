/**
 * Create Shop Flow Integration Test
 *
 * Тестирует wizard создания магазина с валидацией
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate, textUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

describe('Create Shop Flow - Wizard Validation (P0)', () => {
  let testBot;
  let mock;

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' }
      }
    });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('создание магазина: короткое имя → ошибка, валидное имя → успех', async () => {
    // Step 1: Enter createShop scene
    await testBot.handleUpdate(callbackUpdate('seller:create_shop'));

    // Проверяем что answerCbQuery был вызван
    expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);

    // Проверяем что показали приглашение ввести имя (minimalist)
    const text1 = testBot.getLastReplyText();
    expect(text1).toContain('Название');

    testBot.captor.reset();

    // Step 2: Enter short name (less than 3 chars) → validation error
    await testBot.handleUpdate(textUpdate('ab'));

    const text2 = testBot.getLastReplyText();
    expect(text2).toContain('Минимум 3 символа');

    // Проверяем что session.shopId НЕ установлен
    const session1 = testBot.getSession();
    expect(session1.shopId).toBeUndefined();

    testBot.captor.reset();

    // Step 3: Enter valid name → success
    const shopName = 'MyTestShop';
    mock.onPost('/shops').reply(201, {
      data: {
        id: 1,
        name: shopName,
        description: `Магазин ${shopName}`,
        sellerId: 1
      }
    });

    await testBot.handleUpdate(textUpdate(shopName));

    // Проверяем что показали сообщение о сохранении
    const replies = testBot.captor.getReplies();
    expect(replies.some(r => r.text === 'Сохраняем...')).toBe(true);

    // Проверяем что показали успех (minimalist: "✅ {shopName}")
    const text3 = testBot.getLastReplyText();
    expect(text3).toContain('✅');
    expect(text3).toContain(shopName);

    // Проверяем что session.shopId установлен
    const session2 = testBot.getSession();
    expect(session2.shopId).toBe(1);
    expect(session2.shopName).toBe(shopName);

    // Проверяем что API был вызван один раз
    expect(mock.history.post.length).toBe(1);
    expect(mock.history.post[0].url).toBe('/shops');
    const requestData = JSON.parse(mock.history.post[0].data);
    expect(requestData.name).toBe(shopName);
  });

  it('имя слишком длинное (>100 символов) → ошибка', async () => {
    // Enter scene
    await testBot.handleUpdate(callbackUpdate('seller:create_shop'));
    testBot.captor.reset();

    // Enter too long name
    const longName = 'a'.repeat(101);
    await testBot.handleUpdate(textUpdate(longName));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Макс 100 символов');

    // Проверяем что session.shopId НЕ установлен
    const session = testBot.getSession();
    expect(session.shopId).toBeUndefined();
  });

  it('создание магазина без токена → ошибка', async () => {
    // Create new testBot with no token
    const noTokenBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: null, // No token
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' }
      }
    });

    // Enter scene
    await noTokenBot.handleUpdate(callbackUpdate('seller:create_shop'));
    noTokenBot.captor.reset();

    // Try to create shop
    await noTokenBot.handleUpdate(textUpdate('MyShop'));

    // Проверяем что показали ошибку авторизации
    const text = noTokenBot.getLastReplyText();
    expect(text).toContain('Ошибка авторизации');

    // Проверяем что session.shopId НЕ установлен
    const session = noTokenBot.getSession();
    expect(session.shopId).toBeUndefined();

    // Проверяем что API НЕ был вызван
    expect(mock.history.post.length).toBe(0);

    noTokenBot.reset();
  });

  it('повторное подтверждение → НЕ дублирует POST запрос', async () => {
    // Enter scene
    await testBot.handleUpdate(callbackUpdate('seller:create_shop'));
    testBot.captor.reset();

    // Create shop
    const shopName = 'UniqueShop';
    mock.onPost('/shops').reply(201, {
      data: { id: 1, name: shopName, description: `Магазин ${shopName}`, sellerId: 1 }
    });

    await testBot.handleUpdate(textUpdate(shopName));

    // Проверяем что API был вызван один раз
    expect(mock.history.post.length).toBe(1);

    // Wizard уже завершён и вышел из scene
    // Повторная попытка создать магазин НЕ должна быть возможна
    // (пользователь вышел из scene после успешного создания)
    testBot.captor.reset();

    // Попытка отправить ещё одно имя (но scene уже завершён)
    await testBot.handleUpdate(textUpdate('AnotherShop'));

    // Проверяем что API НЕ был вызван повторно
    expect(mock.history.post.length).toBe(1); // Всё ещё 1
  });
});
