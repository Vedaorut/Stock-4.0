/**
 * Error Handler Utilities
 *
 * User-friendly error messages for bot
 */

/**
 * Format API error for user display
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
export function formatError(error) {
  const message = error.message || 'Произошла ошибка';

  // Add emoji based on error type
  if (message.includes('авторизации') || message.includes('Доступ запрещен')) {
    return `🔐 ${message}`;
  }
  if (message.includes('не найден')) {
    return `🔍 ${message}`;
  }
  if (message.includes('сети') || message.includes('сервера')) {
    return `⚠️ ${message}`;
  }
  if (message.includes('Слишком много')) {
    return `⏱️ ${message}`;
  }

  return `❌ ${message}`;
}

/**
 * Handle API call with error catching
 * @param {object} ctx - Telegraf context
 * @param {function} apiCall - API call function
 * @param {string} errorPrefix - Custom error message prefix
 * @returns {Promise<object|null>} API response or null on error
 */
export async function handleApiCall(ctx, apiCall, errorPrefix = 'Ошибка') {
  try {
    return await apiCall();
  } catch (error) {
    console.error(`${errorPrefix}:`, error);
    await ctx.reply(formatError(error));
    return null;
  }
}

/**
 * Safe reply (doesn't throw if fails)
 * @param {object} ctx - Telegraf context
 * @param {string} message - Message to send
 * @param {object} extra - Extra options
 */
export async function safeReply(ctx, message, extra = {}) {
  try {
    return await ctx.reply(message, extra);
  } catch (error) {
    console.error('Failed to send message:', error);
  }
}

/**
 * Safe edit message
 * @param {object} ctx - Telegraf context
 * @param {string} message - New message text
 * @param {object} extra - Extra options
 */
export async function safeEdit(ctx, message, extra = {}) {
  try {
    return await ctx.editMessageText(message, extra);
  } catch (error) {
    console.error('Failed to edit message:', error);
    // Fallback to sending new message
    return await safeReply(ctx, message, extra);
  }
}

/**
 * Answer callback query safely
 * @param {object} ctx - Telegraf context
 * @param {string} text - Alert text
 * @param {boolean} showAlert - Show as alert or toast
 */
export async function safeAnswerCbQuery(ctx, text = null, showAlert = false) {
  try {
    return await ctx.answerCbQuery(text, showAlert);
  } catch (error) {
    console.error('Failed to answer callback query:', error);
  }
}

/**
 * Retry async operation
 * @param {function} operation - Async operation to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} delay - Delay between retries (ms)
 * @returns {Promise} Operation result
 */
export async function retryOperation(operation, maxRetries = 3, delay = 1000) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }

  throw lastError;
}
