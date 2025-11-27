/**
 * Mark Orders Shipped Scene Integration Test
 *
 * Тестирует bulk management для отметки заказов как отправленных
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate, textUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';
import { mockShopValidation } from '../helpers/commonMocks.js';

describe('Mark Orders Shipped Scene (P0)', () => {
  let testBot;
  let mock;

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        shopId: 1,
        shopName: 'TestShop',
        userId: 1,
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' },
      },
    });
    mock = new MockAdapter(api);

    // Mock shop validation (required by validateShopBeforeScene middleware)
    mockShopValidation(mock, 1);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  describe('Order ID Parsing', () => {
    it('single IDs: "1 3 5" → [1, 3, 5]', async () => {
      // Mock активные заказы
      const mockOrders = [
        {
          id: 101,
          product_name: 'Item 1',
          status: 'confirmed',
          buyer_username: 'buyer1',
          quantity: 1,
          total_price: '10.00',
        },
        {
          id: 102,
          product_name: 'Item 2',
          status: 'processing',
          buyer_username: 'buyer2',
          quantity: 2,
          total_price: '20.00',
        },
        {
          id: 103,
          product_name: 'Item 3',
          status: 'confirmed',
          buyer_username: 'buyer3',
          quantity: 1,
          total_price: '15.00',
        },
        {
          id: 104,
          product_name: 'Item 4',
          status: 'processing',
          buyer_username: 'buyer4',
          quantity: 3,
          total_price: '30.00',
        },
        {
          id: 105,
          product_name: 'Item 5',
          status: 'confirmed',
          buyer_username: 'buyer5',
          quantity: 1,
          total_price: '25.00',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      // Step 1: Enter scene
      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));

      // Проверяем что показали prompt
      const text1 = testBot.getLastReplyText();
      expect(text1).toContain('Введите номера заказов');
      expect(text1).toContain('Активных заказов: 5');
      expect(text1).toContain('Пример: 1 3 5 или 1-5');

      testBot.captor.reset();

      // Step 2: Вводим "1 3 5" → должно выбрать 1, 3, 5 заказы из списка (индексы 0, 2, 4)
      await testBot.handleUpdate(textUpdate('1 3 5'));

      const text2 = testBot.getLastReplyText();
      expect(text2).toContain('Отметить');
      expect(text2).toContain('3'); // count
      expect(text2).toContain('Item 1');
      expect(text2).toContain('Item 3');
      expect(text2).toContain('Item 5');
    });

    it('range: "1-5" → [1, 2, 3, 4, 5]', async () => {
      const mockOrders = [
        {
          id: 201,
          product_name: 'Product 1',
          status: 'confirmed',
          buyer_username: 'user1',
          quantity: 1,
          total_price: '10.00',
        },
        {
          id: 202,
          product_name: 'Product 2',
          status: 'confirmed',
          buyer_username: 'user2',
          quantity: 1,
          total_price: '10.00',
        },
        {
          id: 203,
          product_name: 'Product 3',
          status: 'confirmed',
          buyer_username: 'user3',
          quantity: 1,
          total_price: '10.00',
        },
        {
          id: 204,
          product_name: 'Product 4',
          status: 'confirmed',
          buyer_username: 'user4',
          quantity: 1,
          total_price: '10.00',
        },
        {
          id: 205,
          product_name: 'Product 5',
          status: 'confirmed',
          buyer_username: 'user5',
          quantity: 1,
          total_price: '10.00',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('1-5'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('5'); // count в заголовке
      expect(text).toContain('Product 1');
      expect(text).toContain('Product 5');
    });

    it('combined: "1 3-5 7" → [1, 3, 4, 5, 7]', async () => {
      const mockOrders = Array.from({ length: 7 }, (_, i) => ({
        id: 300 + i + 1,
        product_name: `Product ${i + 1}`,
        status: 'confirmed',
        buyer_username: `user${i + 1}`,
        quantity: 1,
        total_price: '10.00',
      }));

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('1 3-5 7'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('5'); // count
      expect(text).toContain('Product 1');
      expect(text).toContain('Product 3');
      expect(text).toContain('Product 4');
      expect(text).toContain('Product 5');
      expect(text).toContain('Product 7');
    });

    it('duplicates removal: "1 1 2" → [1, 2]', async () => {
      const mockOrders = [
        {
          id: 401,
          product_name: 'Item A',
          status: 'confirmed',
          buyer_username: 'buyer1',
          quantity: 1,
          total_price: '10.00',
        },
        {
          id: 402,
          product_name: 'Item B',
          status: 'confirmed',
          buyer_username: 'buyer2',
          quantity: 1,
          total_price: '20.00',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('1 1 2'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('2'); // count (duplicates removed)
      expect(text).toContain('Item A');
      expect(text).toContain('Item B');
    });
  });

  describe('Confirmation Flow', () => {
    it('должен показать confirmation с деталями заказов', async () => {
      const mockOrders = [
        {
          id: 501,
          product_name: 'Laptop',
          buyer_username: 'techbuy',
          buyer_telegram_id: 999,
          status: 'confirmed',
          quantity: 1,
          total_price: '1200.00',
          shop_name: 'TestShop',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('1'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Отметить');
      expect(text).toContain('1'); // count
      expect(text).toContain('Laptop');
      expect(text).toContain('@techbuy');
      expect(text).toContain('1 шт');
      expect(text).toContain('1200'); // price without currency symbol
      expect(text).toContain('отправленные'); // confirmation text

      // Проверяем что есть кнопки подтверждения
      const keyboard = testBot.getLastReplyKeyboard();
      expect(keyboard).toBeTruthy();
      const buttons = keyboard.flat();
      expect(buttons.some((b) => b.callback_data === 'confirm_ship')).toBe(true);
      expect(buttons.some((b) => b.callback_data === 'cancel_ship')).toBe(true);
    });
  });

  describe('Bulk Update', () => {
    it('должен выполнить bulk update и отправить notifications', async () => {
      const mockOrders = [
        {
          id: 601,
          product_name: 'Phone',
          status: 'confirmed',
          buyer_username: 'buyer1',
          buyer_telegram_id: 111,
          quantity: 1,
          total_price: '500.00',
          shop_name: 'TestShop',
        },
        {
          id: 602,
          product_name: 'Tablet',
          status: 'confirmed',
          buyer_username: 'buyer2',
          buyer_telegram_id: 222,
          quantity: 1,
          total_price: '300.00',
          shop_name: 'TestShop',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      // Mock bulk update
      mock.onPost('/orders/bulk-status').reply(200, {
        data: { updated: 2, notified: 2 },
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('1 2'));
      testBot.captor.reset();

      // Confirm bulk ship
      await testBot.handleUpdate(callbackUpdate('confirm_ship'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('отмечены как отправленные');
      expect(text).toContain('2');

      // Проверяем что API был вызван
      expect(mock.history.post.length).toBe(1);
      expect(mock.history.post[0].url).toBe('/orders/bulk-status');
      const requestBody = JSON.parse(mock.history.post[0].data);
      expect(requestBody.order_ids).toEqual([601, 602]);
      expect(requestBody.status).toBe('shipped');
    });

    it('должен обработать частичный успех (не все заказы обновились)', async () => {
      const mockOrders = [
        {
          id: 701,
          product_name: 'Item 1',
          status: 'confirmed',
          buyer_username: 'buyer1',
          buyer_telegram_id: 111,
          quantity: 1,
          total_price: '10.00',
          shop_name: 'TestShop',
        },
        {
          id: 702,
          product_name: 'Item 2',
          status: 'confirmed',
          buyer_username: 'buyer2',
          buyer_telegram_id: 222,
          quantity: 1,
          total_price: '20.00',
          shop_name: 'TestShop',
        },
        {
          id: 703,
          product_name: 'Item 3',
          status: 'confirmed',
          buyer_username: 'buyer3',
          buyer_telegram_id: 333,
          quantity: 1,
          total_price: '15.00',
          shop_name: 'TestShop',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      // Mock partial success (только 2 из 3 обновились)
      mock.onPost('/orders/bulk-status').reply(200, {
        data: { updated: 2, notified: 2 },
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('1 2 3'));
      testBot.captor.reset();

      await testBot.handleUpdate(callbackUpdate('confirm_ship'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('отмечены как отправленные');
      // Scene показывает количество выбранных заказов (3), не количество обновлённых
      expect(text).toContain('3');
    });
  });

  describe('Edge Cases', () => {
    it('invalid IDs: "abc" → error', async () => {
      const mockOrders = [
        {
          id: 801,
          product_name: 'Product',
          status: 'confirmed',
          buyer_username: 'buyer1',
          quantity: 1,
          total_price: '10.00',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('abc'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Не удалось распознать');
      expect(text).toContain('Неверное число'); // error from parser
    });

    it('out of range IDs: "999" → error', async () => {
      const mockOrders = [
        {
          id: 901,
          product_name: 'Product',
          status: 'confirmed',
          buyer_username: 'buyer1',
          quantity: 1,
          total_price: '10.00',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('999'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Не удалось распознать');
      expect(text).toContain('вне диапазона'); // error from parser
    });

    it('empty input → error', async () => {
      const mockOrders = [
        {
          id: 1001,
          product_name: 'Product',
          status: 'confirmed',
          buyer_username: 'buyer1',
          quantity: 1,
          total_price: '10.00',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('   ')); // только пробелы

      const text = testBot.getLastReplyText();
      expect(text).toContain('Не удалось распознать');
      expect(text).toContain('Не указан ввод'); // error from parser
    });

    it('no active orders → показать сообщение и выйти', async () => {
      // Mock empty orders
      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: [],
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Нет активных заказов');
    });

    it('API error при bulk update → показать ошибку', async () => {
      const mockOrders = [
        {
          id: 1101,
          product_name: 'Product',
          status: 'confirmed',
          buyer_username: 'buyer1',
          buyer_telegram_id: 111,
          quantity: 1,
          total_price: '10.00',
          shop_name: 'TestShop',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      // Mock API error
      mock.onPost('/orders/bulk-status').reply(500, {
        error: 'Internal server error',
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('1'));
      testBot.captor.reset();

      await testBot.handleUpdate(callbackUpdate('confirm_ship'));

      const text = testBot.getLastReplyText();
      // Scene показывает backend error напрямую
      expect(text).toContain('Internal server error');
    });
  });

  describe('Cancel Flow', () => {
    it('отмена через кнопку на этапе ввода', async () => {
      const mockOrders = [
        {
          id: 1201,
          product_name: 'Product',
          status: 'confirmed',
          buyer_username: 'buyer1',
          quantity: 1,
          total_price: '10.00',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      // Cancel сразу после входа в scene
      await testBot.handleUpdate(callbackUpdate('cancel_scene'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('отменена'); // cancelled message
    });

    it('отмена на этапе confirmation', async () => {
      const mockOrders = [
        {
          id: 1301,
          product_name: 'Product',
          status: 'confirmed',
          buyer_username: 'buyer1',
          quantity: 1,
          total_price: '10.00',
          shop_name: 'TestShop',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      await testBot.handleUpdate(textUpdate('1'));
      testBot.captor.reset();

      // Cancel on confirmation
      await testBot.handleUpdate(callbackUpdate('cancel_ship'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('отменена'); // cancelled message

      // Проверяем что API НЕ был вызван
      expect(mock.history.post.length).toBe(0);
    });
  });

  describe('Session Validation', () => {
    it('нет shopId в session → показать ошибку', async () => {
      const noShopBot = createTestBot({
        skipAuth: true,
        mockSession: {
          token: 'test-jwt-token',
          shopId: null, // No shopId
          userId: 1,
          user: { id: 1, telegramId: '123456', selectedRole: 'seller' },
        },
      });
      const noShopMock = new MockAdapter(api);

      await noShopBot.handleUpdate(callbackUpdate('seller:mark_shipped'));

      const text = noShopBot.getLastReplyText();
      // validateShopBeforeScene shows "shop required" when shopId is null
      expect(text).toContain('Создайте магазин');

      noShopBot.reset();
      noShopMock.reset();
    });

    it('нет token в session → показать ошибку', async () => {
      const noTokenBot = createTestBot({
        skipAuth: true,
        mockSession: {
          token: null, // No token
          shopId: 1,
          userId: 1,
          user: { id: 1, telegramId: '123456', selectedRole: 'seller' },
        },
      });
      const noTokenMock = new MockAdapter(api);

      await noTokenBot.handleUpdate(callbackUpdate('seller:mark_shipped'));

      const text = noTokenBot.getLastReplyText();
      expect(text).toContain('Требуется авторизация');

      noTokenBot.reset();
      noTokenMock.reset();
    });
  });

  describe('Complex Scenarios', () => {
    it('большой набор заказов: "1-10 15 20-25" → корректная обработка', async () => {
      // Create 30 orders
      const mockOrders = Array.from({ length: 30 }, (_, i) => ({
        id: 1400 + i + 1,
        product_name: `Product ${i + 1}`,
        status: 'confirmed',
        buyer_username: `buyer${i + 1}`,
        buyer_telegram_id: 1000 + i + 1,
        quantity: 1,
        total_price: '10.00',
        shop_name: 'TestShop',
      }));

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      mock.onPost('/orders/bulk-status').reply(200, {
        data: { updated: 16, notified: 16 },
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));
      testBot.captor.reset();

      // Input: "1-10 15 20-25" = [1,2,3,4,5,6,7,8,9,10,15,20,21,22,23,24,25] = 17 orders
      await testBot.handleUpdate(textUpdate('1-10 15 20-25'));

      const confirmText = testBot.getLastReplyText();
      expect(confirmText).toContain('17'); // count (1-10 = 10, 15 = 1, 20-25 = 6, total = 17)

      testBot.captor.reset();

      await testBot.handleUpdate(callbackUpdate('confirm_ship'));

      const successText = testBot.getLastReplyText();
      expect(successText).toContain('17');
      expect(successText).toContain('отмечены как отправленные');

      // Проверяем что API был вызван с 17 order IDs
      const requestBody = JSON.parse(mock.history.post[0].data);
      expect(requestBody.order_ids.length).toBe(17);
      expect(requestBody.order_ids).toContain(1401); // order 1
      expect(requestBody.order_ids).toContain(1410); // order 10
      expect(requestBody.order_ids).toContain(1415); // order 15
      expect(requestBody.order_ids).toContain(1420); // order 20
      expect(requestBody.order_ids).toContain(1425); // order 25
    });

    it('обработка заказов с разными статусами (confirmed + processing)', async () => {
      const mockOrders = [
        {
          id: 1501,
          product_name: 'Item 1',
          status: 'confirmed',
          buyer_username: 'buyer1',
          quantity: 1,
          total_price: '10.00',
        },
        {
          id: 1502,
          product_name: 'Item 2',
          status: 'processing',
          buyer_username: 'buyer2',
          quantity: 1,
          total_price: '20.00',
        },
        {
          id: 1503,
          product_name: 'Item 3',
          status: 'confirmed',
          buyer_username: 'buyer3',
          quantity: 1,
          total_price: '15.00',
        },
      ];

      mock.onGet('/orders', { params: { shop_id: 1, status: 'confirmed' } }).reply(200, {
        data: mockOrders,
      });

      await testBot.handleUpdate(callbackUpdate('seller:mark_shipped'));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Активных заказов: 3'); // all orders shown (confirmed + processing)
    });
  });
});
