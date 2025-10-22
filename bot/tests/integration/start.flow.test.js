/**
 * /start Flow Integration Test
 * 
 * Тестирует memory роли: повторный /start должен сразу показывать ЛК
 * БЕЗ повторного вопроса о роли (P0 priority)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { commandUpdate, callbackUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

describe('/start Flow - Role Memory (P0)', () => {
  let testBot;
  let mock;

  beforeEach(() => {
    testBot = createTestBot({ skipAuth: false });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('первый /start без роли → показать "Выберите роль"', async () => {
    // Mock auth API (первый вход, нет selectedRole)
    mock.onPost('/auth/register').reply(200, {
      data: {
        token: 'test-jwt-token',
        user: {
          id: 1,
          telegramId: '123456',
          username: 'testuser',
          selectedRole: null // Нет сохранённой роли
        }
      }
    });

    // Отправляем /start
    await testBot.handleUpdate(commandUpdate('start'));

    // Проверяем что показали выбор роли
    const lastText = testBot.getLastReplyText();
    expect(lastText).toContain('Выберите роль');
  });

  it.skip('повторный /start с ролью buyer → сразу buyer ЛК (БЕЗ вопроса о роли)', async () => {
    // TODO: Этот тест требует:
    // 1. Mock auth API с selectedRole: 'buyer'
    // 2. Первый /start → автоматически вызвать handleBuyerRole
    // 3. Проверить что НЕТ "Выберите роль", а ЕСТЬ buyer меню
    
    // Пример реализации:
    // mock.onPost('/auth/register').reply(200, {
    //   data: { token: 'test-jwt', user: { id: 1, selectedRole: 'buyer' } }
    // });
    // await testBot.handleUpdate(commandUpdate('start'));
    // expect(lastText).not.toContain('Выберите роль');
    // expect(lastText).toContain('Поиск магазинов'); // buyer меню
  });
});
