import { mainMenu } from '../keyboards/main.js';
import { sellerMenu } from '../keyboards/seller.js';
import { buyerMenu } from '../keyboards/buyer.js';
import { authApi } from '../utils/api.js';
import { handleSellerRole } from './seller/index.js';
import { handleBuyerRole } from './buyer/index.js';
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

  // Role toggle action
  bot.action('role:toggle', handleRoleToggle);
};

/**
 * Handle main menu action
 */
const handleMainMenu = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user has saved role - redirect to dashboard instead of resetting
    const savedRole = ctx.session.user?.selectedRole;

    if (savedRole === 'seller') {
      logger.info(`User ${ctx.from.id} has saved role: seller, redirecting to seller dashboard`);
      return await handleSellerRole(ctx);
    } else if (savedRole === 'buyer') {
      logger.info(`User ${ctx.from.id} has saved role: buyer, redirecting to buyer dashboard`);
      return await handleBuyerRole(ctx);
    }

    // No saved role - show role selection
    ctx.session.role = null;

    await ctx.editMessageText(
      'Telegram Shop\n\nВыберите роль:',
      mainMenu
    );
  } catch (error) {
    logger.error('Error in main menu handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        mainMenu
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
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
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        mainMenu
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
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
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        mainMenu
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle role toggle action
 */
const handleRoleToggle = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Determine current role
    const currentRole = ctx.session.role || ctx.session.user?.selectedRole;

    if (!currentRole) {
      logger.warn(`User ${ctx.from.id} tried to toggle role without current role`);
      await ctx.editMessageText(
        'Telegram Shop\n\nВыберите роль:',
        mainMenu
      );
      return;
    }

    // Toggle role
    const newRole = currentRole === 'seller' ? 'buyer' : 'seller';
    logger.info(`User ${ctx.from.id} toggling role from ${currentRole} to ${newRole}`);

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole(newRole, ctx.session.token);
        ctx.session.role = newRole;
        if (ctx.session.user) {
          ctx.session.user.selectedRole = newRole;
        }
        logger.info(`Saved ${newRole} role for user ${ctx.from.id}`);
      } else {
        logger.warn(`User ${ctx.from.id} has no token, cannot save role`);
        ctx.session.role = newRole;
      }
    } catch (error) {
      logger.error('Failed to save toggled role:', error);
      // Continue anyway with local role change
      ctx.session.role = newRole;
    }

    // Redirect to appropriate handler
    if (newRole === 'seller') {
      await handleSellerRole(ctx);
    } else {
      await handleBuyerRole(ctx);
    }
  } catch (error) {
    logger.error('Error in role toggle handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        mainMenu
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};
