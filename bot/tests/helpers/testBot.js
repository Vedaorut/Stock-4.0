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
import createFollowScene from '../../src/scenes/createFollow.js';

// Handlers
import { handleStart } from '../../src/handlers/start.js';
import { setupSellerHandlers } from '../../src/handlers/seller/index.js';
import { setupFollowHandlers } from '../../src/handlers/seller/follows.js';
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
    manageWalletsScene,
    createFollowScene
  ]);

  // ✅ FIX: Controlled session storage (same as session() middleware but with direct access)
  // This allows tests to set session state via setSessionState() method
  const sessionStorage = new Map();
  const DEFAULT_CHAT_ID = 123456; // Default test chat ID (matches updateFactories.js)

  // Initialize default session ONCE (persists between handleUpdate calls)
  if (!sessionStorage.has(DEFAULT_CHAT_ID)) {
    sessionStorage.set(DEFAULT_CHAT_ID, options.mockSession ? { ...options.mockSession } : {});
  }

  // Custom session middleware with controlled storage
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id || ctx.from?.id || DEFAULT_CHAT_ID;

    // Get or create session for this chat (REUSES same object across calls)
    if (!sessionStorage.has(chatId)) {
      sessionStorage.set(chatId, options.mockSession ? { ...options.mockSession } : {});
    }

    // Attach session to context (reference to same object!)
    ctx.session = sessionStorage.get(chatId);

    return next();
  });

  // ✅ FIX #3-5: lastContext middleware ДОЛЖЕН быть ПЕРЕД captor!
  // Иначе он добавляется ПОСЛЕ handlers и никогда не выполняется
  // Initialize lastContext with mockSession if provided (for getSession() to work before handleUpdate())
  let lastContext = options.mockSession ? { session: { ...options.mockSession } } : null;

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
  setupFollowHandlers(bot);
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
   * Helper: получить последнюю клавиатуру (inline keyboard)
   */
  const getLastReplyKeyboard = () => {
    const lastReply = captor.getLastReply();
    if (!lastReply?.markup) return null;
    
    // Extract inline_keyboard from markup
    return lastReply.markup.inline_keyboard || lastReply.markup;
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

  /**
   * Helper: установить session state напрямую в sessionStorage
   * Используется для setup session state БЕЗ handleUpdate()
   *
   * @param {object} state - Session state для merge (например, { editingFollowId: 40 })
   * @param {number} chatId - Chat ID (опционально, по умолчанию DEFAULT_CHAT_ID)
   *
   * @example
   * testBot.setSessionState({ editingFollowId: 40 });
   * await testBot.handleUpdate(textUpdate('15')); // session.editingFollowId доступен!
   */
  const setSessionState = (state, chatId = DEFAULT_CHAT_ID) => {
    // Get existing session or create new one
    const existingSession = sessionStorage.get(chatId) || (options.mockSession ? { ...options.mockSession } : {});

    // Merge new state into existing session
    const mergedSession = { ...existingSession, ...state };

    // Update session in storage
    sessionStorage.set(chatId, mergedSession);

    // Also update lastContext if it exists (for getSession() to work immediately)
    if (lastContext) {
      lastContext.session = mergedSession;
    }
  };

  return {
    bot,
    captor,
    handleUpdate,
    reset,
    // Helper methods
    getLastReplyText,
    getLastReplyKeyboard,
    getLastMarkup,
    wasCallbackAnswered,
    getReplies,
    getSession,
    setSessionState,  // ← NEW METHOD
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
