/**
 * Message Cleanup
 * Context-aware message cleanup strategies
 * Different cleanup policies for AI, wizard, navigation
 */

import logger from './logger.js';
import * as messageTracker from './messageTracker.js';

/**
 * Cleanup context types
 */
export const CleanupContext = {
  NAVIGATION: 'navigation',     // Main menu navigation - keep current only
  WIZARD: 'wizard',             // Wizard scenes - cleanup on exit
  AI_CONVERSATION: 'ai',        // AI chat - keep history for context
  PAYMENT: 'payment'            // Payment flow - delete temp messages
};

/**
 * Cleanup policies per context
 */
const CleanupPolicies = {
  [CleanupContext.NAVIGATION]: {
    keepLast: 1,
    keepWelcome: true,
    immediate: false
  },
  [CleanupContext.WIZARD]: {
    keepLast: 1,              // Keep only result message
    keepWelcome: true,
    immediate: true           // Clean on scene.leave()
  },
  [CleanupContext.AI_CONVERSATION]: {
    keepLast: 3,              // Keep last 3 for context
    keepWelcome: true,
    immediate: false
  },
  [CleanupContext.PAYMENT]: {
    keepLast: 1,
    keepWelcome: true,
    immediate: true           // Delete loading messages immediately
  }
};

/**
 * Execute cleanup based on context
 * @param {Context} ctx - Telegraf context
 * @param {string} context - Cleanup context type
 * @param {object} options - Override policy options
 */
export async function cleanupByContext(ctx, context = CleanupContext.NAVIGATION, options = {}) {
  const policy = CleanupPolicies[context] || CleanupPolicies[CleanupContext.NAVIGATION];
  const finalOptions = { ...policy, ...options };

  logger.debug('Starting cleanup', {
    context,
    policy: finalOptions,
    userId: ctx.from?.id
  });

  await messageTracker.cleanup(ctx, finalOptions);
}

/**
 * Wizard cleanup - called on scene.leave()
 * Deletes all wizard messages except final result
 * @param {Context} ctx - Telegraf context
 * @param {object} options - { keepWelcome, keepFinalMessage }
 */
export async function cleanupWizard(ctx, options = {}) {
  const { keepWelcome = true, keepFinalMessage = true } = options;

  await cleanupByContext(ctx, CleanupContext.WIZARD, {
    keepLast: keepFinalMessage ? 1 : 0,
    keepWelcome
  });

  logger.info('Wizard cleanup completed', {
    userId: ctx.from?.id,
    scene: ctx.scene?.current?.id
  });
}

/**
 * AI conversation cleanup
 * Keep last N messages for context
 * @param {Context} ctx - Telegraf context
 * @param {number} keepLast - Number of messages to keep
 */
export async function cleanupAI(ctx, keepLast = 3) {
  await cleanupByContext(ctx, CleanupContext.AI_CONVERSATION, {
    keepLast
  });

  logger.info('AI conversation cleanup completed', {
    userId: ctx.from?.id,
    keptMessages: keepLast
  });
}

/**
 * Delete temporary message (e.g., loading spinner)
 * @param {Context} ctx - Telegraf context
 * @param {number} messageId - Message ID to delete
 * @param {number} delay - Delay before deletion (ms)
 */
export async function deleteTempMessage(ctx, messageId, delay = 100) {
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  await messageTracker.deleteMessage(ctx, messageId);

  logger.debug('Temp message deleted', {
    messageId,
    userId: ctx.from?.id
  });
}

/**
 * Delete loading message after operation
 * Common pattern: show loading → do work → delete loading → show result
 * @param {Context} ctx - Telegraf context
 * @param {Message} loadingMsg - Loading message object
 * @param {Function} operation - Async operation to perform
 * @returns {Promise<any>} Operation result
 */
export async function withLoadingMessage(ctx, loadingMsg, operation) {
  try {
    const result = await operation();

    // Delete loading message
    if (loadingMsg) {
      await deleteTempMessage(ctx, loadingMsg.message_id, 100);
    }

    return result;
  } catch (error) {
    // Still delete loading message on error
    if (loadingMsg) {
      await deleteTempMessage(ctx, loadingMsg.message_id, 100);
    }

    throw error;
  }
}

/**
 * Cleanup on /start command
 * Keep welcome message, clear everything else
 * @param {Context} ctx - Telegraf context
 */
export async function cleanupOnStart(ctx) {
  await messageTracker.cleanupAll(ctx);

  logger.debug('/start cleanup completed', {
    userId: ctx.from?.id
  });
}

/**
 * Smart cleanup - analyze message history and decide what to delete
 * Use when cleanup context is uncertain
 * @param {Context} ctx - Telegraf context
 */
export async function smartCleanup(ctx) {
  const messages = ctx.session.messages;

  if (!messages || !messages.history.length) {
    return;
  }

  // Check if in wizard scene
  if (ctx.scene?.current) {
    await cleanupWizard(ctx);
    return;
  }

  // Check if AI conversation active
  if (ctx.session.aiConversation && ctx.session.aiConversation.length > 0) {
    await cleanupAI(ctx, 3);
    return;
  }

  // Default: navigation cleanup
  await cleanupByContext(ctx, CleanupContext.NAVIGATION);
}

/**
 * Schedule cleanup (for delayed cleanup)
 * @param {Context} ctx - Telegraf context
 * @param {number} delay - Delay in ms
 * @param {string} context - Cleanup context
 */
export function scheduleCleanup(ctx, delay, context = CleanupContext.NAVIGATION) {
  setTimeout(async () => {
    try {
      await cleanupByContext(ctx, context);
    } catch (error) {
      logger.error('Scheduled cleanup failed', {
        userId: ctx.from?.id,
        error: error.message
      });
    }
  }, delay);

  logger.debug('Cleanup scheduled', {
    delay,
    context,
    userId: ctx.from?.id
  });
}

/**
 * Delete QR code message after timeout
 * Used in wallet management
 * @param {Context} ctx - Telegraf context
 * @param {number} messageId - QR code message ID
 * @param {number} timeout - Timeout in ms (default 30s)
 */
export function deleteQRAfterTimeout(ctx, messageId, timeout = 30000) {
  setTimeout(async () => {
    try {
      await messageTracker.deleteMessage(ctx, messageId);
      logger.debug('QR code deleted after timeout', {
        messageId,
        userId: ctx.from?.id
      });
    } catch (error) {
      logger.debug('QR code delete failed (already deleted?)', {
        messageId,
        userId: ctx.from?.id
      });
    }
  }, timeout);

  logger.debug('QR code scheduled for deletion', {
    messageId,
    timeout,
    userId: ctx.from?.id
  });
}

export default {
  CleanupContext,
  cleanupByContext,
  cleanupWizard,
  cleanupAI,
  deleteTempMessage,
  withLoadingMessage,
  cleanupOnStart,
  smartCleanup,
  scheduleCleanup,
  deleteQRAfterTimeout
};
