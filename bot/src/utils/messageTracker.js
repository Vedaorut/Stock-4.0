/**
 * Message Tracker
 * Tracks message IDs in session for intelligent edit/delete operations
 * Supports context-aware cleanup (AI conversation, wizard, navigation)
 */

import logger from './logger.js';

const MAX_HISTORY_SIZE = 4; // Max messages to keep in chat

/**
 * Initialize message tracking in session
 * @param {Context} ctx - Telegraf context
 */
export function initMessages(ctx) {
  if (!ctx.session.messages) {
    ctx.session.messages = {
      current: null,        // Last editable message ID
      history: [],          // FIFO queue of message IDs (max 4)
      welcome: null,        // Welcome message (pinned, never delete)
      types: {},            // Track message types for edit validation
      timestamps: {}        // Track when messages were sent
    };
  }
  return ctx.session.messages;
}

/**
 * Track new message in session
 * @param {Context} ctx - Telegraf context
 * @param {Message} message - Telegram message object
 * @param {string} type - Message type: 'text', 'photo', 'document'
 * @param {object} options - { pinned: boolean, skipHistory: boolean }
 */
export function track(ctx, message, type = 'text', options = {}) {
  const messages = initMessages(ctx);
  const messageId = message?.message_id || message;

  if (!messageId) {
    logger.warn('track() called with invalid message', { message });
    return;
  }

  // Update current message
  messages.current = messageId;
  messages.types[messageId] = type;
  messages.timestamps[messageId] = Date.now();

  // Pin welcome message
  if (options.pinned) {
    messages.welcome = messageId;
    logger.debug('Message pinned as welcome', { messageId, userId: ctx.from?.id });
  }

  // Add to history queue (unless skipHistory)
  if (!options.skipHistory && !messages.history.includes(messageId)) {
    messages.history.push(messageId);

    // Auto-cleanup if exceeds max
    if (messages.history.length > MAX_HISTORY_SIZE) {
      const oldestId = messages.history.shift();

      // Skip cleanup for pinned messages
      if (oldestId !== messages.welcome) {
        deleteMessage(ctx, oldestId).catch(() => {
          // Ignore deletion errors (already deleted by user, etc.)
        });
      } else {
        // Put welcome back in history
        messages.history.unshift(oldestId);
      }
    }
  }

  logger.debug('Message tracked', {
    messageId,
    type,
    historySize: messages.history.length,
    userId: ctx.from?.id
  });
}

/**
 * Get last editable message
 * @param {Context} ctx - Telegraf context
 * @returns {object|null} { messageId, type, age } or null
 */
export function getLastEditable(ctx) {
  const messages = initMessages(ctx);

  if (!messages.current) {
    return null;
  }

  const type = messages.types[messages.current] || 'text';
  const timestamp = messages.timestamps[messages.current] || Date.now();
  const age = Date.now() - timestamp;

  return {
    messageId: messages.current,
    type,
    age,
    tooOld: age > 48 * 60 * 60 * 1000 // 48 hours in ms
  };
}

/**
 * Pin message as welcome (never delete)
 * @param {Context} ctx - Telegraf context
 * @param {number} messageId - Message ID to pin
 */
export function pin(ctx, messageId) {
  const messages = initMessages(ctx);
  messages.welcome = messageId;
  logger.debug('Message pinned', { messageId, userId: ctx.from?.id });
}

/**
 * Delete message safely (with error handling)
 * @param {Context} ctx - Telegraf context
 * @param {number} messageId - Message ID to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteMessage(ctx, messageId) {
  if (!messageId) return false;

  try {
    // Small delay to let any pending edits complete
    await new Promise(resolve => setTimeout(resolve, 100));

    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);

    // Clean up from tracking
    const messages = ctx.session.messages;
    if (messages) {
      delete messages.types[messageId];
      delete messages.timestamps[messageId];

      const index = messages.history.indexOf(messageId);
      if (index > -1) {
        messages.history.splice(index, 1);
      }

      if (messages.current === messageId) {
        messages.current = null;
      }
    }

    logger.debug('Message deleted', { messageId, userId: ctx.from?.id });
    return true;
  } catch (error) {
    // Message already deleted or too old - not an error
    if (error.response?.error_code === 400) {
      logger.debug('Message delete failed (already deleted?)', {
        messageId,
        userId: ctx.from?.id,
        error: error.response?.description
      });
    } else {
      logger.warn('Message delete failed', {
        messageId,
        userId: ctx.from?.id,
        error: error.message
      });
    }
    return false;
  }
}

/**
 * Cleanup old messages (keep N most recent)
 * @param {Context} ctx - Telegraf context
 * @param {object} options - { keepWelcome: boolean, keepLast: number }
 */
export async function cleanup(ctx, options = {}) {
  const { keepWelcome = true, keepLast = 1 } = options;
  const messages = initMessages(ctx);

  if (!messages.history.length) return;

  // Determine which messages to delete
  const toDelete = [];
  const toKeep = [];

  for (let i = 0; i < messages.history.length; i++) {
    const msgId = messages.history[i];

    // Keep welcome if requested
    if (keepWelcome && msgId === messages.welcome) {
      toKeep.push(msgId);
      continue;
    }

    // Keep last N messages
    if (i >= messages.history.length - keepLast) {
      toKeep.push(msgId);
      continue;
    }

    toDelete.push(msgId);
  }

  // Delete messages
  for (const msgId of toDelete) {
    await deleteMessage(ctx, msgId);
  }

  // Update history
  messages.history = toKeep;

  logger.debug('Cleanup completed', {
    deleted: toDelete.length,
    kept: toKeep.length,
    userId: ctx.from?.id
  });
}

/**
 * Cleanup ALL messages except welcome
 * @param {Context} ctx - Telegraf context
 */
export async function cleanupAll(ctx) {
  await cleanup(ctx, { keepWelcome: true, keepLast: 0 });
}

/**
 * Check if message type is compatible for editing
 * @param {string} currentType - Current message type
 * @param {string} newType - New message type
 * @returns {boolean} Can edit?
 */
export function canEdit(currentType, newType) {
  // Text can only edit to text
  if (currentType === 'text' && newType === 'text') return true;

  // Photo can edit to photo (using editMessageMedia)
  if (currentType === 'photo' && newType === 'photo') return true;

  // Everything else requires delete + send new
  return false;
}

/**
 * Get message age in hours
 * @param {Context} ctx - Telegraf context
 * @param {number} messageId - Message ID
 * @returns {number} Age in hours
 */
export function getMessageAge(ctx, messageId) {
  const messages = initMessages(ctx);
  const timestamp = messages.timestamps[messageId];

  if (!timestamp) return 999; // Unknown age = assume very old

  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

export default {
  initMessages,
  track,
  getLastEditable,
  pin,
  deleteMessage,
  cleanup,
  cleanupAll,
  canEdit,
  getMessageAge
};
