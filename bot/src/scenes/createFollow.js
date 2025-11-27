import { Scenes, Markup } from 'telegraf';
import { successButtons, cancelButton } from '../keyboards/common.js';
import { followApi, shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply } from '../utils/cleanReply.js';
import { messages } from '../texts/messages.js';

const { general: generalMessages, follows: followMessages } = messages;

/**
 * Create Follow Scene - Multi-step wizard
 * Steps:
 * 1. Enter source shop ID
 * 2. Validate shop and select mode (monitor/resell)
 * 3. If resell: enter markup percentage
 * 4. Complete
 */

// Step 1: Enter source shop ID
const enterShopId = async (ctx) => {
  try {
    logger.info('follow_create_step:shop_id', { userId: ctx.from.id });

    // Check token first
    if (!ctx.session.token) {
      await ctx.reply(generalMessages.authorizationRequired, successButtons);
      return ctx.scene.leave();
    }

    // FIX P1-BOT-018: Check follow limit EARLY before user enters shop ID
    // This provides better UX - show limit error immediately instead of after user fills in details
    try {
      const limit = await followApi.checkFollowLimit(ctx.session.shopId, ctx.session.token);
      if (limit.reached) {
        await smartMessage.send(ctx, {
          text: followMessages.createLimitReached(limit.count, limit.limit),
          keyboard: successButtons,
        });
        logger.warn('follow_create_limit_reached_early', {
          userId: ctx.from.id,
          shopId: ctx.session.shopId,
          count: limit.count,
          limit: limit.limit,
        });
        return ctx.scene.leave();
      }
    } catch (error) {
      logger.error('Error checking follow limit at start:', error);
      // Continue anyway - backend will catch it during creation
    }

    await smartMessage.send(ctx, {
      text: followMessages.createEnterId,
      keyboard: cancelButton,
    });

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterShopId step:', error);
    throw error;
  }
};

// Step 2: Validate shop ID and ask mode
const selectMode = async (ctx) => {
  try {
    // Get shop ID from message
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, { text: followMessages.createEnterId });
      return;
    }

    // Check token first
    if (!ctx.session.token) {
      await ctx.reply(generalMessages.authorizationRequired, successButtons);
      return ctx.scene.leave();
    }

    // FIX BUG #4 & #1: Track user message for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    const sourceShopId = parseInt(ctx.message.text.trim(), 10);

    if (Number.isNaN(sourceShopId) || sourceShopId <= 0) {
      await smartMessage.send(ctx, {
        text: followMessages.createIdInvalid,
        keyboard: cancelButton,
      });
      return;
    }

    try {
      await shopApi.getShop(sourceShopId);
    } catch (error) {
      if (error.response?.status === 404) {
        await smartMessage.send(ctx, {
          text: followMessages.createShopNotFound,
          keyboard: cancelButton,
        });
      } else {
        logger.error('Error checking shop existence:', error);
        await smartMessage.send(ctx, {
          text: followMessages.createCheckError,
          keyboard: cancelButton,
        });
      }
      return;
    }

    if (sourceShopId === ctx.session.shopId) {
      await smartMessage.send(ctx, {
        text: followMessages.createSelfFollow,
        keyboard: successButtons,
      });
      return ctx.scene.leave();
    }

    // P1-BOT-004 FIX: Check circular dependency BEFORE creating follow
    try {
      const validation = await followApi.validateCircular(
        ctx.session.shopId,
        sourceShopId,
        ctx.session.token
      );
      if (!validation.valid) {
        logger.warn('Circular dependency detected', {
          userId: ctx.from.id,
          followerShopId: ctx.session.shopId,
          sourceShopId,
        });
        await smartMessage.send(ctx, {
          text: followMessages.createCircularDetailed,
          keyboard: successButtons,
        });
        return ctx.scene.leave();
      }
    } catch (error) {
      // If validation fails, log but continue (backend will catch it anyway)
      logger.error('Error validating circular dependency:', error);
    }

    // NOTE: Follow limit is now checked early in enterShopId step (P1-BOT-018)
    // No need to check again here

    ctx.wizard.state.sourceShopId = sourceShopId;

    logger.info('follow_create_step:mode', {
      userId: ctx.from.id,
      sourceShopId: sourceShopId,
    });

    // Get source shop name
    let sourceShopName = 'Магазин';
    try {
      const shopData = await shopApi.getShop(sourceShopId);
      sourceShopName = shopData.name || 'Магазин';
    } catch (error) {
      logger.error('Error fetching shop name:', error);
    }

    const message = followMessages.createModePromptDetailed(sourceShopName);
    await cleanReply(
      ctx,
      message,
      Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Мониторинг', 'mode:monitor')],
        [Markup.button.callback('💰 Перепродажа', 'mode:resell')],
        [Markup.button.callback('❌ Отмена', 'cancel_scene')],
      ])
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in selectMode step:', error);
    throw error;
  }
};

// Step 3: Handle mode selection
const handleModeSelection = async (ctx) => {
  try {
    if (!ctx.callbackQuery) {
      await smartMessage.send(ctx, { text: followMessages.createModePrompt });
      return;
    }

    await ctx.answerCbQuery();

    const mode = ctx.callbackQuery.data.replace('mode:', '');
    ctx.wizard.state.mode = mode;

    logger.info('follow_create_step:mode_selected', {
      userId: ctx.from.id,
      mode: mode,
    });

    if (mode === 'monitor') {
      // Create follow immediately for monitor mode
      try {
        await ctx.editMessageText(followMessages.createSaving);

        await followApi.createFollow(
          {
            followerShopId: ctx.session.shopId,
            sourceShopId: ctx.wizard.state.sourceShopId,
            mode: 'monitor',
          },
          ctx.session.token
        );

        logger.info('follow_created', {
          userId: ctx.from.id,
          mode: 'monitor',
          sourceShopId: ctx.wizard.state.sourceShopId,
        });

        await ctx.editMessageText(followMessages.createMonitorSuccess, successButtons);
        return ctx.scene.leave();
      } catch (error) {
        logger.error('Error creating follow:', error);

        if (error.response?.status === 402) {
          await ctx.editMessageText(followMessages.limitReachedBasicToPro, successButtons);
        } else if (error.response?.status === 400) {
          const errorMsg = error.response?.data?.error || '';
          const errorLower = errorMsg.toLowerCase();
          if (errorLower.includes('circular')) {
            await ctx.editMessageText(followMessages.createCircular, successButtons);
          } else if (errorLower.includes('already exists')) {
            await ctx.editMessageText(followMessages.createExists, successButtons);
          } else {
            await ctx.editMessageText(followMessages.createError, successButtons);
          }
        } else {
          await ctx.editMessageText(followMessages.createError, successButtons);
        }

        return ctx.scene.leave();
      }
    } else {
      // Ask for markup for resell mode
      await ctx.editMessageText(followMessages.markupPrompt);
      return ctx.wizard.next();
    }
  } catch (error) {
    logger.error('Error in handleModeSelection step:', error);
    throw error;
  }
};

// Step 4: Handle markup input (only for resell mode)
const handleMarkup = async (ctx) => {
  try {
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, { text: followMessages.createResellPrompt });
      return;
    }

    // FIX BUG #1: Track user message for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    const markupText = ctx.message.text.trim().replace(',', '.');
    const markup = parseFloat(markupText);

    if (isNaN(markup) || markup < 1 || markup > 500) {
      await smartMessage.send(ctx, { text: followMessages.createMarkupInvalid });
      return;
    }

    logger.info('follow_create_step:markup', {
      userId: ctx.from.id,
      markup: markup,
    });

    // Validate session
    if (!ctx.session.shopId) {
      logger.error('No shopId in session when creating follow', {
        userId: ctx.from.id,
        session: ctx.session,
      });
      await smartMessage.send(ctx, {
        text: generalMessages.shopRequired,
        keyboard: successButtons,
      });
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      logger.error('Missing auth token when creating follow', {
        userId: ctx.from.id,
        session: ctx.session,
      });
      await ctx.reply(generalMessages.authorizationRequired, successButtons);
      return await ctx.scene.leave();
    }

    // Create follow with markup
    try {
      await smartMessage.send(ctx, { text: followMessages.createSaving });

      await followApi.createFollow(
        {
          followerShopId: ctx.session.shopId,
          sourceShopId: ctx.wizard.state.sourceShopId,
          mode: 'resell',
          markupPercentage: markup,
        },
        ctx.session.token
      );

      logger.info('follow_created', {
        userId: ctx.from.id,
        mode: 'resell',
        sourceShopId: ctx.wizard.state.sourceShopId,
        markup: markup,
      });

      await smartMessage.send(ctx, {
        text: `✅ Подписка создана (Resell)\n\nНаценка: +${markup}%`,
        keyboard: successButtons,
      });
      return ctx.scene.leave();
    } catch (error) {
      logger.error('Error creating follow:', error);

      if (error.response?.status === 402) {
        await smartMessage.send(ctx, {
          text: followMessages.limitReachedBasicToPro,
          keyboard: successButtons,
        });
      } else if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || '';
        const errorLower = errorMsg.toLowerCase();
        if (errorLower.includes('circular')) {
          await smartMessage.send(ctx, {
            text: followMessages.createCircularDetailed,
            keyboard: successButtons,
          });
        } else if (errorLower.includes('already exists')) {
          await smartMessage.send(ctx, {
            text: followMessages.createExists,
            keyboard: successButtons,
          });
        } else {
          await smartMessage.send(ctx, {
            text: followMessages.createError,
            keyboard: successButtons,
          });
        }
      } else {
        await smartMessage.send(ctx, {
          text: followMessages.createError,
          keyboard: successButtons,
        });
      }

      return ctx.scene.leave();
    }
  } catch (error) {
    logger.error('Error in handleMarkup step:', error);
    await smartMessage.send(ctx, {
      text: followMessages.createError,
      keyboard: successButtons,
    });
    return ctx.scene.leave();
  }
};

// Create wizard scene
const createFollowScene = new Scenes.WizardScene(
  'createFollow',
  enterShopId,
  selectMode,
  handleModeSelection,
  handleMarkup
);

// Handle scene leave
createFollowScene.leave(async (ctx) => {
  // FIX BUG #1 & #4: Delete user messages (shop ID, markup inputs)
  const userMsgIds = ctx.wizard?.state?.userMessageIds || [];
  for (const msgId of userMsgIds) {
    try {
      await ctx.deleteMessage(msgId);
    } catch (error) {
      // Message may already be deleted or too old
      logger.debug(`Could not delete user message ${msgId}:`, error.message);
    }
  }

  // ✅ P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};
  logger.info(`User ${ctx.from?.id} left createFollow scene`);
});

// Handle cancel command
createFollowScene.command('cancel', async (ctx) => {
  try {
    logger.info('follow_create_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    // Silent transition - show menu without "Отменено" text
    await smartMessage.send(ctx, {
      text: followMessages.createCancelled,
      keyboard: successButtons,
    });
  } catch (error) {
    logger.error('Error in cancel command handler:', error);
    // Local error handling
    try {
      await smartMessage.send(ctx, {
        text: followMessages.cancelOperationError,
        keyboard: successButtons,
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

// Handle cancel action within scene
createFollowScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery(); // Silent
    logger.info('follow_create_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    
    const { showSellerToolsMenu } = await import('../utils/sellerNavigation.js');
    await showSellerToolsMenu(ctx);
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling
    try {
       await ctx.reply(generalMessages.actionFailed);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default createFollowScene;
