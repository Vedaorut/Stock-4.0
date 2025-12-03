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
import {
  mockShopValidation,
  mockFollowLimit,
  mockValidateCircular,
} from '../helpers/commonMocks.js';

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
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' },
      },
    });
    mock = new MockAdapter(api);

    // Mock shop validation (required by validateShopBeforeScene middleware)
    mockShopValidation(mock, 1);

    // Mock follow limit check (called by createFollow scene on entry)
    mockFollowLimit(mock);

    // Mock circular validation (called by createFollow scene before creating follow)
    mockValidateCircular(mock);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('создать подписку Monitor → просмотр списка → удалить', async () => {
    // Step 1: View empty follows list
    mock.onGet(/\/follows\/my/).reply(200, { data: [] });

    await testBot.handleUpdate(callbackUpdate('follows:list'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);

    const text1 = testBot.getLastReplyText();
    // When list is empty, shows explanation and empty message
    expect(text1).toContain('Следить');
    expect(text1).toContain('У вас пока нет активных подписок');

    testBot.captor.reset();

    // Step 2: Create follow - enter scene
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise((resolve) => setImmediate(resolve));

    const text2 = testBot.getLastReplyText();
    // FIX BUG #4: Updated prompt text - now asks for shop NAME
    expect(text2).toContain('название магазина для поиска');

    testBot.captor.reset();

    // Step 3: Enter shop NAME (not ID)
    mock.onGet(/\/shops\/search/).reply(200, {
      data: [{ id: 999, name: 'SourceShop', sellerId: 2 }],
    });

    await testBot.handleUpdate(textUpdate('SourceShop'));
    await new Promise((resolve) => setImmediate(resolve));

    // Verify search results shown
    const searchResultsText = testBot.getLastReplyText();
    expect(searchResultsText).toContain('Найдено магазинов');
    testBot.captor.reset();

    // Step 4: Select shop via callback
    mock.onGet('/shops/999').reply(200, {
      data: { id: 999, name: 'SourceShop', sellerId: 2 },
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 },
    });

    await testBot.handleUpdate(callbackUpdate('select_shop:999'));
    await new Promise((resolve) => setImmediate(resolve));

    const text3 = testBot.getLastReplyText();
    expect(text3).toContain('Выберите режим');

    testBot.captor.reset();

    // Step 5: Select Monitor mode
    mock.onPost('/follows').reply(201, {
      data: {
        id: 1,
        source_shop_id: 999,
        target_shop_id: 1,
        mode: 'monitor',
        markup_percentage: 0,
      },
    });
    mock.onDelete(/\/follows\/\d+/).reply(200, { success: true });

    await testBot.handleUpdate(callbackUpdate('mode:monitor'));
    await new Promise((resolve) => setImmediate(resolve));

    const text4 = testBot.getLastReplyText();
    expect(text4).toContain('Подписка');
    expect(text4).toContain('мониторинг');

    // Verify POST was called (find the /follows POST)
    const followsPost = mock.history.post.find((r) => r.url === '/follows');
    expect(followsPost).toBeDefined();
    const requestData = JSON.parse(followsPost.data);
    expect(requestData.sourceShopId).toBe(999);
    expect(requestData.mode).toBe('monitor');

    testBot.captor.reset();

    // Step 6: View follows list again (should show 1 follow)
    mock.onGet(/\/follows\/my/).reply(200, {
      data: [
        {
          id: 1,
          source_shop_id: 999,
          source_shop_name: 'SourceShop',
          target_shop_id: 1,
          mode: 'monitor',
          markup_percentage: 0,
        },
      ],
    });

    await testBot.handleUpdate(callbackUpdate('follows:list'));
    await new Promise((resolve) => setImmediate(resolve));

    const text5 = testBot.getLastReplyText();
    expect(text5).toContain('Следить');
    expect(text5).toContain('SourceShop');

    testBot.captor.reset();

    // Step 7: View follow detail
    // Mock GET /follows/1 for detail view
    mock.onGet('/follows/1').reply(200, {
      data: {
        id: 1,
        source_shop_id: 999,
        source_shop_name: 'SourceShop',
        target_shop_id: 1,
        mode: 'monitor',
        markup_percentage: 0,
      },
    });

    // Mock GET /follows/1/products for catalog view
    mock.onGet('/follows/1/products').reply(200, {
      data: {
        mode: 'monitor',
        products: [],
      },
    });

    await testBot.handleUpdate(callbackUpdate('follow_detail:1'));
    await new Promise((resolve) => setImmediate(resolve));

    const text6 = testBot.getLastReplyText();
    expect(text6).toContain('SourceShop');

    testBot.captor.reset();

    // Step 8: Delete follow - now with confirmation dialog
    mock.onGet('/follows/1').reply(200, {
      data: {
        id: 1,
        source_shop_id: 777,
        source_shop_name: 'SourceShop',
        target_shop_id: 1,
        mode: 'monitor',
      },
    });
    mock.onDelete('/follows/1').reply(200, { success: true });
    mock.onGet(/\/follows\/my/).reply(200, { data: [] }); // Empty list after delete

    // Click delete → shows confirmation
    await testBot.handleUpdate(callbackUpdate('follow_delete:1'));
    await new Promise((resolve) => setImmediate(resolve));

    const confirmText = testBot.getLastReplyText();
    expect(confirmText).toContain('Удалить подписку');

    testBot.captor.reset();

    // Confirm delete
    await testBot.handleUpdate(callbackUpdate('confirm_delete_follow:1'));
    await new Promise((resolve) => setImmediate(resolve));

    // After delete, returns to empty follow list
    const text7 = testBot.getLastReplyText();
    expect(text7).toContain('Следить');
    expect(text7).toContain('У вас пока нет активных подписок');

    // Verify DELETE was called
    expect(mock.history.delete.length).toBe(1);
    expect(mock.history.delete[0].url).toBe('/follows/1');
  });

  it('создать подписку Resell с markup 20% → проверить данные', async () => {
    // Enter createFollow scene
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise((resolve) => setImmediate(resolve));
    testBot.captor.reset();

    // Enter shop NAME
    mock.onGet(/\/shops\/search/).reply(200, {
      data: [{ id: 888, name: 'ResellSource', sellerId: 3 }],
    });

    await testBot.handleUpdate(textUpdate('ResellSource'));
    await new Promise((resolve) => setImmediate(resolve));
    testBot.captor.reset();

    // Select shop via callback
    mock.onGet('/shops/888').reply(200, {
      data: { id: 888, name: 'ResellSource', sellerId: 3 },
    });
    mock.onGet('/follows/check-limit').reply(200, {
      data: { reached: false, count: 0, limit: 2 },
    });

    await testBot.handleUpdate(callbackUpdate('select_shop:888'));
    await new Promise((resolve) => setImmediate(resolve));
    testBot.captor.reset();

    // Select Resell mode
    await testBot.handleUpdate(callbackUpdate('mode:resell'));
    await new Promise((resolve) => setImmediate(resolve));

    const text1 = testBot.getLastReplyText();
    expect(text1).toContain('наценку');
    expect(text1).toContain('1 до 500%');

    testBot.captor.reset();

    // Enter markup percentage
    mock.onPost('/follows').reply(201, {
      data: {
        id: 2,
        source_shop_id: 888,
        target_shop_id: 1,
        mode: 'resell',
        markup_percentage: 20,
      },
    });

    await testBot.handleUpdate(textUpdate('20'));
    await new Promise((resolve) => setImmediate(resolve));

    const text2 = testBot.getLastReplyText();
    expect(text2).toContain('Подписка');
    expect(text2).toContain('Resell'); // Current implementation uses "Resell"
    expect(text2).toContain('20%');

    // Verify POST with correct markup (filter out validateCircular POST)
    const followPosts = mock.history.post.filter((r) => r.url === '/follows');
    expect(followPosts.length).toBe(1);
    const requestData = JSON.parse(followPosts[0].data);
    expect(requestData.sourceShopId).toBe(888);
    expect(requestData.mode).toBe('resell');
    expect(requestData.markupPercentage).toBe(20);
  });

  it('FREE limit: создать 2 подписки → 3-я блокируется (402)', async () => {
    // Reset mock to override global mockFollowLimit with limit reached
    mock.reset();
    mockShopValidation(mock, 1);
    mockFollowLimit(mock, { reached: true, count: 2, limit: 2 }); // Override with limit reached
    mockValidateCircular(mock);

    // Try to create 3rd follow when limit is reached
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise((resolve) => setImmediate(resolve));

    // Scene should exit immediately showing limit reached message
    const text = testBot.getLastReplyText();
    expect(text).toContain('Достигнут лимит подписок');
    expect(text).toContain('2');
    expect(text).toContain('2');

    // Verify POST to /follows was NOT called (limit blocked creation)
    const followPosts = mock.history.post.filter((r) => r.url === '/follows');
    expect(followPosts.length).toBe(0);
  });

  it('self-follow: попытка подписаться на свой магазин → ошибка', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise((resolve) => setImmediate(resolve));
    testBot.captor.reset();

    // Search for own shop
    mock.onGet(/\/shops\/search/).reply(200, {
      data: [{ id: 1, name: 'MyShop', sellerId: 1 }], // Only own shop
    });

    await testBot.handleUpdate(textUpdate('MyShop'));
    await new Promise((resolve) => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Найден только ваш магазин');

    // Verify limit check was called once (from global mock in beforeEach)
    // Note: global mock is set up in beforeEach, so it will be called
    // Self-follow is detected during search results processing
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
        user: { id: 2, telegramId: '654321', selectedRole: 'seller' },
      },
    });
    const circularMock = new MockAdapter(api);

    // Setup mocks for this bot
    mockShopValidation(circularMock, 666, { name: 'ShopB' });
    mockFollowLimit(circularMock);

    await circularTestBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise((resolve) => setImmediate(resolve));
    circularTestBot.captor.reset();

    // Search for shop 1
    circularMock.onGet(/\/shops\/search/).reply(200, {
      data: [{ id: 1, name: 'ShopA', sellerId: 1 }],
    });

    await circularTestBot.handleUpdate(textUpdate('ShopA'));
    await new Promise((resolve) => setImmediate(resolve));
    circularTestBot.captor.reset();

    // Select shop via callback
    circularMock.onGet('/shops/1').reply(200, {
      data: { id: 1, name: 'ShopA', sellerId: 1 },
    });

    // Mock validateCircular to return invalid (circular detected)
    circularMock.onPost('/follows/validate-circular').reply(200, {
      data: { valid: false },
    });

    await circularTestBot.handleUpdate(callbackUpdate('select_shop:1'));
    await new Promise((resolve) => setImmediate(resolve));

    // Circular is detected BEFORE mode selection, so scene exits immediately
    const text = circularTestBot.getLastReplyText();
    expect(text).toContain('Циклическая подписка');
    expect(text).toContain('Взаимные подписки не разрешены');

    circularTestBot.reset();
    circularMock.reset();
  });

  it('несуществующий магазин → ошибка 404', async () => {
    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise((resolve) => setImmediate(resolve));
    testBot.captor.reset();

    // Search returns empty (no shops found)
    mock.onGet(/\/shops\/search/).reply(200, { data: [] });

    await testBot.handleUpdate(textUpdate('NonExistent'));
    await new Promise((resolve) => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Магазины не найдены');
  });

  // Test removed: /cancel command is not implemented and should not exist
  // it('отмена создания подписки через /cancel → выход из scene', async () => {});
});
