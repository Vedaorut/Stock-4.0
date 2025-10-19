import { mainMenu } from '../keyboards/main.js';
import logger from '../utils/logger.js';

/**
 * /start command handler
 */
export const handleStart = async (ctx) => {
  try {
    logger.info(`/start command from user ${ctx.from.id}`);

    // Reset session role
    ctx.session.role = null;

    // Send welcome message
    await ctx.reply(
      'Telegram Shop\n\nВыберите роль:',
      mainMenu
    );
  } catch (error) {
    logger.error('Error in /start handler:', error);
    throw error;
  }
};
