import { mainMenu } from '../keyboards/main.js';
import { sellerMenu } from '../keyboards/seller.js';
import { buyerMenu } from '../keyboards/buyer.js';
import { authApi } from '../utils/api.js';
import { handleSellerRole } from './seller/index.js';
import { handleBuyerRole } from './buyer/index.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { messages } from '../texts/messages.js';

const {
  start: startMessages,
  general: generalMessages,
  seller: sellerMessages,
  buyer: buyerMessages,
} = messages;

/**
 * Setup common handlers (main menu, cancel, etc.)
 */
export const setupCommonHandlers = (bot) => {
  // Main menu action
  bot.action('main_menu', handleMainMenu);

  // Back to main menu (from subscription notifications)
  bot.action('back_to_main', handleBackToMain);

  // Start create shop (from subscription pending notification)
  bot.action(/^start_create_shop(?::.+)?$/, handleStartCreateShop);

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

    // КРИТИЧНО: Выйти из любой активной сцены перед переходом
    if (ctx.scene && ctx.scene.current) {
      await ctx.scene.leave();
      logger.info(`User ${ctx.from.id} left scene ${ctx.scene.current} via main_menu`);
    }

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

    await smartMessage.send(ctx, {
      text: startMessages.welcome,
      keyboard: mainMenu(),
    });
  } catch (error) {
    logger.error('Error in main menu handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
      });
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

    // Return to main menu (minimalist)
    await smartMessage.send(ctx, {
      text: startMessages.welcome,
      keyboard: mainMenu(),
    });
  } catch (error) {
    logger.error('Error canceling scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
      });
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
      await smartMessage.send(ctx, {
        text: sellerMessages.panel,
        keyboard: sellerMenu(0, { hasFollows: ctx.session?.hasFollows }),
      });
    } else if (ctx.session.role === 'buyer') {
      await smartMessage.send(ctx, {
        text: buyerMessages.panel,
        keyboard: buyerMenu,
      });
    } else {
      await smartMessage.send(ctx, {
        text: startMessages.welcome,
        keyboard: mainMenu(),
      });
    }
  } catch (error) {
    logger.error('Error in back handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
      });
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
      await smartMessage.send(ctx, {
        text: startMessages.welcome,
        keyboard: mainMenu(),
      });
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
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle back to main menu (from subscription notifications)
 */
const handleBackToMain = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // КРИТИЧНО: Выйти из любой активной сцены
    if (ctx.scene && ctx.scene.current) {
      await ctx.scene.leave();
      logger.info(`User ${ctx.from.id} left scene ${ctx.scene.current} via back_to_main`);
    }

    // Set seller role since subscription payment means they're a seller
    ctx.session.role = 'seller';

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('seller', ctx.session.token);
        if (ctx.session.user) {
          ctx.session.user.selectedRole = 'seller';
        }
        logger.info(`Saved seller role for user ${ctx.from.id} (from subscription notification)`);
      }
    } catch (error) {
      logger.error('Failed to save role:', error);
    }

    // Redirect to seller dashboard
    await handleSellerRole(ctx);
  } catch (error) {
    logger.error('Error in back to main handler:', error);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: sellerMenu(0),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle start create shop (from subscription pending notification)
 */
const handleStartCreateShop = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Extract tier from callback data (format: start_create_shop:{tier}) with safe fallback
    const callbackData = ctx.callbackQuery?.data || '';
    const [, tierFromCallback] = callbackData.split(':');
    const tier = tierFromCallback || 'basic';

    // Set seller role
    ctx.session.role = 'seller';

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('seller', ctx.session.token);
        if (ctx.session.user) {
          ctx.session.user.selectedRole = 'seller';
        }
        logger.info(`Saved seller role for user ${ctx.from.id} (from create shop button)`);
      }
    } catch (error) {
      logger.error('Failed to save role:', error);
    }

    // Enter create shop scene directly with the paid tier
    logger.info(`User ${ctx.from.id} entering create shop scene from subscription notification`, {
      tier,
    });
    await ctx.scene.enter('createShop', { tier });
  } catch (error) {
    logger.error('Error in start create shop handler:', error);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: sellerMenu(0),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};
