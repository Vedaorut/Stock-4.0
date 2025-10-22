/**
 * AI Product Management Integration Tests
 * 
 * Тестирует все 9 операций DeepSeek AI с моками:
 * 1. addProduct - добавить товар
 * 2. deleteProduct - удалить товар
 * 3. listProducts - показать все товары
 * 4. searchProduct - найти товар
 * 5. updateProduct - изменить цену/название/остаток
 * 6. bulkDeleteAll - удалить все товары
 * 7. bulkDeleteByNames - удалить несколько по названиям
 * 8. recordSale - записать продажу (decrease stock)
 * 9. getProductInfo - запросить информацию о товаре
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { textUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';
import OpenAI from 'openai';

// Mock OpenAI
jest.mock('openai');

describe('AI Product Management - DeepSeek Integration', () => {
  let testBot;
  let mock;
  let mockDeepSeek;

  const mockProducts = [
    { id: 1, name: 'iPhone 15 Pro', price: 999, currency: 'USD', stock_quantity: 10 },
    { id: 2, name: 'MacBook Pro', price: 2499, currency: 'USD', stock_quantity: 5 },
    { id: 3, name: 'AirPods Pro', price: 249, currency: 'USD', stock_quantity: 20 }
  ];

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' },
        shopId: 1,
        shopName: 'Test Shop',
        aiProductCommandCount: 0,
        lastAiProductCommand: 0
      }
    });
    mock = new MockAdapter(api);

    // Mock DeepSeek OpenAI client
    mockDeepSeek = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };
    OpenAI.mockImplementation(() => mockDeepSeek);

    // Default: mock GET /products
    mock.onGet('/products', { params: { shopId: 1 } }).reply(200, { data: mockProducts });
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
    jest.clearAllMocks();
  });

  // ==========================================
  // 1. ADD PRODUCT
  // ==========================================
  describe('addProduct - добавить товар', () => {
    it('русский: "добавь iPhone 15 за 999"', async () => {
      // Mock DeepSeek response
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'addProduct',
                arguments: JSON.stringify({
                  name: 'iPhone 15',
                  price: 999,
                  currency: 'USD'
                })
              }
            }]
          }
        }]
      });

      // Mock API createProduct
      mock.onPost('/products').reply(201, {
        data: { id: 4, name: 'iPhone 15', price: 999, currency: 'USD', stock_quantity: 0 }
      });

      await testBot.handleUpdate(textUpdate('добавь iPhone 15 за 999'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('iPhone 15');
      expect(text).toContain('999');
    });

    it('английский: "add MacBook for $1200"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_124',
              type: 'function',
              function: {
                name: 'addProduct',
                arguments: JSON.stringify({
                  name: 'MacBook',
                  price: 1200,
                  currency: 'USD'
                })
              }
            }]
          }
        }]
      });

      mock.onPost('/products').reply(201, {
        data: { id: 5, name: 'MacBook', price: 1200, currency: 'USD', stock_quantity: 0 }
      });

      await testBot.handleUpdate(textUpdate('add MacBook for $1200'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('MacBook');
    });
  });

  // ==========================================
  // 2. DELETE PRODUCT
  // ==========================================
  describe('deleteProduct - удалить товар', () => {
    it('точное совпадение: "удали iPhone 15 Pro"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_125',
              type: 'function',
              function: {
                name: 'deleteProduct',
                arguments: JSON.stringify({ productName: 'iPhone 15 Pro' })
              }
            }]
          }
        }]
      });

      mock.onDelete('/products/1').reply(200, { data: { success: true } });

      await testBot.handleUpdate(textUpdate('удали iPhone 15 Pro'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('iPhone 15 Pro');
    });

    it('fuzzy match с опечаткой: "удали айфон про" → "iPhone 15 Pro"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_126',
              type: 'function',
              function: {
                name: 'deleteProduct',
                arguments: JSON.stringify({ productName: 'айфон про' })
              }
            }]
          }
        }]
      });

      mock.onDelete('/products/1').reply(200, { data: { success: true } });

      await testBot.handleUpdate(textUpdate('удали айфон про'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('iPhone 15 Pro');
    });

    it('товар не найден: "удали несуществующий товар"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_127',
              type: 'function',
              function: {
                name: 'deleteProduct',
                arguments: JSON.stringify({ productName: 'несуществующий товар' })
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('удали несуществующий товар'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('❌');
      expect(text).toContain('не найден');
    });
  });

  // ==========================================
  // 3. LIST PRODUCTS
  // ==========================================
  describe('listProducts - показать все товары', () => {
    it('русский: "покажи товары"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_128',
              type: 'function',
              function: {
                name: 'listProducts',
                arguments: '{}'
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('покажи товары'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('3 товара');
      expect(text).toContain('iPhone 15 Pro');
      expect(text).toContain('MacBook Pro');
      expect(text).toContain('AirPods Pro');
    });

    it('английский: "list products"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_129',
              type: 'function',
              function: {
                name: 'listProducts',
                arguments: '{}'
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('list products'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('3 товара');
    });

    it('пустой каталог', async () => {
      mock.onGet('/products', { params: { shopId: 1 } }).reply(200, { data: [] });

      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_130',
              type: 'function',
              function: {
                name: 'listProducts',
                arguments: '{}'
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('покажи товары'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('пусто');
    });
  });

  // ==========================================
  // 4. SEARCH PRODUCT
  // ==========================================
  describe('searchProduct - найти товар', () => {
    it('поиск: "найди макбук"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_131',
              type: 'function',
              function: {
                name: 'searchProduct',
                arguments: JSON.stringify({ query: 'макбук' })
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('найди макбук'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('MacBook Pro');
      expect(text).toContain('2499');
    });

    it('нет совпадений: "найди samsung"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_132',
              type: 'function',
              function: {
                name: 'searchProduct',
                arguments: JSON.stringify({ query: 'samsung' })
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('найди samsung'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('❌');
      expect(text).toContain('не найдено');
    });
  });

  // ==========================================
  // 5. UPDATE PRODUCT
  // ==========================================
  describe('updateProduct - изменить товар', () => {
    it('изменить цену: "смени цену iPhone на 899"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_133',
              type: 'function',
              function: {
                name: 'updateProduct',
                arguments: JSON.stringify({
                  productName: 'iPhone',
                  updates: { price: 899 }
                })
              }
            }]
          }
        }]
      });

      mock.onPut('/products/1').reply(200, {
        data: { id: 1, name: 'iPhone 15 Pro', price: 899, currency: 'USD', stock_quantity: 10 }
      });

      await testBot.handleUpdate(textUpdate('смени цену iPhone на 899'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('iPhone 15 Pro');
      expect(text).toContain('899');
    });

    it('изменить название: "переименуй AirPods в AirPods Max"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_134',
              type: 'function',
              function: {
                name: 'updateProduct',
                arguments: JSON.stringify({
                  productName: 'AirPods',
                  updates: { name: 'AirPods Max' }
                })
              }
            }]
          }
        }]
      });

      mock.onPut('/products/3').reply(200, {
        data: { id: 3, name: 'AirPods Max', price: 249, currency: 'USD', stock_quantity: 20 }
      });

      await testBot.handleUpdate(textUpdate('переименуй AirPods в AirPods Max'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('AirPods Max');
    });

    it('изменить остаток: "установи остаток MacBook в 15"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_135',
              type: 'function',
              function: {
                name: 'updateProduct',
                arguments: JSON.stringify({
                  productName: 'MacBook',
                  updates: { stock_quantity: 15 }
                })
              }
            }]
          }
        }]
      });

      mock.onPut('/products/2').reply(200, {
        data: { id: 2, name: 'MacBook Pro', price: 2499, currency: 'USD', stock_quantity: 15 }
      });

      await testBot.handleUpdate(textUpdate('установи остаток MacBook в 15'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('15');
    });
  });

  // ==========================================
  // 6. BULK DELETE ALL
  // ==========================================
  describe('bulkDeleteAll - удалить все товары', () => {
    it('удалить все: "удали все товары"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_136',
              type: 'function',
              function: {
                name: 'bulkDeleteAll',
                arguments: '{}'
              }
            }]
          }
        }]
      });

      mock.onPost('/products/bulk-delete-all').reply(200, {
        data: { deletedCount: 3 }
      });

      await testBot.handleUpdate(textUpdate('удали все товары'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('3');
    });

    it('пустой каталог: "удали все товары" (0 удалено)', async () => {
      mock.onGet('/products', { params: { shopId: 1 } }).reply(200, { data: [] });

      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_137',
              type: 'function',
              function: {
                name: 'bulkDeleteAll',
                arguments: '{}'
              }
            }]
          }
        }]
      });

      mock.onPost('/products/bulk-delete-all').reply(200, {
        data: { deletedCount: 0 }
      });

      await testBot.handleUpdate(textUpdate('удали все товары'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('пусто');
    });
  });

  // ==========================================
  // 7. BULK DELETE BY NAMES
  // ==========================================
  describe('bulkDeleteByNames - удалить несколько по названиям', () => {
    it('удалить 2 товара: "удали iPhone и AirPods"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_138',
              type: 'function',
              function: {
                name: 'bulkDeleteByNames',
                arguments: JSON.stringify({
                  productNames: ['iPhone', 'AirPods']
                })
              }
            }]
          }
        }]
      });

      mock.onPost('/products/bulk-delete').reply(200, {
        data: { deletedCount: 2 }
      });

      await testBot.handleUpdate(textUpdate('удали iPhone и AirPods'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('2');
    });

    it('частичное удаление: 1 найден, 1 не найден', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_139',
              type: 'function',
              function: {
                name: 'bulkDeleteByNames',
                arguments: JSON.stringify({
                  productNames: ['iPhone', 'Samsung']
                })
              }
            }]
          }
        }]
      });

      mock.onPost('/products/bulk-delete').reply(200, {
        data: { deletedCount: 1 }
      });

      await testBot.handleUpdate(textUpdate('удали iPhone и Samsung'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('1');
      expect(text).toContain('Samsung'); // не найден
    });
  });

  // ==========================================
  // 8. RECORD SALE
  // ==========================================
  describe('recordSale - записать продажу', () => {
    it('продажа 1 товара: "купили iPhone"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_140',
              type: 'function',
              function: {
                name: 'recordSale',
                arguments: JSON.stringify({
                  productName: 'iPhone',
                  quantity: 1
                })
              }
            }]
          }
        }]
      });

      mock.onPut('/products/1').reply(200, {
        data: { id: 1, name: 'iPhone 15 Pro', price: 999, currency: 'USD', stock_quantity: 9 }
      });

      await testBot.handleUpdate(textUpdate('купили iPhone'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('iPhone 15 Pro');
      expect(text).toContain('9'); // stock: 10 → 9
    });

    it('продажа нескольких: "купили 3 AirPods"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_141',
              type: 'function',
              function: {
                name: 'recordSale',
                arguments: JSON.stringify({
                  productName: 'AirPods',
                  quantity: 3
                })
              }
            }]
          }
        }]
      });

      mock.onPut('/products/3').reply(200, {
        data: { id: 3, name: 'AirPods Pro', price: 249, currency: 'USD', stock_quantity: 17 }
      });

      await testBot.handleUpdate(textUpdate('купили 3 AirPods'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('✅');
      expect(text).toContain('AirPods Pro');
      expect(text).toContain('17'); // stock: 20 → 17
    });

    it('недостаточно остатка: "купили 100 MacBook" (stock = 5)', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_142',
              type: 'function',
              function: {
                name: 'recordSale',
                arguments: JSON.stringify({
                  productName: 'MacBook',
                  quantity: 100
                })
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('купили 100 MacBook'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('❌');
      expect(text).toContain('недостаточно');
    });
  });

  // ==========================================
  // 9. GET PRODUCT INFO
  // ==========================================
  describe('getProductInfo - запросить информацию', () => {
    it('запрос цены: "какая цена у iPhone?"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_143',
              type: 'function',
              function: {
                name: 'getProductInfo',
                arguments: JSON.stringify({ productName: 'iPhone' })
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('какая цена у iPhone?'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('iPhone 15 Pro');
      expect(text).toContain('999');
      expect(text).toContain('10'); // stock
    });

    it('запрос остатка: "сколько MacBook осталось?"', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_144',
              type: 'function',
              function: {
                name: 'getProductInfo',
                arguments: JSON.stringify({ productName: 'MacBook' })
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('сколько MacBook осталось?'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('MacBook Pro');
      expect(text).toContain('5'); // stock
    });
  });

  // ==========================================
  // EDGE CASES
  // ==========================================
  describe('Edge Cases - обработка ошибок', () => {
    it('noise filtering: "привет" → не вызывать DeepSeek', async () => {
      await testBot.handleUpdate(textUpdate('привет'));
      await new Promise(resolve => setImmediate(resolve));

      expect(mockDeepSeek.chat.completions.create).not.toHaveBeenCalled();
    });

    it('noise filtering: "спасибо" → не вызывать DeepSeek', async () => {
      await testBot.handleUpdate(textUpdate('спасибо'));
      await new Promise(resolve => setImmediate(resolve));

      expect(mockDeepSeek.chat.completions.create).not.toHaveBeenCalled();
    });

    it('rate limiting: 11 команд за минуту → показать ошибку', async () => {
      // Выполнить 10 команд
      for (let i = 0; i < 10; i++) {
        mockDeepSeek.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              tool_calls: [{
                id: `call_${i}`,
                type: 'function',
                function: {
                  name: 'listProducts',
                  arguments: '{}'
                }
              }]
            }
          }]
        });

        await testBot.handleUpdate(textUpdate('покажи товары'));
        await new Promise(resolve => setImmediate(resolve));
        testBot.captor.reset();
      }

      // 11-я команда должна вернуть ошибку rate limit
      await testBot.handleUpdate(textUpdate('покажи товары'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('медленнее');
    });

    it('DeepSeek API error → показать ошибку', async () => {
      mockDeepSeek.chat.completions.create.mockRejectedValue(new Error('API Error'));

      await testBot.handleUpdate(textUpdate('добавь товар'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('❌');
    });

    it('Backend API error при создании товара', async () => {
      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_err',
              type: 'function',
              function: {
                name: 'addProduct',
                arguments: JSON.stringify({
                  name: 'Test Product',
                  price: 100,
                  currency: 'USD'
                })
              }
            }]
          }
        }]
      });

      mock.onPost('/products').reply(500, { error: 'Internal Server Error' });

      await testBot.handleUpdate(textUpdate('добавь Test Product за 100'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('❌');
    });
  });

  // ==========================================
  // MULTIPLE MATCHES - CLARIFICATION FLOW
  // ==========================================
  describe('Multiple Matches - уточнение при нескольких совпадениях', () => {
    it('несколько совпадений при удалении → показать inline keyboard', async () => {
      // Добавим второй iPhone в mock products
      const productsWithDuplicates = [
        ...mockProducts,
        { id: 4, name: 'iPhone 14', price: 799, currency: 'USD', stock_quantity: 8 }
      ];
      mock.onGet('/products', { params: { shopId: 1 } }).reply(200, { data: productsWithDuplicates });

      mockDeepSeek.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_multi',
              type: 'function',
              function: {
                name: 'deleteProduct',
                arguments: JSON.stringify({ productName: 'iPhone' })
              }
            }]
          }
        }]
      });

      await testBot.handleUpdate(textUpdate('удали iPhone'));
      await new Promise(resolve => setImmediate(resolve));

      const text = testBot.getLastReplyText();
      expect(text).toContain('Найдено несколько');
      expect(text).toContain('iPhone 15 Pro');
      expect(text).toContain('iPhone 14');

      // Проверяем что показали inline keyboard
      const lastReply = testBot.captor.getLastReply();
      expect(lastReply.reply_markup).toBeDefined();
      expect(lastReply.reply_markup.inline_keyboard).toBeDefined();
      expect(lastReply.reply_markup.inline_keyboard.length).toBeGreaterThan(0);
    });
  });
});
