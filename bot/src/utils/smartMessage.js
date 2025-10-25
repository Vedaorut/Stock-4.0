/**
 * Smart Message Handler - Simplified
 * Edit-first pattern: try edit, fallback to reply
 * No session tracking, no complex retry logic
 */

import logger from './logger.js';

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Smart message sender with edit-first pattern
 * @param {Context} ctx - Telegraf context
 * @param {object} content - { text, photo, keyboard, parse_mode }
 * @returns {Promise<Message>} Sent/edited message
 */
export async function send(ctx, content) {
  const { text, photo, keyboard, parse_mode = 'HTML' } = content;
  const safeText = truncateText(text);

  // REMOVED: edit-first pattern to fix "disappearing messages" issue
  // Always send new message instead of editing previous one

  if (photo) {
    return await ctx.replyWithPhoto(photo, {
      caption: safeText,
      parse_mode,
      ...keyboard
    });
  } else {
    return await ctx.reply(safeText, {
      parse_mode,
      ...keyboard
    });
  }
}

/**
 * Truncate text to Telegram limit
 */
function truncateText(text, maxLength = MAX_MESSAGE_LENGTH) {
  if (!text || text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength - 30);
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = lastNewline > maxLength * 0.8 ? lastNewline : truncated.length;

  return truncated.slice(0, cutPoint) + '\n\n... (список сокращён)';
}

/**
 * Answer callback query (stop spinner)
 */
export async function answerCallback(ctx, text = '', showAlert = false) {
  try {
    await ctx.answerCbQuery(text, { show_alert: showAlert });
  } catch (error) {
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
