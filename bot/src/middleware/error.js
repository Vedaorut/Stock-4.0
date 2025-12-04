import logger from '../utils/logger.js';
import { mainMenuButton } from '../keyboards/common.js';
import { reply as cleanReply } from '../utils/cleanReply.js';
import { t } from '../i18n/index.js';

/**
 * Global error handling middleware
 */
const errorMiddleware = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    logger.error('Error in handler:', {
      error: error.message,
      stack: error.stack,
      update: ctx.update,
    });

    // User-friendly error message (use i18n directly since ctx.t may not be available)
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const errorMessage = t('general.actionFailed', {}, lang);

    try {
      if (ctx.callbackQuery) {
        await ctx.editMessageText(errorMessage, mainMenuButton);
      } else {
        await cleanReply(ctx, errorMessage, mainMenuButton);
      }
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

export default errorMiddleware;
