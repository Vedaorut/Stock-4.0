/**
 * Follow Shop Flow Integration Test
 *
 * Тестирует создание, просмотр, удаление подписок на магазины
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate, textUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

describe('Follow Shop - Create/View/Delete Flow (P0)', () => {
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

  it('создать подписку Monitor → просмотр списка → удалить', async () => {
    // Step 1: View empty follows list
    mock.onGet('/follows/my').reply(200, { data: [] });

    await testBot.handleUpdate(callbackUpdate('follows:list'));
    await new Promise(resolve => setImmediate(resolve));

    expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);

    const text1 = testBot.getLastReplyText();
    expect(text1).toContain('📡 Подписки (0)');
    expect(text1).toContain('Подписок пока нет');

    testBot.captor.reset();

    // Step 2: Create follow - enter scene
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));

    const text2 = testBot.getLastReplyText();
    // FIX BUG #4: Updated prompt text
    expect(text2).toContain('ID магазина для подписки');

    testBot.captor.reset();

    // Step 3: Enter shop ID
    const sourceShopId = 999;
    mock.onGet('/shops/999').reply(200, {
      data: { id: 999, name: 'SourceShop', sellerId: 2 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate(String(sourceShopId)));
    await new Promise(resolve => setImmediate(resolve));

    const text3 = testBot.getLastReplyText();
    expect(text3).toContain('Режим:');

    testBot.captor.reset();

    // Step 4: Select Monitor mode
    mock.onPost('/follows').reply(201, {
      data: { id: 1, source_shop_id: 999, target_shop_id: 1, mode: 'monitor', markup_percentage: 0 }
    });

    await testBot.handleUpdate(callbackUpdate('mode:monitor'));
    await new Promise(resolve => setImmediate(resolve));

    const text4 = testBot.getLastReplyText();
    expect(text4).toContain('✅');
    expect(text4).toContain('Monitor');

    // Verify POST was called
    expect(mock.history.post.length).toBe(1);
    expect(mock.history.post[0].url).toBe('/follows');
    const requestData = JSON.parse(mock.history.post[0].data);
    expect(requestData.sourceShopId).toBe(999);
    expect(requestData.mode).toBe('monitor');

    testBot.captor.reset();

    // Step 5: View follows list again (should show 1 follow)
    mock.onGet('/follows/my').reply(200, {
      data: [{
        id: 1,
        source_shop_id: 999,
        source_shop_name: 'SourceShop',
        target_shop_id: 1,
        mode: 'monitor',
        markup_percentage: 0
      }]
    });

    await testBot.handleUpdate(callbackUpdate('follows:list'));
    await new Promise(resolve => setImmediate(resolve));

    const text5 = testBot.getLastReplyText();
    expect(text5).toContain('📡 Подписки (1)');
    expect(text5).toContain('👀 SourceShop');

    testBot.captor.reset();

    // Step 6: View follow detail
    await testBot.handleUpdate(callbackUpdate('follow_detail:1'));
    await new Promise(resolve => setImmediate(resolve));

    const text6 = testBot.getLastReplyText();
    expect(text6).toContain('👀 Monitor');
    expect(text6).toContain('SourceShop');

    testBot.captor.reset();

    // Step 7: Delete follow
    mock.onDelete('/follows/1').reply(200, { success: true });
    mock.onGet('/follows/my').reply(200, { data: [] }); // Empty list after delete

    await testBot.handleUpdate(callbackUpdate('follow_delete:1'));
    await new Promise(resolve => setImmediate(resolve));

    const text7 = testBot.getLastReplyText();
    expect(text7).toContain('✅ Подписка удалена');

    // Verify DELETE was called
    expect(mock.history.delete.length).toBe(1);
    expect(mock.history.delete[0].url).toBe('/follows/1');
  });

  it('создать подписку Resell с markup 20% → проверить данные', async () => {
    // Enter createFollow scene
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Enter shop ID
    mock.onGet('/shops/888').reply(200, {
      data: { id: 888, name: 'ResellSource', sellerId: 3 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate('888'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Select Resell mode
    await testBot.handleUpdate(callbackUpdate('mode:resell'));
    await new Promise(resolve => setImmediate(resolve));

    const text1 = testBot.getLastReplyText();
    expect(text1).toContain('Новая наценка (%)');
    expect(text1).toContain('1-500');

    testBot.captor.reset();

    // Enter markup percentage
    mock.onPost('/follows').reply(201, {
      data: { id: 2, source_shop_id: 888, target_shop_id: 1, mode: 'resell', markup_percentage: 20 }
    });

    await testBot.handleUpdate(textUpdate('20'));
    await new Promise(resolve => setImmediate(resolve));

    const text2 = testBot.getLastReplyText();
    expect(text2).toContain('✅');
    expect(text2).toContain('Resell');
    expect(text2).toContain('20%');

    // Verify POST with correct markup
    expect(mock.history.post.length).toBe(1);
    const requestData = JSON.parse(mock.history.post[0].data);
    expect(requestData.sourceShopId).toBe(888);
    expect(requestData.mode).toBe('resell');
    expect(requestData.markupPercentage).toBe(20);
  });

  it('FREE limit: создать 2 подписки → 3-я блокируется (402)', async () => {
    // Try to create 3rd follow when limit is reached
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Enter shop ID, but limit check returns reached: true
    mock.onGet('/shops/777').reply(200, {
      data: { id: 777, name: 'ThirdShop', sellerId: 4 }
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: true, count: 2, limit: 2 }
    });

    await testBot.handleUpdate(textUpdate('777'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Лимит достигнут');
    expect(text).toContain('2/2');
    expect(text).toContain('PRO');
    expect(text).toContain('$35/мес');

    // Verify POST was NOT called (limit blocked creation)
    expect(mock.history.post.length).toBe(0);
  });

  it('self-follow: попытка подписаться на свой магазин → ошибка', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Try to follow own shop (shopId: 1 in session)
    mock.onGet('/shops/1').reply(200, {
      data: { id: 1, name: 'MyShop', sellerId: 1 }
    });

    await testBot.handleUpdate(textUpdate('1'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Нельзя подписаться на свой магазин');

    // Verify limit check was NOT called
    expect(mock.history.get.filter(r => r.url === '/follows/check-limit').length).toBe(0);
  });

  it('circular follow: A→B создана, попытка B→A → ошибка 400', async () => {
    // Assume shop 1 already follows shop 666
    // Now shop 666's owner tries to follow shop 1 → circular error

    // Setup: testBot represents shop 666's owner
    const circularTestBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token-2',
        shopId: 666,
        shopName: 'ShopB',
        user: { id: 2, telegramId: '654321', selectedRole: 'seller' }
      }
    });
    const circularMock = new MockAdapter(api);

    await circularTestBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    circularTestBot.captor.reset();

    // Try to follow shop 1 (which already follows shop 666)
    circularMock.onGet('/shops/1').reply(200, {
      data: { id: 1, name: 'ShopA', sellerId: 1 }
    });
    circularMock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 }
    });

    await circularTestBot.handleUpdate(textUpdate('1'));
    await new Promise(resolve => setImmediate(resolve));
    circularTestBot.captor.reset();

    // Select mode
    circularMock.onPost('/follows').reply(400, {
      error: 'Circular follow detected: Shop 1 already follows shop 666'
    });

    await circularTestBot.handleUpdate(callbackUpdate('mode:monitor'));
    await new Promise(resolve => setImmediate(resolve));

    const text = circularTestBot.getLastReplyText();
    expect(text).toContain('Ошибка');
    const lowerText = text.toLowerCase();
    expect(lowerText.includes('circular') || lowerText.includes('цикл')).toBe(true);

    circularTestBot.reset();
    circularMock.reset();
  });

  it('несуществующий магазин → ошибка 404', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    // Try to follow non-existent shop
    mock.onGet('/shops/99999').reply(404, {
      error: 'Shop not found'
    });

    await testBot.handleUpdate(textUpdate('99999'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Магазин не найден');
  });

  // Test removed: /cancel command is not implemented and should not exist
  // it('отмена создания подписки через /cancel → выход из scene', async () => {});
});
