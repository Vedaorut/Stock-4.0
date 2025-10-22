/**
 * Add Product Flow Integration Test
 *
 * Тестирует wizard добавления товара с валидацией цены (comma → dot)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate, textUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

describe('Add Product Flow - Price Validation (P0)', () => {
  let testBot;
  let mock;

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' },
        shopId: 1,
        shopName: 'Test Shop'
      }
    });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('добавление товара: имя → цена с запятой → запятая заменена на точку → успех', async () => {
    // Step 1: Enter addProduct scene
    await testBot.handleUpdate(callbackUpdate('seller:add_product'));

    // Проверяем что answerCbQuery был вызван
    expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);

    // Проверяем что показали приглашение ввести название
    const text1 = testBot.getLastReplyText();
    expect(text1).toContain('Название товара');

    testBot.captor.reset();

    // Step 2: Enter product name
    const productName = 'Test Product';
    await testBot.handleUpdate(textUpdate(productName));

    // Проверяем что показали приглашение ввести цену
    const text2 = testBot.getLastReplyText();
    expect(text2).toContain('Цена ($)');

    testBot.captor.reset();

    // Step 3: Enter price with comma (99,99)
    const priceWithComma = '99,99';
    const expectedPrice = 99.99;

    mock.onPost('/products').reply(201, {
      data: {
        id: 1,
        name: productName,
        price: expectedPrice,
        currency: 'USD',
        shopId: 1,
        stockQuantity: 0
      }
    });

    await testBot.handleUpdate(textUpdate(priceWithComma));

    // Проверяем что показали сообщение о сохранении
    const replies = testBot.captor.getReplies();
    expect(replies.some(r => r.text === 'Сохраняем...')).toBe(true);

    // Проверяем что показали успех
    const text3 = testBot.getLastReplyText();
    expect(text3).toContain('✓');
    expect(text3).toContain(productName);

    // Проверяем что API был вызван один раз с правильной ценой
    expect(mock.history.post.length).toBe(1);
    expect(mock.history.post[0].url).toBe('/products');
    const requestData = JSON.parse(mock.history.post[0].data);
    expect(requestData.name).toBe(productName);
    expect(requestData.price).toBe(expectedPrice); // 99.99 (не 99,99)
    expect(requestData.shopId).toBe(1);
  });

  it('короткое имя (<3 символа) → ошибка', async () => {
    // Enter scene
    await testBot.handleUpdate(callbackUpdate('seller:add_product'));
    testBot.captor.reset();

    // Enter short name
    await testBot.handleUpdate(textUpdate('ab'));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Минимум 3 символа');
  });

  it('неверная цена (не число) → ошибка', async () => {
    // Enter scene
    await testBot.handleUpdate(callbackUpdate('seller:add_product'));
    testBot.captor.reset();

    // Enter valid name
    await testBot.handleUpdate(textUpdate('Product'));
    testBot.captor.reset();

    // Enter invalid price
    await testBot.handleUpdate(textUpdate('invalid'));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Цена — число > 0');
  });

  it('отрицательная цена → ошибка', async () => {
    // Enter scene
    await testBot.handleUpdate(callbackUpdate('seller:add_product'));
    testBot.captor.reset();

    // Enter valid name
    await testBot.handleUpdate(textUpdate('Product'));
    testBot.captor.reset();

    // Enter negative price
    await testBot.handleUpdate(textUpdate('-10'));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Цена — число > 0');
  });

  it('цена = 0 → ошибка', async () => {
    // Enter scene
    await testBot.handleUpdate(callbackUpdate('seller:add_product'));
    testBot.captor.reset();

    // Enter valid name
    await testBot.handleUpdate(textUpdate('Product'));
    testBot.captor.reset();

    // Enter zero price
    await testBot.handleUpdate(textUpdate('0'));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Цена — число > 0');
  });

  it('добавление товара без shopId → ошибка', async () => {
    // ✅ NOTE: Handler seller:add_product проверяет shopId ДО входа в scene,
    // поэтому wizard НИКОГДА не окажется в ситуации "без shopId".
    // Тест проверяет defensive coding в wizard на случай edge case.

    // Создаём новый bot с пустым shopId (симуляция race condition)
    const noShopBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' },
        shopId: null
      }
    });

    // Пытаемся войти в scene - handler заблокирует вход
    await noShopBot.handleUpdate(callbackUpdate('seller:add_product'));

    // Проверяем что handler показал ошибку и НЕ пустил в scene
    const text = noShopBot.getLastReplyText();
    expect(text).toContain('Сначала создайте магазин');

    // Проверяем что API НЕ был вызван
    expect(mock.history.post.length).toBe(0);

    noShopBot.reset();
  });

  it('повторное подтверждение → НЕ дублирует POST запрос', async () => {
    // Enter scene
    await testBot.handleUpdate(callbackUpdate('seller:add_product'));
    testBot.captor.reset();

    // Add product
    mock.onPost('/products').reply(201, {
      data: { id: 1, name: 'Product', price: 10.00, currency: 'USD', shopId: 1 }
    });

    await testBot.handleUpdate(textUpdate('Product'));
    testBot.captor.reset();
    await testBot.handleUpdate(textUpdate('10'));

    // Проверяем что API был вызван один раз
    expect(mock.history.post.length).toBe(1);

    // Wizard уже завершён и вышел из scene
    testBot.captor.reset();

    // Попытка отправить ещё одну цену (но scene уже завершён)
    await testBot.handleUpdate(textUpdate('20'));

    // Проверяем что API НЕ был вызван повторно
    expect(mock.history.post.length).toBe(1); // Всё ещё 1
  });
});
