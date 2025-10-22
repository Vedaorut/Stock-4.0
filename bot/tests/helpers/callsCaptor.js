/**
 * Calls Captor для integration-тестов
 * 
 * Перехватывает вызовы ctx.reply, ctx.editMessageText, ctx.answerCbQuery
 * Позволяет проверять что бот ответил пользователю
 */

/**
 * Создаёт middleware для перехвата вызовов
 * @returns {object} { middleware, calls, lastReply, lastMarkup, reset }
 */
export function createCallsCaptor() {
  const calls = [];

  const middleware = async (ctx, next) => {
    // Оригинальные методы
    const originalReply = ctx.reply?.bind(ctx);
    const originalEditText = ctx.editMessageText?.bind(ctx);
    const originalEditMarkup = ctx.editMessageReplyMarkup?.bind(ctx);
    const originalAnswerCb = ctx.answerCbQuery?.bind(ctx);

    // Обёртки с захватом
    ctx.reply = async (...args) => {
      calls.push({
        type: 'reply',
        args,
        text: args[0],
        markup: args[1]?.reply_markup || args[1]
      });
      return originalReply ? originalReply(...args) : { message_id: Date.now() };
    };

    ctx.editMessageText = async (...args) => {
      calls.push({
        type: 'editMessageText',
        args,
        text: args[0],
        markup: args[1]?.reply_markup || args[1]
      });
      return originalEditText ? originalEditText(...args) : true;
    };

    ctx.editMessageReplyMarkup = async (...args) => {
      calls.push({
        type: 'editMessageReplyMarkup',
        args,
        markup: args[0]?.reply_markup || args[0]
      });
      return originalEditMarkup ? originalEditMarkup(...args) : true;
    };

    ctx.answerCbQuery = async (...args) => {
      calls.push({
        type: 'answerCbQuery',
        args,
        text: args[0]
      });
      return originalAnswerCb ? originalAnswerCb(...args) : true;
    };

    return next();
  };

  /**
   * Получить последний ответ (reply или editMessageText)
   */
  const getLastReply = () => {
    const replyCalls = calls.filter(c => c.type === 'reply' || c.type === 'editMessageText');
    if (replyCalls.length === 0) return null;
    return replyCalls[replyCalls.length - 1];
  };

  /**
   * Получить последнюю клавиатуру
   */
  const getLastMarkup = () => {
    const markupCalls = calls.filter(c => c.markup !== undefined);
    if (markupCalls.length === 0) return null;
    return markupCalls[markupCalls.length - 1].markup;
  };

  /**
   * Проверить, был ли вызван answerCbQuery
   */
  const wasAnswerCbQueryCalled = () => {
    return calls.some(c => c.type === 'answerCbQuery');
  };

  /**
   * Получить все вызовы определённого типа
   */
  const getCallsOfType = (type) => {
    return calls.filter(c => c.type === type);
  };

  /**
   * Сбросить все вызовы
   */
  const reset = () => {
    calls.length = 0;
  };

  /**
   * Получить все вызовы (копия массива)
   */
  const getAllCalls = () => {
    return [...calls];
  };

  /**
   * Получить все reply вызовы
   */
  const getReplies = () => {
    return calls.filter(c => c.type === 'reply');
  };

  /**
   * Получить все editMessageText вызовы
   */
  const getEdits = () => {
    return calls.filter(c => c.type === 'editMessageText');
  };

  /**
   * Получить все answerCbQuery вызовы
   */
  const getAnswers = () => {
    return calls.filter(c => c.type === 'answerCbQuery');
  };

  /**
   * Получить текст последнего ответа
   */
  const getLastReplyText = () => {
    const lastReply = getLastReply();
    return lastReply?.text || '';
  };

  return {
    middleware,
    calls,
    getLastReply,
    getLastMarkup,
    wasAnswerCbQueryCalled,
    getCallsOfType,
    reset,
    getAllCalls,
    getReplies,
    getEdits,
    getAnswers,
    getLastReplyText
  };
}

/**
 * Извлечь все кнопки из клавиатуры
 * @param {object} markup - reply_markup или inline_keyboard
 * @returns {Array} Массив кнопок
 */
export function extractButtons(markup) {
  if (!markup) return [];
  
  const keyboard = markup.inline_keyboard || markup.keyboard || [];
  const buttons = [];

  for (const row of keyboard) {
    for (const button of row) {
      buttons.push(button);
    }
  }

  return buttons;
}

/**
 * Проверить, находится ли кнопка в первой строке
 * @param {object} button - Кнопка
 * @param {object} markup - reply_markup
 * @returns {boolean}
 */
export function isTopButton(button, markup) {
  if (!markup) return false;
  
  const keyboard = markup.inline_keyboard || markup.keyboard || [];
  if (keyboard.length === 0) return false;

  const firstRow = keyboard[0];
  return firstRow.some(b => b.text === button.text);
}

/**
 * Найти кнопку по тексту
 * @param {string} text - Текст кнопки
 * @param {object} markup - reply_markup
 * @returns {object|null} Кнопка или null
 */
export function findButton(text, markup) {
  const buttons = extractButtons(markup);
  return buttons.find(b => b.text === text) || null;
}
