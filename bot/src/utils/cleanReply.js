import logger from './logger.js';

/**
 * Safely send reply with error handling.
 * Simple wrapper for ctx.reply.
 */
export async function reply(ctx, text, options = {}) {
  try {
    return await ctx.reply(text, options);
  } catch (error) {
    logger.error('cleanReply.reply failed', {
      userId: ctx.from?.id,
      error: error.message
    });
    throw error;
  }
}

/**
 * HTML variant with parse_mode: 'HTML'
 */
export async function replyHTML(ctx, text, options = {}) {
  return reply(ctx, text, { parse_mode: 'HTML', ...options });
}

/**
 * Markdown variant
 */
export async function replyMarkdown(ctx, text, options = {}) {
  return reply(ctx, text, { parse_mode: 'Markdown', ...options });
}

/**
 * Photo variant
 */
export async function replyPhoto(ctx, photo, options = {}) {
  try {
    return await ctx.replyWithPhoto(photo, options);
  } catch (error) {
    logger.error('cleanReply.replyPhoto failed', {
      userId: ctx.from?.id,
      error: error.message
    });
    throw error;
  }
}

export default {
  reply,
  replyHTML,
  replyMarkdown,
  replyPhoto
};
