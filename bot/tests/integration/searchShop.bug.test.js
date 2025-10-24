/**
 * Search Shop Bug Test (Fail-First)
 *
 * Known bug: searchShop.js:66 shows only shops[0] instead of all results
 *
 * Expected behavior: When API returns 3 shops, show all 3
 * Actual behavior: Only shows first shop
 *
 * This test WILL FAIL until the bug is fixed.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate, textUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

describe('Search Shop - Multiple Results Bug (KNOWN BUG)', () => {
  let testBot;
  let mock;

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        user: { id: 1, telegramId: '123456', selectedRole: 'buyer' }
      }
    });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('поиск возвращает 3 магазина → должны показаться все 3 (✅ FIXED!)', async () => {
    // Mock API with 3 shops
    const mockShops = [
      { id: 1, name: 'Shop One', seller_username: 'seller1', is_subscribed: false },
      { id: 2, name: 'Shop Two', seller_username: 'seller2', is_subscribed: false },
      { id: 3, name: 'Shop Three', seller_username: 'seller3', is_subscribed: false }
    ];

    mock.onGet('/shops/search').reply((config) => {
      // Query param: ?name=test
      return [200, { data: mockShops }];
    });

    // Enter searchShop scene
    await testBot.handleUpdate(callbackUpdate('buyer:search'));
    testBot.captor.reset();

    // Enter search query
    await testBot.handleUpdate(textUpdate('test'));

    // ✅ NEW BEHAVIOR: All shops in ONE consolidated message
    const lastText = testBot.getLastReplyText();

    // Проверяем что показали заголовок с количеством
    expect(lastText).toContain('Найдено (3)');

    // Проверяем что показали ВСЕ 3 магазина в одном сообщении
    expect(lastText).toContain('Shop One');
    expect(lastText).toContain('Shop Two');
    expect(lastText).toContain('Shop Three');

    // Проверяем что показали продавцов
    expect(lastText).toContain('@seller1');
    expect(lastText).toContain('@seller2');
    expect(lastText).toContain('@seller3');
  });

  it('поиск возвращает 0 магазинов → показать "Не найдено"', async () => {
    mock.onGet('/shops/search').reply(200, { data: [] });

    // Enter searchShop scene
    await testBot.handleUpdate(callbackUpdate('buyer:search'));
    testBot.captor.reset();

    // Enter search query
    await testBot.handleUpdate(textUpdate('nonexistent'));

    // Проверяем что показали "Не найдено"
    const text = testBot.getLastReplyText();
    expect(text).toContain('Не найдено');
  });

  it('поиск с коротким запросом (<2 символа) → ошибка валидации', async () => {
    // Enter searchShop scene
    await testBot.handleUpdate(callbackUpdate('buyer:search'));
    testBot.captor.reset();

    // Enter too short query
    await testBot.handleUpdate(textUpdate('a'));

    // Проверяем что показали ошибку
    const text = testBot.getLastReplyText();
    expect(text).toContain('Минимум 2 символа');
  });
});

/**
 * ✅ FIXED! searchShop.js now shows ALL results in ONE consolidated message
 *
 * OLD CODE (had bug - only showed first shop):
 * ```javascript
 * const shop = shops[0];  // ← BUG: shows only first
 * await ctx.reply(...);
 * ```
 *
 * FIXED CODE (shows all shops in one message):
 * ```javascript
 * const shopList = shops.map((shop, index) => {
 *   const sellerUsername = shop.seller_username
 *     ? `@${shop.seller_username}`
 *     : (shop.seller_first_name || 'Продавец');
 *   const subscribed = shop.is_subscribed ? ' ✅' : '';
 *   return `${index + 1}. ${shop.name} • ${sellerUsername}${subscribed}`;
 * }).join('\n');
 *
 * await smartMessage.send(ctx, {
 *   text: `Найдено (${shops.length}):\n\n${shopList}`,
 *   keyboard: shopResultsKeyboard(shops)
 * });
 * ```
 */
