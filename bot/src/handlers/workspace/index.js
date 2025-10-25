import { workspaceMenu, workspaceShopSelection } from '../../keyboards/workspace.js';
import { shopApi } from '../../utils/api.js';
import logger from '../../utils/logger.js';

/**
 * Handle workspace role selection
 * Shows list of shops where user is worker (not owner)
 */
export const handleWorkspaceRole = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    ctx.session.role = 'workspace';
    logger.info(`User ${ctx.from.id} selected workspace role`);

    // Check if token exists
    if (!ctx.session.token) {
      logger.warn(`User ${ctx.from.id} has no token, cannot load workspace`);
      await ctx.editMessageText(
        'Необходима авторизация. Перезапустите бота командой /start'
      );
      return;
    }

    // Get shops where user is worker (not owner)
    try {
      const response = await shopApi.getWorkerShops(ctx.session.token);
      const workerShops = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];

      if (workerShops.length === 0) {
        await ctx.editMessageText(
          'У вас нет доступа к workspace магазинам.\n\nСпросите владельца магазина добавить вас как работника.'
        );
        return;
      }

      // Store accessible shops in session
      ctx.session.accessibleShops = workerShops;

      logger.info(`User ${ctx.from.id} has access to ${workerShops.length} workspace shops`);

      // Show shop selection
      await ctx.editMessageText(
        'Выберите магазин:',
        workspaceShopSelection(workerShops)
      );

    } catch (error) {
      logger.error('Error loading workspace shops:', error);
      
      if (error.response?.status === 404) {
        await ctx.editMessageText(
          'У вас нет доступа к workspace магазинам.\n\nСпросите владельца магазина добавить вас как работника.'
        );
      } else {
        await ctx.editMessageText(
          'Ошибка загрузки магазинов\n\nПопробуйте позже'
        );
      }
    }

  } catch (error) {
    logger.error('Error in workspace role handler:', error);
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже'
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle workspace shop selection
 * User selected a specific shop to work in
 */
export const handleWorkspaceShopSelect = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const shopId = parseInt(ctx.match[1]);

    // Validate shop exists in accessible shops
    const shop = ctx.session.accessibleShops?.find(s => s.id === shopId);
    if (!shop) {
      await ctx.editMessageText(
        'Магазин не найден или доступ отозван'
      );
      return;
    }

    // Set workspace mode
    ctx.session.workspaceMode = true;
    ctx.session.shopId = shop.id;
    ctx.session.shopName = shop.name;

    logger.info(`User ${ctx.from.id} entered workspace for shop ${shop.id}`);

    // Show workspace menu (restricted)
    await ctx.editMessageText(
      `Workspace: ${shop.name}\n\n`,
      workspaceMenu(shop.name)
    );

  } catch (error) {
    logger.error('Error in workspace shop select handler:', error);
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже'
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle back button from workspace menu
 * Returns to workspace shop selection
 */
export const handleWorkspaceBack = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Reset workspace mode
    ctx.session.workspaceMode = false;
    ctx.session.shopId = null;
    ctx.session.shopName = null;

    // Show shop selection again
    if (ctx.session.accessibleShops && ctx.session.accessibleShops.length > 0) {
      await ctx.editMessageText(
        'Выберите магазин:',
        workspaceShopSelection(ctx.session.accessibleShops)
      );
    } else {
      // Reload shops if not in session
      await handleWorkspaceRole(ctx);
    }

  } catch (error) {
    logger.error('Error in workspace back handler:', error);
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже'
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Setup workspace handlers
 */
export const setupWorkspaceHandlers = (bot) => {
  // Workspace role selected
  bot.action('role:workspace', handleWorkspaceRole);

  // Workspace shop selection
  bot.action(/^workspace:select:(\d+)$/, handleWorkspaceShopSelect);

  // Back button
  bot.action('workspace:back', handleWorkspaceBack);

  logger.info('Workspace handlers registered');
};

export default {
  handleWorkspaceRole,
  handleWorkspaceShopSelect,
  handleWorkspaceBack,
  setupWorkspaceHandlers
};
