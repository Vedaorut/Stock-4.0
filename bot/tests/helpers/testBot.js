/**
 * Test Bot Factory для integration-тестов
 * 
 * Создаёт настоящий Telegraf bot instance без launch()
 * С моками Telegram API и перехватом вызовов
 */

import { Telegraf, Scenes, session, Telegram } from 'telegraf';
import { jest } from '@jest/globals';

// Middleware
import authMiddleware from '../../src/middleware/auth.js';
import errorMiddleware from '../../src/middleware/error.js';

// Scenes
import createShopScene from '../../src/scenes/createShop.js';
import addProductScene from '../../src/scenes/addProduct.js';
import searchShopScene from '../../src/scenes/searchShop.js';
import manageWalletsScene from '../../src/scenes/manageWallets.js';

// Handlers
import { handleStart } from '../../src/handlers/start.js';
import { setupSellerHandlers } from '../../src/handlers/seller/index.js';
import { setupBuyerHandlers } from '../../src/handlers/buyer/index.js';
import { setupCommonHandlers } from '../../src/handlers/common.js';

import { createCallsCaptor } from './callsCaptor.js';

/**
 * Создаёт тестовый бот
 * @param {object} options - { mockAuth, mockApi }
 * @returns {object} { bot, captor, handleUpdate, reset }
 */
export function createTestBot(options = {}) {
  const bot = new Telegraf('TEST_BOT_TOKEN', {
    handlerTimeout: 10000
  });

  // Мокаем Telegram API (чтобы не слать реальные запросы)
  // Variant #3.1: jest.spyOn на PROTOTYPE чтобы перехватить ВСЕ экземпляры Telegram
  jest.spyOn(Telegram.prototype, 'callApi').mockImplementation((method, data) => {
    const mockMessage = {
      message_id: Math.floor(Math.random() * 10000),
      chat: { id: data?.chat_id || 123 },
      text: data?.text || '',
      date: Math.floor(Date.now() / 1000)
    };

    if (method === 'sendMessage' || method === 'editMessageText') {
      // ✅ Telegraf автоматически распаковывает {ok, result} в production
      // Поэтому mock должен возвращать УЖЕ распакованный result (БЕЗ обёртки)
      return Promise.resolve(mockMessage);
    }
    
    if (method === 'answerCbQuery') {
      return Promise.resolve(true);  // ✅ answerCbQuery возвращает boolean
    }
    
    // Default для всех остальных методов (getMe, getUpdates, etc.)
    return Promise.resolve(mockMessage);
  });

  // Дополнительно мокируем высокоуровневые методы (для безопасности)
  const fallbackMockMessage = {
    message_id: Math.floor(Math.random() * 10000),
    chat: { id: 123 },
    text: 'Mocked message',
    date: Math.floor(Date.now() / 1000)
  };
  bot.telegram.sendMessage = jest.fn().mockResolvedValue(fallbackMockMessage);
  bot.telegram.editMessageText = jest.fn().mockResolvedValue(fallbackMockMessage);
  bot.telegram.answerCbQuery = jest.fn().mockResolvedValue({ ok: true });
  bot.telegram.deleteMessage = jest.fn().mockResolvedValue(true);

  // Создаём captor для перехвата вызовов
  const captor = createCallsCaptor();

  // Setup session and scenes
  const stage = new Scenes.Stage([
    createShopScene,
    addProductScene,
    searchShopScene,
    manageWalletsScene
  ]);

  bot.use(session());

  // Mock session if provided
  if (options.mockSession) {
    bot.use(async (ctx, next) => {
      ctx.session = ctx.session || {};
      Object.assign(ctx.session, options.mockSession);
      return next();
    });
  }

  // ✅ FIX #3-5: lastContext middleware ДОЛЖЕН быть ПЕРЕД captor!
  // Иначе он добавляется ПОСЛЕ handlers и никогда не выполняется
  let lastContext = null;
  bot.use(async (ctx, next) => {
    lastContext = ctx;
    return next();
  });

  // ✅ CRITICAL: captor ДОЛЖЕН быть ПЕРЕД stage.middleware()!
  // Wizard scenes создают новый context, и если captor после stage,
  // то новый ctx НЕ оборачивается captor middleware
  bot.use(captor.middleware);
  bot.use(stage.middleware());

  // Apply middleware (если не отключены в опциях)
  if (!options.skipAuth) {
    bot.use(authMiddleware);
  }
  if (!options.skipErrorHandling) {
    bot.use(errorMiddleware);
  }

  // Register handlers
  bot.start(handleStart);
  setupSellerHandlers(bot);
  setupBuyerHandlers(bot);
  setupCommonHandlers(bot);

  /**
   * Helper: обработать update и подождать завершения
   */
  const handleUpdate = async (update) => {
    await bot.handleUpdate(update);
    // Даём время на асинхронные операции
    await new Promise(resolve => setImmediate(resolve));
  };

  /**
   * Helper: сбросить состояние между тестами
   */
  const reset = () => {
    captor.reset();
    bot.telegram.callApi.mockClear();
  };

  /**
   * Helper: получить последний текст ответа
   */
  const getLastReplyText = () => {
    const lastReply = captor.getLastReply();
    return lastReply?.text || null;
  };

  /**
   * Helper: получить последнюю клавиатуру
   */
  const getLastMarkup = () => {
    return captor.getLastMarkup();
  };

  /**
   * Helper: проверить что был answerCbQuery
   */
  const wasCallbackAnswered = () => {
    return captor.wasAnswerCbQueryCalled();
  };

  /**
   * Helper: получить все вызовы reply
   */
  const getReplies = () => {
    return captor.getCallsOfType('reply');
  };

  /**
   * Helper: получить текущую сессию (для проверки состояния)
   * ВНИМАНИЕ: lastContext объявлен выше (строка 99) и обновляется middleware
   */
  const getSession = () => {
    return lastContext?.session || null;
  };

  return {
    bot,
    captor,
    handleUpdate,
    reset,
    // Helper methods
    getLastReplyText,
    getLastMarkup,
    wasCallbackAnswered,
    getReplies,
    getSession,
    // Raw access
    telegram: bot.telegram,
    calls: captor.calls
  };
}

/**
 * Создаёт тестовый бот с мокированным Backend API
 * @param {object} mockApi - MockAdapter instance
 * @returns {object} Test bot with mocked API
 */
export function createTestBotWithMockedApi(mockApi) {
  const testBot = createTestBot();
  
  // mockApi будет управлять axios запросами через axios-mock-adapter
  // в тестах: mock.onPost('/api/shops').reply(201, {...})
  
  return testBot;
}
