import { Scenes, Markup } from 'telegraf';
import { followApi } from '../utils/api.js';
import { formatFollowDetail } from '../utils/minimalist.js';
import { followDetailMenu, followsMenu } from '../keyboards/seller.js';
import logger from '../utils/logger.js';
import { messages } from '../texts/messages.js';

const { general: generalMessages, follows: followMessages } = messages;

// Markup type selection keyboard
const markupTypeKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('% Процент', 'markup_type:percentage'),
    Markup.button.callback('$ Фиксированная', 'markup_type:fixed'),
  ],
  [Markup.button.callback('❌ Отмена', 'cancel_scene')],
]);

/**
 * Edit Follow Markup Scene
 *
 * P1-BOT-003 FIX: Scene-based state management prevents race conditions
 * from multiple simultaneous edit_markup callback_query triggers
 *
 * Flow:
 * 1. Enter scene with followId
 * 2. Show prompt
 * 3. Wait for markup input
 * 4. Update via API
 * 5. Leave scene
 */

// Step 1: Show markup type selection
const showMarkupTypeSelection = async (ctx) => {
  try {
    // P1-BOT-003 FIX: Validate and set lock (moved from enter() hook)
    const followId = ctx.scene.state.followId;
    if (!followId) {
      logger.error('No followId provided to editFollowMarkup scene');
      return ctx.scene.leave();
    }

    const now = Date.now();
    const existingLock = ctx.session.editingFollowId;
    const lockTimestamp = ctx.session.editingFollowTimestamp || 0;

    // If same follow being edited AND lock is fresh (< 30 seconds old)
    if (existingLock === followId && now - lockTimestamp < 30000) {
      logger.warn('Already editing follow, ignoring duplicate request', {
        userId: ctx.from.id,
        followId,
        lockAge: now - lockTimestamp,
      });
      return ctx.scene.leave();
    }

    // Set lock with timestamp
    ctx.session.editingFollowId = followId;
    ctx.session.editingFollowTimestamp = now;

    const pendingModeSwitch = ctx.scene.state.pendingModeSwitch;

    logger.info('edit_markup_step:type_selection', {
      userId: ctx.from.id,
      followId,
      pendingModeSwitch,
    });

    await ctx.reply(followMessages.markupTypePrompt, markupTypeKeyboard);

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in showMarkupTypeSelection step:', error);
    throw error;
  }
};

// Step 2: Handle markup type selection (via action) or wait
const waitForMarkupType = async (ctx) => {
  // This step is handled by action handlers, just wait
  if (ctx.message?.text) {
    await ctx.reply(followMessages.markupTypeRequired, markupTypeKeyboard);
  }
  return;
};

// Step 3: Handle markup value input
const handleMarkupInput = async (ctx) => {
  try {
    const markupType = ctx.scene.state.markupType;
    if (!markupType) {
      await ctx.reply(followMessages.markupTypeRequired, markupTypeKeyboard);
      return;
    }

    if (!ctx.message || !ctx.message.text) {
      const prompt = markupType === 'fixed'
        ? followMessages.markupFixedPrompt
        : followMessages.markupPercentagePrompt;
      await ctx.reply('Пожалуйста, отправьте наценку текстом (только число).\n\n' + prompt);
      return;
    }

    // Track user message for cleanup
    const userMsgId = ctx.message.message_id;
    const markupText = ctx.message.text.trim().replace(',', '.');
    const markup = parseFloat(markupText);

    // Validate based on type
    let isValid = false;
    let invalidMessage = '';
    if (markupType === 'fixed') {
      // Fixed: $0-$1000
      isValid = !isNaN(markup) && markup >= 0 && markup <= 1000;
      invalidMessage = followMessages.markupFixedInvalid;
    } else {
      // Percentage: 1-500%
      isValid = !isNaN(markup) && markup >= 1 && markup <= 500;
      invalidMessage = followMessages.markupInvalid;
    }

    if (!isValid) {
      await ctx.reply(invalidMessage);
      // Delete invalid input message (M20 FIX: improved error logging)
      await ctx.deleteMessage(userMsgId).catch((err) => {
        // Log WARN for unexpected errors (not 400 Bad Request or 429 rate limit)
        const status = err.response?.error_code || err.code;
        if (status !== 400 && status !== 429) {
          logger.warn('Unexpected deleteMessage error (invalid input)', {
            messageId: userMsgId,
            error: err.message,
            status,
          });
        }
      });
      return;
    }

    // Delete user message (clean chat pattern) - M20 FIX: improved logging
    await ctx.deleteMessage(userMsgId).catch((err) => {
      const status = err.response?.error_code || err.code;
      if (status !== 400 && status !== 429) {
        logger.warn('Unexpected deleteMessage error (markup input)', {
          messageId: userMsgId,
          error: err.message,
          status,
        });
      } else {
        logger.debug(`Could not delete user message ${userMsgId}:`, err.message);
      }
    });

    const followId = ctx.scene.state.followId;
    const pendingModeSwitch = ctx.scene.state.pendingModeSwitch;
    const token = ctx.session.token;

    if (!token) {
      await ctx.reply(generalMessages.authorizationRequired);
      return ctx.scene.leave();
    }

    logger.info('edit_markup_step:save', {
      userId: ctx.from.id,
      followId,
      markupType,
      markup,
      pendingModeSwitch,
    });

    await ctx.reply(followMessages.createSaving);

    // Build markup data object
    const markupData = {
      markupType,
      markupPercentage: markupType === 'percentage' ? markup : 0,
      markupFixed: markupType === 'fixed' ? markup : 0,
    };

    try {
      if (pendingModeSwitch) {
        // Mode switch: use switchMode API with markup data object
        await followApi.switchMode(followId, pendingModeSwitch, token, markupData);
      } else {
        // Simple markup update: use updateMarkup API with object
        await followApi.updateMarkup(followId, markupData, token);
      }

      // Fetch updated follow detail
      const follow = await followApi.getFollowDetail(followId, token);
      const message = formatFollowDetail(follow);

      await ctx.reply(message, followDetailMenu(followId, follow.mode));

      const successMsg = markupType === 'fixed'
        ? followMessages.markupFixedUpdated(markup)
        : followMessages.markupUpdated(markup);

      logger.info('markup_updated', {
        userId: ctx.from.id,
        followId,
        markupType,
        markup,
        mode: follow.mode,
      });

      return ctx.scene.leave();
    } catch (error) {
      logger.error('Error updating markup:', error);

      const errorMsg = error.response?.data?.error;
      let message = followMessages.switchError;

      if (error.response?.status === 402) {
        message = followMessages.limitReached;
      } else if (error.response?.status === 404) {
        message = followMessages.notFound;
      } else if (errorMsg?.toLowerCase().includes('markup')) {
        message = followMessages.markupInvalid;
      }

      await ctx.reply(message, followsMenu(Boolean(ctx.session?.hasFollows)));
      return ctx.scene.leave();
    }
  } catch (error) {
    logger.error('Error in handleMarkupInput step:', error);
    await ctx.reply(followMessages.switchError, followsMenu(Boolean(ctx.session?.hasFollows)));
    return ctx.scene.leave();
  }
};

// Create wizard scene
const editFollowMarkupScene = new Scenes.WizardScene(
  'editFollowMarkup',
  showMarkupTypeSelection,
  waitForMarkupType,
  handleMarkupInput
);

// P1-BOT-003 FIX: Removed custom enter() hook to allow first wizard step to execute automatically
// Race condition prevention logic moved to first step (showMarkupPrompt)

// Handle scene leave - cleanup
editFollowMarkupScene.leave(async (ctx) => {
  // ✅ Clear lock with timestamp
  delete ctx.session.editingFollowId;
  delete ctx.session.editingFollowTimestamp;
  delete ctx.session.pendingModeSwitch;

  // ✅ Clear wizard state (P1-2 fix)
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};

  logger.info(`User ${ctx.from?.id} left editFollowMarkup scene`);
});

// Handle markup type selection
editFollowMarkupScene.action(/^markup_type:(percentage|fixed)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const markupType = ctx.match[1];
    ctx.scene.state.markupType = markupType;

    logger.info('edit_markup_type_selected', {
      userId: ctx.from.id,
      followId: ctx.scene.state.followId,
      markupType,
    });

    // Show appropriate prompt based on type
    const prompt = markupType === 'fixed'
      ? followMessages.markupFixedPrompt
      : followMessages.markupPercentagePrompt;

    await ctx.editMessageText(
      prompt,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_scene')]])
    );

    // Move to value input step
    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in markup_type handler:', error);
    await ctx.reply(followMessages.switchError, followsMenu(Boolean(ctx.session?.hasFollows)));
    return ctx.scene.leave();
  }
});

// Handle cancel action within scene
editFollowMarkupScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('edit_markup_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await ctx.reply(followMessages.createCancelled, followsMenu(Boolean(ctx.session?.hasFollows)));
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      await ctx.reply(
        followMessages.cancelOperationError,
        followsMenu(Boolean(ctx.session?.hasFollows))
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default editFollowMarkupScene;
