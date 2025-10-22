/**
 * Update Factories для integration-тестов
 * 
 * Создают Telegram Update objects для bot.handleUpdate()
 * Без реального Telegram API
 */

let updateCounter = 1000;
let messageCounter = 2000;

/**
 * Создаёт update с текстовым сообщением
 * @param {string} text - Текст сообщения
 * @param {object} options - { from, chat, messageId }
 * @returns {object} Telegram Update
 */
export function textUpdate(text, options = {}) {
  const from = options.from || { id: 123456, username: 'testuser', first_name: 'Test' };
  const chat = options.chat || { id: 123456, type: 'private' };
  const messageId = options.messageId || messageCounter++;

  return {
    update_id: updateCounter++,
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      text,
      from,
      chat
    }
  };
}

/**
 * Создаёт update с callback query (нажатие на inline кнопку)
 * @param {string} data - callback_data кнопки
 * @param {object} options - { from, chat, messageId }
 * @returns {object} Telegram Update
 */
export function callbackUpdate(data, options = {}) {
  const from = options.from || { id: 123456, username: 'testuser', first_name: 'Test' };
  const chat = options.chat || { id: 123456, type: 'private' };
  const messageId = options.messageId || messageCounter++;

  return {
    update_id: updateCounter++,
    callback_query: {
      id: `cbq_${Date.now()}`,
      from,
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat,
        text: 'Previous message' // Для editMessageText
      },
      data
    }
  };
}

/**
 * Создаёт update с командой (например /start)
 * @param {string} command - Команда без /
 * @param {object} options - { from, chat }
 * @returns {object} Telegram Update
 */
export function commandUpdate(command, options = {}) {
  const text = `/${command}`;
  const update = textUpdate(text, options);
  
  // Добавляем entities для команды
  update.message.entities = [{
    type: 'bot_command',
    offset: 0,
    length: text.length
  }];

  return update;
}

/**
 * Создаёт пользователя с кастомными данными
 * @param {number} id - Telegram ID
 * @param {object} data - { username, first_name, last_name, language_code }
 * @returns {object} Telegram User
 */
export function createUser(id, data = {}) {
  return {
    id,
    is_bot: false,
    username: data.username || `user${id}`,
    first_name: data.first_name || 'Test',
    last_name: data.last_name || 'User',
    language_code: data.language_code || 'en'
  };
}

/**
 * Создаёт чат
 * @param {number} id - Chat ID
 * @param {string} type - 'private' | 'group' | 'supergroup'
 * @returns {object} Telegram Chat
 */
export function createChat(id, type = 'private') {
  return {
    id,
    type
  };
}

/**
 * Сбрасывает счётчики (для изоляции тестов)
 */
export function resetCounters() {
  updateCounter = 1000;
  messageCounter = 2000;
}
