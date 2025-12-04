import logger from './logger.js';
import { t, getLang } from '../i18n/index.js';

/**
 * P1-BOT-010: Timeout for Long Operations
 *
 * Wraps async operations with timeout and "Please wait..." message
 *
 * Usage:
 *   await withTimeout(ctx, async () => {
 *     // long operation
 *   }, { timeout: 30000, messageKey: 'general.processing' })
 */

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Execute operation with timeout and loading message
 */
export const withTimeout = async (ctx, operation, options = {}) => {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const lang = getLang(ctx);
  const loadingMessage = options.message || t('general.pleaseWait', {}, lang);

  // Send loading message
  let loadingMsg;
  try {
    if (ctx.callbackQuery) {
      // If callback query, edit existing message
      loadingMsg = await ctx.editMessageText(loadingMessage);
    } else {
      // Otherwise send new message
      loadingMsg = await ctx.reply(loadingMessage);
    }
  } catch (error) {
    logger.debug('Could not send loading message:', error.message);
  }

  try {
    // Race between operation and timeout
    const result = await Promise.race([
      operation(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), timeout)),
    ]);

    return result;
  } catch (error) {
    if (error.message === 'Operation timeout') {
      logger.error('Operation timed out', {
        userId: ctx.from?.id,
        timeout,
        operation: operation.name || 'anonymous',
      });

      // Update loading message with timeout error
      if (loadingMsg) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            undefined,
            t('friendlyErrors.operationTimeout', {}, lang)
          );
        } catch (editError) {
          logger.debug('Could not edit timeout message:', editError.message);
        }
      }

      throw new Error('TIMEOUT');
    }

    throw error; // Re-throw other errors
  }
};

export default withTimeout;
