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

    // Проверяем что показали ВСЕ 3 магазина
    const replies = testBot.captor.getReplies();
    const allText = replies.map(r => r.text).join(' ');

    // BUG: Сейчас показывается только 'Shop One'
    // После fix должны показаться все 3
    expect(allText).toContain('Shop One');
    expect(allText).toContain('Shop Two');   // ❌ FAILS
    expect(allText).toContain('Shop Three'); // ❌ FAILS

    // Alternative: Check reply count (should be 3 shops + 1 "Поиск..." message)
    const shopReplies = replies.filter(r => 
      r.text && (r.text.includes('Shop One') || r.text.includes('Shop Two') || r.text.includes('Shop Three'))
    );

    // BUG: Сейчас shopReplies.length === 1 (только первый магазин)
    expect(shopReplies.length).toBe(3); // ❌ FAILS (actual: 1)
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
 * Fix for searchShop.js:
 *
 * CURRENT CODE (src/scenes/searchShop.js:65-74):
 * ```javascript
 * // Show first result
 * const shop = shops[0];  // ← BUG: shows only first
 * const sellerUsername = shop.seller_username
 *   ? `@${shop.seller_username}`
 *   : (shop.seller_first_name || 'Продавец');
 *
 * await ctx.reply(
 *   `${shop.name}\nПродавец: ${sellerUsername}\n\n`,
 *   shopActionsKeyboard(shop.id, Boolean(shop.is_subscribed))
 * );
 * ```
 *
 * FIXED CODE (should loop through all shops):
 * ```javascript
 * // Show all results
 * for (const shop of shops) {
 *   const sellerUsername = shop.seller_username
 *     ? `@${shop.seller_username}`
 *     : (shop.seller_first_name || 'Продавец');
 *
 *   await ctx.reply(
 *     `${shop.name}\nПродавец: ${sellerUsername}\n\n`,
 *     shopActionsKeyboard(shop.id, Boolean(shop.is_subscribed))
 *   );
 * }
 * ```
 */
