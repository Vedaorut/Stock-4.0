/**
 * Smart Message Handler
 * Intelligently decides whether to edit existing message or send new one
 * Handles: 48h window, deleted messages, type mismatches, network errors
 */

import logger from './logger.js';
import * as messageTracker from './messageTracker.js';

const MAX_MESSAGE_LENGTH = 4000; // Telegram limit is 4096, leave buffer for markup
const MAX_RETRIES = 3;

/**
 * Smart message sender with automatic fallback
 * @param {Context} ctx - Telegraf context
 * @param {object} content - { text, photo, keyboard, parse_mode }
 * @param {object} options - { forceNew, skipTracking, retries }
 * @returns {Promise<Message>} Sent/edited message
 */
export async function send(ctx, content, options = {}) {
  const {
    forceNew = false,
    skipTracking = false,
    retries = MAX_RETRIES
  } = options;

  const { text, photo, keyboard, parse_mode = 'HTML' } = content;

  // Truncate long text
  const safeText = truncateText(text);

  // Check if we should try to edit
  if (!forceNew) {
    const lastMsg = messageTracker.getLastEditable(ctx);

    if (lastMsg) {
      // Determine message type
      const newType = photo ? 'photo' : 'text';

      // Check type compatibility
      if (messageTracker.canEdit(lastMsg.type, newType)) {
        // Try to edit existing message
        const editResult = await tryEdit(ctx, {
          messageId: lastMsg.messageId,
          text: safeText,
          photo,
          keyboard,
          parse_mode,
          retries
        });

        if (editResult.success) {
          if (!skipTracking) {
            messageTracker.track(ctx, editResult.message, newType);
          }
          return editResult.message;
        }

        // Edit failed - will fallback to send new
        logger.debug('Edit failed, falling back to send', {
          reason: editResult.reason,
          userId: ctx.from?.id
        });
      } else {
        // Type mismatch - delete old + send new
        logger.debug('Type mismatch, deleting old message', {
          oldType: lastMsg.type,
          newType,
          userId: ctx.from?.id
        });

        await messageTracker.deleteMessage(ctx, lastMsg.messageId);
      }
    }
  }

  // Send new message
  return sendNew(ctx, { text: safeText, photo, keyboard, parse_mode }, skipTracking);
}

/**
 * Try to edit existing message with retries
 * @param {Context} ctx - Telegraf context
 * @param {object} params - { messageId, text, photo, keyboard, parse_mode, retries }
 * @returns {Promise<object>} { success, message, reason }
 */
async function tryEdit(ctx, params) {
  const { messageId, text, photo, keyboard, parse_mode, retries } = params;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      let result;

      if (photo) {
        // Edit media message (photo to photo)
        result = await ctx.telegram.editMessageMedia(
          ctx.chat.id,
          messageId,
          null,
          {
            type: 'photo',
            media: photo,
            caption: text,
            parse_mode
          },
          keyboard ? { reply_markup: keyboard.reply_markup } : undefined
        );
      } else {
        // Edit text message
        result = await ctx.telegram.editMessageText(
          ctx.chat.id,
          messageId,
          null,
          text,
          {
            parse_mode,
            ...keyboard
          }
        );
      }

      logger.debug('Message edited successfully', {
        messageId,
        userId: ctx.from?.id,
        attempt: attempt + 1
      });

      return { success: true, message: result };
    } catch (error) {
      const errorCode = error.response?.error_code;
      const errorDesc = error.response?.description || '';

      // Handle 48h window / deleted message / wrong ID
      if (errorCode === 400) {
        if (errorDesc.includes("can't be edited") ||
            errorDesc.includes("not found") ||
            errorDesc.includes("message to edit not found")) {
          return {
            success: false,
            reason: 'message_not_editable',
            error: errorDesc
          };
        }

        // Message is not modified (identical text)
        if (errorDesc.includes("message is not modified")) {
          logger.debug('Message not modified (identical)', {
            messageId,
            userId: ctx.from?.id
          });
          return { success: true, message: { message_id: messageId } };
        }
      }

      // Rate limit - wait and retry
      if (errorCode === 429) {
        const retryAfter = error.response?.parameters?.retry_after || 5;
        logger.warn(`Rate limited, waiting ${retryAfter}s...`, {
          userId: ctx.from?.id,
          attempt: attempt + 1
        });

        await new Promise(r => setTimeout(r, retryAfter * 1000));

        if (attempt < retries - 1) continue;
      }

      // Network errors - retry with exponential backoff
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
        if (attempt < retries - 1) {
          const delay = 1000 * (attempt + 1); // Exponential backoff
          logger.warn(`Network error, retrying in ${delay}ms...`, {
            userId: ctx.from?.id,
            attempt: attempt + 1
          });

          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      // Unknown error
      logger.error('Edit failed with unknown error', {
        messageId,
        userId: ctx.from?.id,
        errorCode,
        errorDesc,
        attempt: attempt + 1
      });

      return {
        success: false,
        reason: 'unknown_error',
        error: error.message
      };
    }
  }

  return { success: false, reason: 'max_retries_exceeded' };
}

/**
 * Send new message
 * @param {Context} ctx - Telegraf context
 * @param {object} content - { text, photo, keyboard, parse_mode }
 * @param {boolean} skipTracking - Don't track in session
 * @returns {Promise<Message>} Sent message
 */
async function sendNew(ctx, content, skipTracking = false) {
  const { text, photo, keyboard, parse_mode } = content;

  try {
    let message;

    if (photo) {
      message = await ctx.replyWithPhoto(
        photo,
        {
          caption: text,
          parse_mode,
          ...keyboard
        }
      );
    } else {
      message = await ctx.reply(text, {
        parse_mode,
        ...keyboard
      });
    }

    if (!skipTracking) {
      const type = photo ? 'photo' : 'text';
      messageTracker.track(ctx, message, type);
    }

    logger.debug('New message sent', {
      messageId: message.message_id,
      type: photo ? 'photo' : 'text',
      userId: ctx.from?.id
    });

    return message;
  } catch (error) {
    logger.error('Failed to send new message', {
      userId: ctx.from?.id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Truncate text to Telegram limit
 * @param {string} text - Message text
 * @param {number} maxLength - Max length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = MAX_MESSAGE_LENGTH) {
  if (!text || text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength - 30); // Leave room for suffix
  const lastNewline = truncated.lastIndexOf('\n');

  // Cut at last newline to avoid breaking lines
  const cutPoint = lastNewline > maxLength * 0.8 ? lastNewline : truncated.length;

  return truncated.slice(0, cutPoint) + '\n\n... (список сокращён)';
}

/**
 * Send answer callback query (stop spinner)
 * @param {Context} ctx - Telegraf context
 * @param {string} text - Alert text (optional)
 * @param {boolean} showAlert - Show as alert popup
 */
export async function answerCallback(ctx, text = '', showAlert = false) {
  try {
    await ctx.answerCbQuery(text, { show_alert: showAlert });
  } catch (error) {
    // Callback query might be too old (>5 seconds)
    logger.debug('answerCbQuery failed (query too old?)', {
      userId: ctx.from?.id,
      error: error.message
    });
  }
}

export default {
  send,
  answerCallback,
  truncateText
};
