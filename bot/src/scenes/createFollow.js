import { Scenes, Markup } from 'telegraf';
import { successButtons, cancelButton } from '../keyboards/common.js';
import { followApi, shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as _cleanReply } from '../utils/cleanReply.js';
import { getMessages } from '../texts/messages.js';

/**
 * Create Follow Scene - Multi-step wizard
 * Steps:
 * 1. Enter source shop ID
 * 2. Validate shop and select mode (monitor/resell)
 * 3. If resell: enter markup percentage
 * 4. Complete
 */

// Step 1: Enter source shop name
const enterShopName = async (ctx) => {
  try {
    logger.info('follow_create_step:shop_name', { userId: ctx.from.id });

    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMessages, follows: followMessages } = getMessages(lang);

    // Check token first
    if (!ctx.session.token) {
      await ctx.reply(generalMessages.authorizationRequired, successButtons(lang));
      return ctx.scene.leave();
    }

    // FIX P1-BOT-018: Check follow limit EARLY before user enters shop ID
    // This provides better UX - show limit error immediately instead of after user fills in details
    try {
      const limit = await followApi.checkFollowLimit(ctx.session.shopId, ctx.session.token);
      if (limit.reached) {
        await smartMessage.send(ctx, {
          text: followMessages.createLimitReached(limit.count, limit.limit, lang),
          keyboard: successButtons(lang),
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
      text: followMessages.createEnterName,
      keyboard: cancelButton(lang),
    });

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterShopId step:', error);
    throw error;
  }
};

// Step 2: Show search results
const showSearchResults = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMessages, follows: followMessages } = getMessages(lang);

    // Get shop name from message
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, {
        text: ctx.t('scenes.sendTextMessage') + '\n\n' + followMessages.createEnterName,
      });
      return;
    }

    // Check token first
    if (!ctx.session.token) {
      await ctx.reply(generalMessages.authorizationRequired, successButtons(lang));
      return ctx.scene.leave();
    }

    // FIX BUG #4 & #1: Track user message for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    const query = ctx.message.text.trim();

    // Validate query length
    if (query.length < 2) {
      await smartMessage.send(ctx, {
        text: followMessages.createQueryTooShort,
        keyboard: cancelButton(lang),
      });
      return;
    }

    // Show searching message
    await smartMessage.send(ctx, { text: followMessages.createSearching });

    // Search shops
    let shops = [];
    try {
      // shopApi.searchShops already returns array (unwraps data.data)
      shops = await shopApi.searchShops(query, ctx.session.token);
    } catch (error) {
      logger.error('Error searching shops:', error);
      await smartMessage.send(ctx, {
        text: followMessages.createSearchError,
        keyboard: successButtons(lang),
      });
      return ctx.scene.leave();
    }

    // Filter out own shop
    const filteredShops = shops.filter((shop) => shop.id !== ctx.session.shopId);

    if (filteredShops.length === 0) {
      if (shops.length > 0) {
        // Only own shop found
        await smartMessage.send(ctx, {
          text: followMessages.createOnlyOwnShop,
          keyboard: successButtons(lang),
        });
      } else {
        // No shops found
        await smartMessage.send(ctx, {
          text: followMessages.createNoResults,
          keyboard: cancelButton(lang),
        });
      }
      return ctx.scene.leave();
    }

    // Store search results
    ctx.wizard.state.searchResults = filteredShops;

    // Create buttons (max 10 shops)
    const buttons = filteredShops.slice(0, 10).map((shop) => [
      Markup.button.callback(shop.name, `select_shop:${shop.id}`),
    ]);
    buttons.push([Markup.button.callback(ctx.t('buttons.cancel'), 'cancel_scene')]);

    await smartMessage.send(ctx, {
      text: followMessages.createSelectShop(filteredShops.length, lang),
      keyboard: Markup.inlineKeyboard(buttons),
    });

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in showSearchResults step:', error);
    throw error;
  }
};

// Step 3: Validate shop ID and ask mode
const selectMode = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMessages, follows: followMessages } = getMessages(lang);

    // Get shop ID from callback query
    if (!ctx.callbackQuery || !ctx.callbackQuery.data) {
      await smartMessage.send(ctx, {
        text: ctx.t('follows.selectShopPrompt'),
      });
      return;
    }

    await ctx.answerCbQuery();

    // Check token first
    if (!ctx.session.token) {
      await ctx.reply(generalMessages.authorizationRequired, successButtons(lang));
      return ctx.scene.leave();
    }

    // Extract shop ID from callback data
    const sourceShopId = parseInt(ctx.callbackQuery.data.replace('select_shop:', ''), 10);

    if (Number.isNaN(sourceShopId) || sourceShopId <= 0) {
      await ctx.editMessageText(followMessages.createIdInvalid, successButtons(lang));
      return ctx.scene.leave();
    }

    // Verify shop still exists
    try {
      await shopApi.getShop(sourceShopId, ctx.session.token);
    } catch (error) {
      if (error.response?.status === 404) {
        await ctx.editMessageText(followMessages.createShopNotFound, successButtons(lang));
      } else {
        logger.error('Error checking shop existence:', error);
        await ctx.editMessageText(followMessages.createCheckError, successButtons(lang));
      }
      return ctx.scene.leave();
    }

    if (sourceShopId === ctx.session.shopId) {
      await ctx.editMessageText(followMessages.createSelfFollow, successButtons(lang));
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
        await ctx.editMessageText(followMessages.createCircularDetailed, successButtons(lang));
        return ctx.scene.leave();
      }
    } catch (error) {
      // If validation fails, log but continue (backend will catch it anyway)
      logger.error('Error validating circular dependency:', error);
    }

    // NOTE: Follow limit is now checked early in enterShopName step (P1-BOT-018)
    // No need to check again here

    ctx.wizard.state.sourceShopId = sourceShopId;

    logger.info('follow_create_step:mode', {
      userId: ctx.from.id,
      sourceShopId: sourceShopId,
    });

    // Get source shop name
    let sourceShopName = ctx.t('formatters.followShop');
    try {
      const shopData = await shopApi.getShop(sourceShopId);
      sourceShopName = shopData.name || ctx.t('formatters.followShop');
    } catch (error) {
      logger.error('Error fetching shop name:', error);
    }

    const message = followMessages.createModePromptDetailed(sourceShopName, lang);
    await ctx.editMessageText(
      message,
      Markup.inlineKeyboard([
        [Markup.button.callback(ctx.t('buttons.modeMonitor'), 'mode:monitor')],
        [Markup.button.callback(ctx.t('buttons.modeResell'), 'mode:resell')],
        [Markup.button.callback(ctx.t('buttons.cancel'), 'cancel_scene')],
      ])
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in selectMode step:', error);
    throw error;
  }
};

// Step 4: Handle mode selection
const handleModeSelection = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { follows: followMessages } = getMessages(lang);

    if (!ctx.callbackQuery) {
      await smartMessage.send(ctx, {
        text: ctx.t('follows.selectModePrompt') + '\n\n' + followMessages.createModePrompt,
      });
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

        await ctx.editMessageText(followMessages.createMonitorSuccess, successButtons(lang));
        return ctx.scene.leave();
      } catch (error) {
        logger.error('Error creating follow:', error);

        if (error.response?.status === 402) {
          await ctx.editMessageText(followMessages.limitReachedBasicToPro, successButtons(lang));
        } else if (error.response?.status === 400) {
          const errorMsg = error.response?.data?.error || '';
          const errorLower = errorMsg.toLowerCase();
          if (errorLower.includes('circular')) {
            await ctx.editMessageText(followMessages.createCircular, successButtons(lang));
          } else if (errorLower.includes('already exists')) {
            await ctx.editMessageText(followMessages.createExists, successButtons(lang));
          } else {
            await ctx.editMessageText(followMessages.createError, successButtons(lang));
          }
        } else {
          await ctx.editMessageText(followMessages.createError, successButtons(lang));
        }

        return ctx.scene.leave();
      }
    } else {
      // Ask for markup for resell mode
      await ctx.editMessageText(
        followMessages.markupPrompt,
        Markup.inlineKeyboard([[Markup.button.callback(ctx.t('buttons.cancel'), 'cancel_scene')]])
      );
      return ctx.wizard.next();
    }
  } catch (error) {
    logger.error('Error in handleModeSelection step:', error);
    throw error;
  }
};

// Step 5: Handle markup input (only for resell mode)
const handleMarkup = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMessages, follows: followMessages } = getMessages(lang);

    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, {
        text: ctx.t('follows.enterMarkupPrompt') + '\n\n' + followMessages.createResellPrompt,
        keyboard: cancelButton(lang),
      });
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
      await smartMessage.send(ctx, {
        text: followMessages.createMarkupInvalid,
        keyboard: cancelButton(lang),
      });
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
        keyboard: successButtons(lang),
      });
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      logger.error('Missing auth token when creating follow', {
        userId: ctx.from.id,
        session: ctx.session,
      });
      await ctx.reply(generalMessages.authorizationRequired, successButtons(lang));
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
        text: ctx.t('follows.createResellSuccess', { markup }),
        keyboard: successButtons(lang),
      });
      return ctx.scene.leave();
    } catch (error) {
      logger.error('Error creating follow:', error);

      if (error.response?.status === 402) {
        await smartMessage.send(ctx, {
          text: followMessages.limitReachedBasicToPro,
          keyboard: successButtons(lang),
        });
      } else if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || '';
        const errorLower = errorMsg.toLowerCase();
        if (errorLower.includes('circular')) {
          await smartMessage.send(ctx, {
            text: followMessages.createCircularDetailed,
            keyboard: successButtons(lang),
          });
        } else if (errorLower.includes('already exists')) {
          await smartMessage.send(ctx, {
            text: followMessages.createExists,
            keyboard: successButtons(lang),
          });
        } else {
          await smartMessage.send(ctx, {
            text: followMessages.createError,
            keyboard: successButtons(lang),
          });
        }
      } else {
        await smartMessage.send(ctx, {
          text: followMessages.createError,
          keyboard: successButtons(lang),
        });
      }

      return ctx.scene.leave();
    }
  } catch (error) {
    logger.error('Error in handleMarkup step:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    const { follows: followMsgs } = getMessages(langErr);
    await smartMessage.send(ctx, {
      text: followMsgs.createError,
      keyboard: successButtons(langErr),
    });
    return ctx.scene.leave();
  }
};

// Create wizard scene
const createFollowScene = new Scenes.WizardScene(
  'createFollow',
  enterShopName,
  showSearchResults,
  selectMode,
  handleModeSelection,
  handleMarkup
);

// Add action handler for shop selection
createFollowScene.action(/^select_shop:(\d+)$/, async (ctx) => {
  await ctx.wizard.steps[ctx.wizard.cursor](ctx);
});

// Add action handler for mode selection (monitor/resell)
createFollowScene.action(/^mode:(monitor|resell)$/, async (ctx) => {
  if (!ctx.wizard || !ctx.wizard.steps) {
    await ctx.answerCbQuery();
    await ctx.reply(ctx.t('general.errorOccurred'));
    return ctx.scene.leave();
  }
  await ctx.wizard.steps[ctx.wizard.cursor](ctx);
});

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

  // P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};

  // Clear __scenes from Redis session to prevent getting stuck
  if (ctx.session && ctx.session.__scenes) {
    delete ctx.session.__scenes;
  }

  logger.info(`User ${ctx.from?.id} left createFollow scene`);
});

// Handle cancel command
createFollowScene.command('cancel', async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { follows: followMessages } = getMessages(lang);

    logger.info('follow_create_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    // Silent transition - show menu without "Cancelled" text
    await smartMessage.send(ctx, {
      text: followMessages.createCancelled,
      keyboard: successButtons(lang),
    });
  } catch (error) {
    logger.error('Error in cancel command handler:', error);
    // Local error handling
    try {
      const lang = ctx.lang || ctx.session?.language || 'ru';
      const { follows: followMessages } = getMessages(lang);
      await smartMessage.send(ctx, {
        text: followMessages.cancelOperationError,
        keyboard: successButtons(lang),
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
      const lang = ctx.lang || ctx.session?.language || 'ru';
      const { general: generalMessages } = getMessages(lang);
      await ctx.reply(generalMessages.actionFailed);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

// Also handle 'cancel' action (some buttons use this)
createFollowScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('follow_create_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();

    const { showSellerToolsMenu } = await import('../utils/sellerNavigation.js');
    await showSellerToolsMenu(ctx);
  } catch (error) {
    logger.error('Error in cancel handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

// Handle "Back" button that returns to seller menu
createFollowScene.action('seller:menu', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('follow_create_back_to_menu', { userId: ctx.from.id });
    await ctx.scene.leave();

    const { showSellerMainMenu } = await import('../utils/sellerNavigation.js');
    await showSellerMainMenu(ctx);
  } catch (error) {
    logger.error('Error in seller:menu handler:', error);
    try {
      const lang = ctx.lang || ctx.session?.language || 'ru';
      const { general: generalMessages } = getMessages(lang);
      await ctx.reply(generalMessages.actionFailed);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default createFollowScene;
