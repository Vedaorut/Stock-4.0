import { mainMenu } from '../keyboards/main.js';
import { handleSellerRole } from './seller/index.js';
import { handleBuyerRole } from './buyer/index.js';
import logger from '../utils/logger.js';

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
      const fakeCtx = {
        ...ctx,
        from: ctx.from,          // Explicitly copy from (getter property)
        message: ctx.message,    // Explicitly copy message
        chat: ctx.chat,          // Explicitly copy chat
        session: ctx.session,    // CRITICAL: pass session reference
        answerCbQuery: async () => {},
        editMessageText: async (text, keyboard) => {
          return await ctx.reply(text, keyboard);
        }
      };
      await handleSellerRole(fakeCtx);
      return;
    } else if (savedRole === 'buyer') {
      logger.info(`User has saved role: buyer`);
      ctx.session.role = 'buyer';
      // Create fake callback query context for handleBuyerRole
      const fakeCtx = {
        ...ctx,
        from: ctx.from,          // Explicitly copy from (getter property)
        message: ctx.message,    // Explicitly copy message
        chat: ctx.chat,          // Explicitly copy chat
        session: ctx.session,    // CRITICAL: pass session reference
        answerCbQuery: async () => {},
        editMessageText: async (text, keyboard) => {
          return await ctx.reply(text, keyboard);
        }
      };
      await handleBuyerRole(fakeCtx);
      return;
    }

    // No saved role, show role selection
    logger.info('No saved role, showing role selection');
    ctx.session.role = null;

    // Send welcome message (minimalist)
    await ctx.reply(
      'Status Stock\n\nРоль:',
      mainMenu
    );
  } catch (error) {
    logger.error('Error in /start handler:', error);
    throw error;
  }
};
