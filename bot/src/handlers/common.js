import { mainMenu } from '../keyboards/main.js';
import { sellerMenu } from '../keyboards/seller.js';
import { buyerMenu } from '../keyboards/buyer.js';
import logger from '../utils/logger.js';

/**
 * Setup common handlers (main menu, cancel, etc.)
 */
export const setupCommonHandlers = (bot) => {
  // Main menu action
  bot.action('main_menu', handleMainMenu);

  // Cancel scene action
  bot.action('cancel_scene', handleCancelScene);

  // Generic back action
  bot.action('back', handleBack);
};

/**
 * Handle main menu action
 */
const handleMainMenu = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Reset role
    ctx.session.role = null;

    await ctx.editMessageText(
      'Telegram Shop\n\nВыберите роль:',
      mainMenu
    );
  } catch (error) {
    logger.error('Error in main menu handler:', error);
    throw error;
  }
};

/**
 * Handle cancel scene action
 */
const handleCancelScene = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Leave current scene
    await ctx.scene.leave();

    // Return to main menu
    await ctx.editMessageText(
      'Telegram Shop\n\nВыберите роль:',
      mainMenu
    );
  } catch (error) {
    logger.error('Error canceling scene:', error);
    throw error;
  }
};

/**
 * Handle generic back action
 */
const handleBack = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Route based on current role
    if (ctx.session.role === 'seller') {
      await ctx.editMessageText(
        'Мой магазин\n\n',
        sellerMenu()
      );
    } else if (ctx.session.role === 'buyer') {
      await ctx.editMessageText(
        'Мои покупки\n\n',
        buyerMenu
      );
    } else {
      await ctx.editMessageText(
        'Telegram Shop\n\nВыберите роль:',
        mainMenu
      );
    }
  } catch (error) {
    logger.error('Error in back handler:', error);
    throw error;
  }
};
