import { workspaceMenu, workspaceShopSelection } from '../../keyboards/workspace.js';
import { shopApi } from '../../utils/api.js';
import logger from '../../utils/logger.js';
import { messages } from '../../texts/messages.js';
import { handleOrderHistory } from '../seller/orders.js';

const { workspace: workspaceMessages, general: generalMessages } = messages;

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
      await ctx.editMessageText(generalMessages.authorizationRequired);
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
        await ctx.editMessageText(workspaceMessages.noWorkerAccess);
        return;
      }

      // Store accessible shops in session
      ctx.session.accessibleShops = workerShops;

      logger.info(`User ${ctx.from.id} has access to ${workerShops.length} workspace shops`);

      // Show shop selection
      await ctx.editMessageText(workspaceMessages.selectShop, workspaceShopSelection(workerShops));
    } catch (error) {
      logger.error('Error loading workspace shops:', error);

      if (error.response?.status === 404) {
        await ctx.editMessageText(workspaceMessages.noWorkerAccess);
      } else {
        await ctx.editMessageText(workspaceMessages.loadError);
      }
    }
  } catch (error) {
    logger.error('Error in workspace role handler:', error);
    try {
      await ctx.editMessageText(workspaceMessages.actionFailed);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle workspace shop selection
 * User selected a specific shop to work in
 *
 * P0-BOT-6 FIX: Server-side authorization verification
 */
export const handleWorkspaceShopSelect = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const shopId = parseInt(ctx.match[1]);

    // P0-BOT-6 FIX: Server-side verification
    // Don't trust session data - verify with backend
    if (!ctx.session.token) {
      logger.error('Missing token in workspace shop select', {
        userId: ctx.from.id,
        shopId,
      });
      await ctx.editMessageText(generalMessages.authorizationRequired);
      return;
    }

    try {
      // Fetch worker shops from backend (server-side verification)
      const workerShops = await shopApi.getWorkerShops(ctx.session.token);
      const authorizedShops = Array.isArray(workerShops)
        ? workerShops
        : Array.isArray(workerShops?.data)
          ? workerShops.data
          : [];

      // Verify user has access to this shop
      const shop = authorizedShops.find((s) => s.id === shopId);

      if (!shop) {
        logger.warn('Unauthorized workspace access attempt', {
          userId: ctx.from.id,
          shopId,
          authorizedShops: authorizedShops.map((s) => s.id),
        });

        await ctx.editMessageText(workspaceMessages.shopNotFoundOrRevoked);
        return;
      }

      // Update session with verified data
      ctx.session.accessibleShops = authorizedShops;
      ctx.session.workspaceMode = true;
      ctx.session.shopId = shop.id;
      ctx.session.shopName = shop.name;

      logger.info(`User ${ctx.from.id} entered workspace for shop ${shop.id} (verified)`);

      // Show workspace menu (restricted)
      await ctx.editMessageText(workspaceMessages.header(shop.name), workspaceMenu(shop.name));
    } catch (verifyError) {
      logger.error('Error verifying workspace access:', verifyError);

      if (verifyError.response?.status === 403) {
        await ctx.editMessageText(workspaceMessages.shopNotFoundOrRevoked);
      } else {
        await ctx.editMessageText(workspaceMessages.loadError);
      }
    }
  } catch (error) {
    logger.error('Error in workspace shop select handler:', error);
    try {
      await ctx.editMessageText(workspaceMessages.actionFailed);
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
        workspaceMessages.selectShop,
        workspaceShopSelection(ctx.session.accessibleShops)
      );
    } else {
      // Reload shops if not in session
      await handleWorkspaceRole(ctx);
    }
  } catch (error) {
    logger.error('Error in workspace back handler:', error);
    try {
      await ctx.editMessageText(workspaceMessages.actionFailed);
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

  // Sales/Order history for workers (reuses seller order history handler)
  bot.action('seller:sales', (ctx) => handleOrderHistory(ctx, 1));

  logger.info('Workspace handlers registered');
};

export default {
  handleWorkspaceRole,
  handleWorkspaceShopSelect,
  handleWorkspaceBack,
  setupWorkspaceHandlers,
};
