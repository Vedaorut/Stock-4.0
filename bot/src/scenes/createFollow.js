import { Scenes, Markup } from 'telegraf';
import { successButtons, cancelButton } from '../keyboards/common.js';
import { followApi, shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as messageCleanup from '../utils/messageCleanup.js';
import * as smartMessage from '../utils/smartMessage.js';

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

    // FIX BUG #4: Clear prompt - ID only (not name)
    await smartMessage.send(ctx, {
      text: 'ID магазина для подписки:\n\n(Получите ID через поиск магазина)',
      keyboard: cancelButton
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
      await smartMessage.send(ctx, { text: 'Отправьте ID магазина' });
      return;
    }

    // Check token first
    if (!ctx.session.token) {
      await smartMessage.send(ctx, { text: 'Ошибка авторизации', keyboard: successButtons });
      return ctx.scene.leave();
    }

    // FIX BUG #4 & #1: Track user message for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    const sourceShopId = parseInt(ctx.message.text.trim());

    if (isNaN(sourceShopId) || sourceShopId <= 0) {
      // FIX BUG #4: Show error with navigation + exit scene
      await smartMessage.send(ctx, {
        text: '❌ Введите число (ID магазина)\n\nПример: 123',
        keyboard: { inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'cancel_scene' }]] }
      });
      return await ctx.scene.leave();
    }

    // Check if shop exists
    try {
      await shopApi.getShop(sourceShopId);
    } catch (error) {
      // FIX BUG #4: Show error with navigation + exit scene
      if (error.response?.status === 404) {
        await smartMessage.send(ctx, {
          text: '❌ Магазин не найден',
          keyboard: { inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'cancel_scene' }]] }
        });
      } else {
        logger.error('Error checking shop existence:', error);
        await smartMessage.send(ctx, {
          text: '❌ Ошибка проверки магазина',
          keyboard: { inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'cancel_scene' }]] }
        });
      }
      return await ctx.scene.leave();
    }

    // Check self-follow
    if (sourceShopId === ctx.session.shopId) {
      await smartMessage.send(ctx, { text: 'Нельзя подписаться на свой магазин', keyboard: successButtons });
      return ctx.scene.leave();
    }

    // Check FREE limit
    try {
      const limit = await followApi.checkFollowLimit(ctx.session.shopId, ctx.session.token);
      if (limit.reached) {
        await smartMessage.send(ctx, {
          text: `Лимит достигнут (${limit.count}/${limit.limit})\n\nНужен PRO ($35/мес)`,
          keyboard: successButtons
        });
        return ctx.scene.leave();
      }
    } catch (error) {
      logger.error('Error checking follow limit:', error);
      // Continue anyway - backend will validate
    }

    ctx.wizard.state.sourceShopId = sourceShopId;

    logger.info('follow_create_step:mode', {
      userId: ctx.from.id,
      sourceShopId: sourceShopId
    });

    await ctx.reply(
      'Режим:',
      Markup.inlineKeyboard([
        [Markup.button.callback('👀 Monitor', 'mode:monitor')],
        [Markup.button.callback('💰 Resell', 'mode:resell')],
        [Markup.button.callback('◀️ Назад', 'cancel_scene')]
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
      await smartMessage.send(ctx, { text: 'Выберите режим кнопками' });
      return;
    }

    await ctx.answerCbQuery();

    const mode = ctx.callbackQuery.data.replace('mode:', '');
    ctx.wizard.state.mode = mode;

    logger.info('follow_create_step:mode_selected', {
      userId: ctx.from.id,
      mode: mode
    });

    if (mode === 'monitor') {
      // Create follow immediately for monitor mode
      try {
        await ctx.editMessageText('Сохраняем...');

        await followApi.createFollow({
          followerShopId: ctx.session.shopId,
          sourceShopId: ctx.wizard.state.sourceShopId,
          mode: 'monitor'
        }, ctx.session.token);

        logger.info('follow_created', {
          userId: ctx.from.id,
          mode: 'monitor',
          sourceShopId: ctx.wizard.state.sourceShopId
        });

        await ctx.editMessageText('✅ Подписка создана (Monitor)', successButtons);
        return ctx.scene.leave();
      } catch (error) {
        logger.error('Error creating follow:', error);

        if (error.response?.status === 402) {
          await ctx.editMessageText(
            'Лимит достигнут\n\nНужен PRO ($35/мес)',
            successButtons
          );
        } else if (error.response?.status === 400) {
          const errorMsg = error.response?.data?.error || '';
          const errorLower = errorMsg.toLowerCase();
          if (errorLower.includes('circular')) {
            await ctx.editMessageText('Ошибка: циклическая подписка', successButtons);
          } else if (errorLower.includes('already exists')) {
            await ctx.editMessageText('Подписка уже существует', successButtons);
          } else {
            await ctx.editMessageText('Ошибка создания', successButtons);
          }
        } else {
          await ctx.editMessageText('Ошибка создания', successButtons);
        }

        return ctx.scene.leave();
      }
    } else {
      // Ask for markup for resell mode
      await ctx.editMessageText('Новая наценка (%):\n\n1-500');
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
      await smartMessage.send(ctx, { text: 'Отправьте процент наценки' });
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
      await smartMessage.send(ctx, { text: 'Наценка должна быть 1-500%' });
      return;
    }

    logger.info('follow_create_step:markup', {
      userId: ctx.from.id,
      markup: markup
    });

    // Validate session
    if (!ctx.session.shopId) {
      logger.error('No shopId in session when creating follow', {
        userId: ctx.from.id,
        session: ctx.session
      });
      await smartMessage.send(ctx, {
        text: 'Ошибка: магазин не найден\n\nСначала создайте магазин',
        keyboard: successButtons
      });
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      logger.error('Missing auth token when creating follow', {
        userId: ctx.from.id,
        session: ctx.session
      });
      await smartMessage.send(ctx, {
        text: 'Ошибка авторизации. Попробуйте снова через главное меню',
        keyboard: successButtons
      });
      return await ctx.scene.leave();
    }

    // Create follow with markup
    try {
      await smartMessage.send(ctx, { text: 'Сохраняем...' });

      await followApi.createFollow({
        followerShopId: ctx.session.shopId,
        sourceShopId: ctx.wizard.state.sourceShopId,
        mode: 'resell',
        markupPercentage: markup
      }, ctx.session.token);

      logger.info('follow_created', {
        userId: ctx.from.id,
        mode: 'resell',
        sourceShopId: ctx.wizard.state.sourceShopId,
        markup: markup
      });

      await smartMessage.send(ctx, {
        text: `✅ Подписка создана (Resell)\n\nНаценка: +${markup}%`,
        keyboard: successButtons
      });
      return ctx.scene.leave();
    } catch (error) {
      logger.error('Error creating follow:', error);

      if (error.response?.status === 402) {
        await smartMessage.send(ctx, { text: 'Лимит достигнут\n\nНужен PRO ($35/мес)', keyboard: successButtons });
      } else if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || '';
        const errorLower = errorMsg.toLowerCase();
        if (errorLower.includes('circular')) {
          await smartMessage.send(ctx, { text: 'Ошибка: циклическая подписка', keyboard: successButtons });
        } else if (errorLower.includes('already exists')) {
          await smartMessage.send(ctx, { text: 'Подписка уже существует', keyboard: successButtons });
        } else {
          await smartMessage.send(ctx, { text: 'Ошибка создания', keyboard: successButtons });
        }
      } else {
        await smartMessage.send(ctx, { text: 'Ошибка создания', keyboard: successButtons });
      }

      return ctx.scene.leave();
    }
  } catch (error) {
    logger.error('Error in handleMarkup step:', error);
    await smartMessage.send(ctx, {
      text: 'Ошибка. Попробуйте позже',
      keyboard: successButtons
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
  const userMsgIds = ctx.wizard.state.userMessageIds || [];
  for (const msgId of userMsgIds) {
    try {
      await ctx.deleteMessage(msgId);
    } catch (error) {
      // Message may already be deleted or too old
      logger.debug(`Could not delete user message ${msgId}:`, error.message);
    }
  }

  // Cleanup wizard messages (keep final message)
  await messageCleanup.cleanupWizard(ctx, {
    keepFinalMessage: true,
    keepWelcome: true
  });

  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left createFollow scene`);
});

// Handle cancel command
createFollowScene.command('cancel', async (ctx) => {
  try {
    logger.info('follow_create_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await smartMessage.send(ctx, { text: 'Отменено', keyboard: successButtons });
  } catch (error) {
    logger.error('Error in cancel command handler:', error);
    // Local error handling
    try {
      await smartMessage.send(ctx, { text: 'Произошла ошибка при отмене\n\nПопробуйте позже', keyboard: successButtons });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

// Handle cancel action within scene
createFollowScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('follow_create_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await ctx.editMessageText('Отменено', successButtons);
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка при отмене\n\nПопробуйте позже',
        successButtons
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default createFollowScene;
