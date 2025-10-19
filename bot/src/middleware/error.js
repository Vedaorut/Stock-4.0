import logger from '../utils/logger.js';
import { mainMenuButton } from '../keyboards/common.js';

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
      update: ctx.update
    });

    // User-friendly error message
    const errorMessage = 'Произошла ошибка\n\nПопробуйте позже';

    try {
      if (ctx.callbackQuery) {
        await ctx.editMessageText(errorMessage, mainMenuButton);
      } else {
        await ctx.reply(errorMessage, mainMenuButton);
      }
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

export default errorMiddleware;
