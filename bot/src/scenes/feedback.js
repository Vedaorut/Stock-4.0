import { Scenes, Markup } from 'telegraf';
import { t } from '../i18n/index.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import config from '../config/index.js';
import { sellerToolsMenu } from '../keyboards/seller.js';

/**
 * Feedback Scene - Simple 2-step wizard
 * 1. Show prompt
 * 2. Receive message and forward to admin
 */

const cancelButton = (lang) =>
  Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), 'cancel_scene')]]);

// Step 1: Show feedback prompt
const showPrompt = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    logger.info('feedback_scene:start', { userId: ctx.from.id });

    await smartMessage.send(ctx, {
      text: t('feedback.prompt', {}, lang),
      keyboard: cancelButton(lang),
      parse_mode: 'HTML',
    });

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in feedback showPrompt:', error);
    throw error;
  }
};

// Step 2: Receive and forward feedback
const receiveFeedback = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';

    // BOT-P0-001 FIX: Validate adminTelegramId before attempting to send
    if (!config.adminTelegramId || !/^\d+$/.test(config.adminTelegramId)) {
      logger.error('feedback_admin_not_configured', {
        adminTelegramId: config.adminTelegramId,
        userId: ctx.from.id,
      });
      await smartMessage.send(ctx, {
        text: t('feedback.error', {}, lang),
        keyboard: sellerToolsMenu(ctx.session?.isOwner, lang),
      });
      return ctx.scene.leave();
    }

    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, {
        text: t('scenes.sendTextMessage', {}, lang),
      });
      return;
    }

    const feedbackText = ctx.message.text.trim();
    const userMsgId = ctx.message.message_id;

    // Delete user message for clean chat
    await ctx.deleteMessage(userMsgId).catch((err) => {
      logger.debug(`Could not delete user message ${userMsgId}:`, err.message);
    });

    // Validate minimum length
    if (feedbackText.length < 10) {
      await smartMessage.send(ctx, {
        text: t('feedback.tooShort', {}, lang),
        keyboard: cancelButton(lang),
      });
      return;
    }

    logger.info('feedback_received', {
      userId: ctx.from.id,
      username: ctx.from.username,
      length: feedbackText.length,
    });

    // Build feedback message for admin
    const userInfo = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
    const shopInfo = ctx.session?.shopId ? `\nShop ID: ${ctx.session.shopId}` : '';

    const adminMessage = `📝 <b>New Feedback</b>\n\nFrom: ${userInfo} (${ctx.from.id})${shopInfo}\n\n<i>${feedbackText}</i>`;

    // Send to admin
    try {
      await ctx.telegram.sendMessage(config.adminTelegramId, adminMessage, {
        parse_mode: 'HTML',
      });

      await smartMessage.send(ctx, {
        text: t('feedback.success', {}, lang),
        keyboard: sellerToolsMenu(ctx.session?.isOwner, lang),
      });

      logger.info('feedback_sent_to_admin', {
        userId: ctx.from.id,
        adminId: config.adminTelegramId,
      });
    } catch (sendError) {
      logger.error('Failed to send feedback to admin:', sendError);
      await smartMessage.send(ctx, {
        text: t('feedback.error', {}, lang),
        keyboard: sellerToolsMenu(ctx.session?.isOwner, lang),
      });
    }

    return ctx.scene.leave();
  } catch (error) {
    logger.error('Error in feedback receiveFeedback:', error);
    const lang = ctx.lang || ctx.session?.language || 'ru';
    await smartMessage.send(ctx, {
      text: t('feedback.error', {}, lang),
      keyboard: sellerToolsMenu(ctx.session?.isOwner, lang),
    });
    return ctx.scene.leave();
  }
};

// Create wizard scene
const feedbackScene = new Scenes.WizardScene('feedback', showPrompt, receiveFeedback);

// Handle scene leave
feedbackScene.leave(async (ctx) => {
  // P0 FIX: Use assignment instead of delete to prevent TypeError
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  ctx.scene.state = {};

  // P0 FIX: REMOVED delete ctx.session.__scenes
  // Telegraf manages __scenes automatically. Deleting it here can cause
  // race condition when scene.leave() is followed by scene.enter()

  logger.info(`User ${ctx.from?.id} left feedback scene`);
});

// Handle cancel
feedbackScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('feedback_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();

    const lang = ctx.lang || ctx.session?.language || 'ru';
    await ctx.editMessageText(t('feedback.cancelled', {}, lang), sellerToolsMenu(ctx.session?.isOwner, lang));
  } catch (error) {
    logger.error('Error in feedback cancel handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

feedbackScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('feedback_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();

    const lang = ctx.lang || ctx.session?.language || 'ru';
    await ctx.editMessageText(t('feedback.cancelled', {}, lang), sellerToolsMenu(ctx.session?.isOwner, lang));
  } catch (error) {
    logger.error('Error in feedback cancel handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

export default feedbackScene;
