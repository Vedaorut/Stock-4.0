/**
 * Create Follow Scene Integration Test
 *
 * Тестирует wizard создания подписки с валидацией входных данных
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate, textUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

describe('Create Follow Scene - Wizard Validation (P0)', () => {
  let testBot;
  let mock;

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        shopId: 1,
        shopName: 'MyShop',
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' }
      }
    });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('невалидный shopId (не число) → ошибка', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Enter non-numeric shop ID
    await testBot.handleUpdate(textUpdate('abc'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    // FIX BUG #4: Updated error message
    expect(text).toContain('Введите число (ID магазина)');

    // Verify API was NOT called
    expect(mock.history.get.length).toBe(0);
  });

  it('невалидный shopId (отрицательное число) → ошибка', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    await testBot.handleUpdate(textUpdate('-5'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    // FIX BUG #4: Updated error message
    expect(text).toContain('Введите число (ID магазина)');
  });

  it('markup < 1% → ошибка валидации', async () => {
    // Enter scene and shop ID
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onGet('/shops/555').reply(200, {
      data: { id: 555, name: 'TestShop', sellerId: 2 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate('555'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Select Resell mode
    await testBot.handleUpdate(callbackUpdate('mode:resell'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Enter markup < 1
    await testBot.handleUpdate(textUpdate('0'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Наценка должна быть 1-500%');

    // Verify POST was NOT called
    expect(mock.history.post.length).toBe(0);
  });

  it('markup > 500% → ошибка валидации', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onGet('/shops/444').reply(200, {
      data: { id: 444, name: 'Shop444', sellerId: 3 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate('444'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    await testBot.handleUpdate(callbackUpdate('mode:resell'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Enter markup > 500
    await testBot.handleUpdate(textUpdate('501'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Наценка должна быть 1-500%');

    expect(mock.history.post.length).toBe(0);
  });

  it('markup не число → ошибка валидации', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onGet('/shops/333').reply(200, {
      data: { id: 333, name: 'Shop333', sellerId: 4 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate('333'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    await testBot.handleUpdate(callbackUpdate('mode:resell'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Enter non-numeric markup
    await testBot.handleUpdate(textUpdate('twenty'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Наценка должна быть 1-500%');
  });

  it('валидный markup (краевой случай 1%) → успех', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onGet('/shops/222').reply(200, {
      data: { id: 222, name: 'Shop222', sellerId: 5 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate('222'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    await testBot.handleUpdate(callbackUpdate('mode:resell'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onPost('/follows').reply(201, {
      data: { id: 3, source_shop_id: 222, target_shop_id: 1, mode: 'resell', markup_percentage: 1 }
    });

    await testBot.handleUpdate(textUpdate('1'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('✅');

    expect(mock.history.post.length).toBe(1);
    const requestData = JSON.parse(mock.history.post[0].data);
    expect(requestData.markupPercentage).toBe(1);
  });

  it('валидный markup (краевой случай 500%) → успех', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onGet('/shops/111').reply(200, {
      data: { id: 111, name: 'Shop111', sellerId: 6 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate('111'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    await testBot.handleUpdate(callbackUpdate('mode:resell'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onPost('/follows').reply(201, {
      data: { id: 4, source_shop_id: 111, target_shop_id: 1, mode: 'resell', markup_percentage: 500 }
    });

    await testBot.handleUpdate(textUpdate('500'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('✅');

    expect(mock.history.post.length).toBe(1);
    const requestData = JSON.parse(mock.history.post[0].data);
    expect(requestData.markupPercentage).toBe(500);
  });

  it('отмена через кнопку Cancel → выход из scene', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));

    const text1 = testBot.getLastReplyText();
    // FIX BUG #4: Updated prompt text
    expect(text1).toContain('ID магазина');

    testBot.captor.reset();

    // Click cancel button
    await testBot.handleUpdate(callbackUpdate('cancel_scene'));
    await new Promise(resolve => setImmediate(resolve));

    const text2 = testBot.getLastReplyText();
    expect(text2).toContain('Отменено');

    // Verify no API calls
    expect(mock.history.get.length).toBe(0);
    expect(mock.history.post.length).toBe(0);
  });

  // Test removed: /cancel command is not implemented and should not exist
  // it('отмена через /cancel команду → выход из scene', async () => {});

  it('создание без токена → ошибка авторизации', async () => {
    const noTokenBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: null,
        shopId: 1,
        shopName: 'MyShop',
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' }
      }
    });

    await noTokenBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    noTokenBot.captor.reset();

    mock.onGet('/shops/999').reply(200, {
      data: { id: 999, name: 'Shop999', sellerId: 7 }
    });

    await noTokenBot.handleUpdate(textUpdate('999'));
    await new Promise(resolve => setImmediate(resolve));

    const text = noTokenBot.getLastReplyText();
    expect(text).toContain('Ошибка авторизации');

    expect(mock.history.post.length).toBe(0);

    noTokenBot.reset();
  });

  it('создание без shopId в session → ошибка', async () => {
    const noShopBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        shopId: null, // No shop
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' }
      }
    });

    await noShopBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));

    const text = noShopBot.getLastReplyText();
    expect(text).toContain('Сначала создайте магазин');

    expect(mock.history.get.length).toBe(0);

    noShopBot.reset();
  });

  it('Backend API error (500) → показать ошибку пользователю', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onGet('/shops/777').reply(200, {
      data: { id: 777, name: 'Shop777', sellerId: 8 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate('777'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Backend error on POST
    mock.onPost('/follows').reply(500, {
      error: 'Internal server error'
    });

    await testBot.handleUpdate(callbackUpdate('mode:monitor'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Ошибка');

    // Verify POST was attempted
    expect(mock.history.post.length).toBe(1);
  });

  it('повторное создание той же подписки → НЕ дублирует POST', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onGet('/shops/666').reply(200, {
      data: { id: 666, name: 'Shop666', sellerId: 9 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 1, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate('666'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onPost('/follows').reply(201, {
      data: { id: 5, source_shop_id: 666, target_shop_id: 1, mode: 'monitor', markup_percentage: 0 }
    });

    await testBot.handleUpdate(callbackUpdate('mode:monitor'));
    await new Promise(resolve => setImmediate(resolve));

    expect(mock.history.post.length).toBe(1);

    // Scene завершён, попытка повторного создания НЕ работает
    testBot.captor.reset();

    await testBot.handleUpdate(callbackUpdate('mode:monitor'));
    await new Promise(resolve => setImmediate(resolve));

    // POST не был вызван повторно
    expect(mock.history.post.length).toBe(1);
  });
});
