/**
 * Debounce Middleware
 * Prevents rapid button clicks (race conditions)
 * Enforces minimum delay between actions
 */

import logger from '../utils/logger.js';

const DEBOUNCE_MS = 300; // 300ms between actions

/**
 * Debounce middleware for callback queries
 * Blocks actions if user clicked too quickly
 */
const debounceMiddleware = async (ctx, next) => {
  // Only debounce callback queries (button clicks)
  if (!ctx.callbackQuery) {
    return next();
  }

  // Initialize session if needed
  if (!ctx.session) {
    ctx.session = {};
  }

  // Check last action time
  const lastActionTime = ctx.session.lastActionTime || 0;
  const now = Date.now();
  const timeSinceLastAction = now - lastActionTime;

  if (timeSinceLastAction < DEBOUNCE_MS) {
    logger.debug('Action debounced (too fast)', {
      userId: ctx.from?.id,
      timeSinceLastAction,
      action: ctx.callbackQuery.data
    });

    // Answer callback query with "please wait" message
    try {
      await ctx.answerCbQuery('⏳ Подождите...');
    } catch (error) {
      logger.debug('Failed to answer debounced query', {
        error: error.message
      });
    }

    // Block this action
    return;
  }

  // Update last action time
  ctx.session.lastActionTime = now;

  // Continue to handler
  return next();
};

export default debounceMiddleware;
