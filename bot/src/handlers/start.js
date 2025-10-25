import { mainMenu, mainMenuDefault } from '../keyboards/main.js';
import { shopApi } from '../utils/api.js';
import { handleSellerRole } from './seller/index.js';
import { handleBuyerRole } from './buyer/index.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';

/**
 * /start command handler
 */
export const handleStart = async (ctx) => {
  try {
    logger.info(`/start command from user ${ctx.from.id}`);

    // Clear conversation history on /start
    delete ctx.session.aiConversation;
    delete ctx.session.pendingAI;

    // Check if user has saved role
    const savedRole = ctx.session.user?.selectedRole;

    if (savedRole === 'seller') {
      logger.info(`User has saved role: seller`);
      ctx.session.role = 'seller';

      // Create fake callback query context for handleSellerRole
      // CRITICAL: Don't use Object.assign with getters - creates new object instead
      const fakeCtx = {
        ...ctx,
        answerCbQuery: async () => {},
        editMessageText: async (text, extra) => {
          return await ctx.reply(text, extra);
        }
      };

      await handleSellerRole(fakeCtx);
      return;
    } else if (savedRole === 'buyer') {
      logger.info(`User has saved role: buyer`);
      ctx.session.role = 'buyer';

      // Create fake callback query context for handleBuyerRole
      // CRITICAL: Don't use Object.assign with getters - creates new object instead
      const fakeCtx = {
        ...ctx,
        answerCbQuery: async () => {},
        editMessageText: async (text, extra) => {
          return await ctx.reply(text, extra);
        }
      };

      await handleBuyerRole(fakeCtx);
      return;
    }

    // No saved role, show role selection
    logger.info('No saved role, showing role selection');
    ctx.session.role = null;

    // Check if user has workspace access
    let showWorkspace = false;
    if (ctx.session.token) {
      try {
        const workerShops = await shopApi.getWorkerShops(ctx.session.token);
        showWorkspace = workerShops && workerShops.length > 0;
        logger.info(`User ${ctx.from.id} has workspace access: ${showWorkspace}`);
      } catch (error) {
        // Expected for new users or users without worker access
        logger.debug('Workspace check gracefully failed (expected for non-workers)', {
          userId: ctx.from.id,
          status: error.response?.status
        });
        // Continue without workspace button
      }
    }

    // Send welcome message using smartMessage (edit if exists, else send new)
    await smartMessage.send(ctx, {
      text: 'Status Stock\n\nРоль:',
      keyboard: mainMenu(showWorkspace)
    });
  } catch (error) {
    logger.error('Error in /start handler:', error);
    throw error;
  }
};
