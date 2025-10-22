/**
 * Main Menu Snapshot Test
 *
 * Проверяет что WebApp кнопка:
 * 1. Существует ровно одна
 * 2. Находится в первой строке
 * 3. Нет других URL-кнопок
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate, commandUpdate } from '../helpers/updateFactories.js';
import { extractButtons } from '../helpers/callsCaptor.js';
import { api } from '../../src/utils/api.js';

describe('Main Menu - WebApp Button Position (P0)', () => {
  let testBot;
  let mock;

  beforeEach(() => {
    testBot = createTestBot({ skipAuth: false });
    mock = new MockAdapter(api);

    // Mock auth API
    mock.onPost('/auth/register').reply(200, {
      data: {
        token: 'test-jwt-token',
        user: {
          id: 1,
          telegramId: '123456',
          username: 'testuser',
          selectedRole: null
        }
      }
    });
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('buyer menu: exactly 1 WebApp button at top, 0 other URL buttons', async () => {
    // Mock buyer has no shop
    mock.onGet('/shops/my').reply(200, { data: [] });

    // Select buyer role
    await testBot.handleUpdate(callbackUpdate('role:buyer'));

    const markup = testBot.getLastMarkup();
    expect(markup).toBeTruthy();

    const buttons = extractButtons(markup);

    // Проверяем количество WebApp кнопок
    const webAppButtons = buttons.filter(b => b.web_app !== undefined);
    expect(webAppButtons.length).toBe(1);

    // Проверяем что WebApp кнопка на первой позиции (minimalist: "Открыть")
    const firstRow = markup.inline_keyboard[0];
    expect(firstRow.length).toBeGreaterThan(0);
    const firstButton = firstRow[0];
    expect(firstButton.web_app).toBeDefined();
    expect(firstButton.text).toContain('Открыть');

    // Проверяем что нет других URL-кнопок (url, login_url)
    const urlButtons = buttons.filter(b => b.url !== undefined || b.login_url !== undefined);
    expect(urlButtons.length).toBe(0);

    // Snapshot markup
    expect(markup).toMatchSnapshot('buyer-menu-no-shop');
  });

  it('seller menu: exactly 1 WebApp button at top, 0 other URL buttons', async () => {
    // Mock seller has shop
    mock.onGet('/shops/my').reply(200, {
      data: [{ id: 1, name: 'Test Shop', sellerId: 1 }]
    });

    // Select seller role
    await testBot.handleUpdate(callbackUpdate('role:seller'));

    const markup = testBot.getLastMarkup();
    expect(markup).toBeTruthy();

    const buttons = extractButtons(markup);

    // Проверяем количество WebApp кнопок
    const webAppButtons = buttons.filter(b => b.web_app !== undefined);
    expect(webAppButtons.length).toBe(1);

    // Проверяем что WebApp кнопка на первой позиции (minimalist)
    const firstRow = markup.inline_keyboard[0];
    expect(firstRow.length).toBeGreaterThan(0);
    const firstButton = firstRow[0];
    expect(firstButton.web_app).toBeDefined();
    expect(firstButton.text).toContain('Открыть');

    // Проверяем что нет других URL-кнопок
    const urlButtons = buttons.filter(b => b.url !== undefined || b.login_url !== undefined);
    expect(urlButtons.length).toBe(0);

    // Snapshot markup
    expect(markup).toMatchSnapshot('seller-menu-with-shop');
  });

  it('seller menu without shop: exactly 1 WebApp button if buyer role opened', async () => {
    // This tests buyerMenuNoShop which also has WebApp button
    
    // Mock seller has no shop
    mock.onGet('/shops/my').reply(200, { data: [] });

    // First select seller to create session
    await testBot.handleUpdate(callbackUpdate('role:seller'));
    testBot.captor.reset();

    // Now toggle to buyer
    await testBot.handleUpdate(callbackUpdate('role:toggle'));

    const markup = testBot.getLastMarkup();
    expect(markup).toBeTruthy();

    const buttons = extractButtons(markup);

    // Проверяем количество WebApp кнопок
    const webAppButtons = buttons.filter(b => b.web_app !== undefined);
    expect(webAppButtons.length).toBe(1);

    // Проверяем что WebApp кнопка на первой позиции
    const firstRow = markup.inline_keyboard[0];
    expect(firstRow.length).toBeGreaterThan(0);
    const firstButton = firstRow[0];
    expect(firstButton.web_app).toBeDefined();

    // Snapshot
    expect(markup).toMatchSnapshot('buyer-menu-after-toggle');
  });

  it('main menu (role selection) has NO WebApp buttons', async () => {
    // User with no saved role sees role selection
    mock.onPost('/auth/register').reply(200, {
      data: {
        token: 'test-jwt-token',
        user: { id: 1, telegramId: '123456', selectedRole: null }
      }
    });

    await testBot.handleUpdate(commandUpdate('start'));

    const markup = testBot.getLastMarkup();
    expect(markup).toBeTruthy();

    const buttons = extractButtons(markup);

    // Проверяем что НЕТ WebApp кнопок (только role:buyer, role:seller)
    const webAppButtons = buttons.filter(b => b.web_app !== undefined);
    expect(webAppButtons.length).toBe(0);

    // Проверяем что есть кнопки выбора роли
    const roleButtons = buttons.filter(
      b => b.callback_data === 'role:buyer' || b.callback_data === 'role:seller'
    );
    expect(roleButtons.length).toBe(2);

    // Snapshot
    expect(markup).toMatchSnapshot('main-menu-role-selection');
  });
});
