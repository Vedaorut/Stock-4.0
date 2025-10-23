/**
 * Follow Management Integration Test
 *
 * Тестирует управление существующими подписками:
 * - Обновление markup
 * - Переключение режима Monitor ↔ Resell
 * - Просмотр деталей подписки
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate, textUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

describe('Follow Management - Update/Switch/Delete (P0)', () => {
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

  it('просмотр деталей follow → показать mode и markup', async () => {
    mock.onGet('/follows/my').reply(200, {
      data: [{
        id: 10,
        source_shop_id: 888,
        source_shop_name: 'SourceShop',
        target_shop_id: 1,
        mode: 'resell',
        markup_percentage: 25
      }]
    });

    await testBot.handleUpdate(callbackUpdate('follow_detail:10'));
    await new Promise(resolve => setImmediate(resolve));

    expect(testBot.captor.wasAnswerCbQueryCalled()).toBe(true);

    const text = testBot.getLastReplyText();
    expect(text).toContain('💰 Resell');
    expect(text).toContain('SourceShop');
    expect(text).toContain('25%');

    // Verify keyboard has management buttons
    const keyboard = testBot.getLastReplyKeyboard();
    expect(keyboard).toBeTruthy();
  });

  it('переключение Monitor → Resell → запросить markup', async () => {
    // Current follow in monitor mode
    mock.onGet('/follows/my').reply(200, {
      data: [{
        id: 20,
        source_shop_id: 777,
        source_shop_name: 'MonitorShop',
        target_shop_id: 1,
        mode: 'monitor',
        markup_percentage: 0
      }]
    });

    await testBot.handleUpdate(callbackUpdate('follow_mode:20'));
    await new Promise(resolve => setImmediate(resolve));

    const text1 = testBot.getLastReplyText();
    expect(text1).toContain('Новая наценка (%)');
    expect(text1).toContain('1-500');

    // Verify editingFollowId stored in session
    const session1 = testBot.getSession();
    expect(session1.editingFollowId).toBe(20);

    testBot.captor.reset();

    // Enter markup
    mock.onPut('/follows/20/mode').reply(200, {
      data: { id: 20, mode: 'resell', markup_percentage: 30 }
    });

    await testBot.handleUpdate(textUpdate('30'));
    await new Promise(resolve => setImmediate(resolve));

    const text2 = testBot.getLastReplyText();
    expect(text2).toContain('✅ Режим изменён');

    // Verify PUT was called
    expect(mock.history.put.length).toBe(1);
    expect(mock.history.put[0].url).toBe('/follows/20/mode');
    const requestData = JSON.parse(mock.history.put[0].data);
    expect(requestData.mode).toBe('resell');
    expect(requestData.markupPercentage).toBe(30);
  });

  it('переключение Resell → Monitor → мгновенное изменение без markup', async () => {
    // Current follow in resell mode
    mock.onGet('/follows/my').reply(200, {
      data: [{
        id: 30,
        source_shop_id: 666,
        source_shop_name: 'ResellShop',
        target_shop_id: 1,
        mode: 'resell',
        markup_percentage: 50
      }]
    });

    mock.onPut('/follows/30/mode').reply(200, {
      data: { id: 30, mode: 'monitor', markup_percentage: 0 }
    });

    await testBot.handleUpdate(callbackUpdate('follow_mode:30'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('✅ Режим изменён');

    // Verify PUT was called with monitor mode
    expect(mock.history.put.length).toBe(1);
    expect(mock.history.put[0].url).toBe('/follows/30/mode');
    const requestData = JSON.parse(mock.history.put[0].data);
    expect(requestData.mode).toBe('monitor');
  });

  it('обновление markup через editingFollowId → пересчёт цен', async () => {
    // Simulate markup update initiated from follow detail
    testBot.setSessionState({ editingFollowId: 40 });

    mock.onPut('/follows/40/markup').reply(200, {
      data: { id: 40, markup_percentage: 15 }
    });

    await testBot.handleUpdate(textUpdate('15'));
    await new Promise(resolve => setImmediate(resolve));

    // Should show success message
    const text = testBot.getLastReplyText();
    expect(text).toContain('✅');

    // Verify PUT was called
    expect(mock.history.put.length).toBe(1);
    expect(mock.history.put[0].url).toBe('/follows/40/markup');
    const requestData = JSON.parse(mock.history.put[0].data);
    expect(requestData.markupPercentage).toBe(15);
  });

  it('невалидный markup при обновлении (0%) → ошибка', async () => {
    testBot.setSessionState({ editingFollowId: 50 });

    await testBot.handleUpdate(textUpdate('0'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Наценка должна быть 1-500%');

    // Verify PUT was NOT called
    expect(mock.history.put.length).toBe(0);
  });

  it('невалидный markup при обновлении (501%) → ошибка', async () => {
    testBot.setSessionState({ editingFollowId: 60 });

    await testBot.handleUpdate(textUpdate('501'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Наценка должна быть 1-500%');

    expect(mock.history.put.length).toBe(0);
  });

  it('удаление подписки → показать подтверждение → вернуться к списку', async () => {
    mock.onDelete('/follows/70').reply(200, { success: true });
    mock.onGet('/follows/my').reply(200, { data: [] }); // Empty after delete

    await testBot.handleUpdate(callbackUpdate('follow_delete:70'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('✅ Подписка удалена');

    // Verify DELETE was called
    expect(mock.history.delete.length).toBe(1);
    expect(mock.history.delete[0].url).toBe('/follows/70');
  });

  it('просмотр детали несуществующей подписки → ошибка', async () => {
    mock.onGet('/follows/my').reply(200, {
      data: [] // Empty list
    });

    await testBot.handleUpdate(callbackUpdate('follow_detail:999'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Подписка не найдена');
  });

  it('API error при переключении режима (500) → показать ошибку', async () => {
    mock.onGet('/follows/my').reply(200, {
      data: [{
        id: 80,
        source_shop_id: 555,
        source_shop_name: 'TestShop',
        target_shop_id: 1,
        mode: 'monitor',
        markup_percentage: 0
      }]
    });

    await testBot.handleUpdate(callbackUpdate('follow_mode:80'));
    await new Promise(resolve => setImmediate(resolve));
    testBot.captor.reset();

    mock.onPut('/follows/80/mode').reply(500, {
      error: 'Internal server error'
    });

    await testBot.handleUpdate(textUpdate('20'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Ошибка');

    expect(mock.history.put.length).toBe(1);
  });

  it('API error при удалении (500) → показать ошибку', async () => {
    mock.onDelete('/follows/90').reply(500, {
      error: 'Cannot delete follow'
    });

    await testBot.handleUpdate(callbackUpdate('follow_delete:90'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Ошибка удаления');

    expect(mock.history.delete.length).toBe(1);
  });

  it('просмотр списка → клик на follow → детали → назад → список снова', async () => {
    const mockFollows = [{
      id: 100,
      source_shop_id: 444,
      source_shop_name: 'Shop444',
      target_shop_id: 1,
      mode: 'resell',
      markup_percentage: 10
    }];

    // Step 1: View list
    mock.onGet('/follows/my').reply(200, { data: mockFollows });

    await testBot.handleUpdate(callbackUpdate('follows:list'));
    await new Promise(resolve => setImmediate(resolve));

    const text1 = testBot.getLastReplyText();
    expect(text1).toContain('📡 Подписки (1)');
    expect(text1).toContain('💰 Shop444 +10%');

    testBot.captor.reset();

    // Step 2: View detail
    await testBot.handleUpdate(callbackUpdate('follow_detail:100'));
    await new Promise(resolve => setImmediate(resolve));

    const text2 = testBot.getLastReplyText();
    expect(text2).toContain('💰 Resell');
    expect(text2).toContain('Shop444');
    expect(text2).toContain('10%');

    testBot.captor.reset();

    // Step 3: Go back to list
    await testBot.handleUpdate(callbackUpdate('follows:list'));
    await new Promise(resolve => setImmediate(resolve));

    const text3 = testBot.getLastReplyText();
    expect(text3).toContain('📡 Подписки (1)');
  });

  it('без токена → ошибка авторизации при просмотре деталей', async () => {
    const noTokenBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: null,
        shopId: 1,
        shopName: 'MyShop',
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' }
      }
    });

    await noTokenBot.handleUpdate(callbackUpdate('follow_detail:110'));
    await new Promise(resolve => setImmediate(resolve));

    const text = noTokenBot.getLastReplyText();
    expect(text).toContain('Необходима авторизация');

    expect(mock.history.get.length).toBe(0);

    noTokenBot.reset();
  });

  it('markup range: 1% → успех', async () => {
    testBot.setSessionState({ editingFollowId: 120 });

    mock.onPut('/follows/120/markup').reply(200, {
      data: { id: 120, markup_percentage: 1 }
    });

    await testBot.handleUpdate(textUpdate('1'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('✅');

    const requestData = JSON.parse(mock.history.put[0].data);
    expect(requestData.markupPercentage).toBe(1);
  });

  it('markup range: 500% → успех', async () => {
    testBot.setSessionState({ editingFollowId: 130 });

    mock.onPut('/follows/130/markup').reply(200, {
      data: { id: 130, markup_percentage: 500 }
    });

    await testBot.handleUpdate(textUpdate('500'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('✅');

    const requestData = JSON.parse(mock.history.put[0].data);
    expect(requestData.markupPercentage).toBe(500);
  });
});
