import { Scenes, Markup } from 'telegraf';
import { cancelButton, successButtons } from '../keyboards/common.js';
import { followApi, shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';

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

    await ctx.reply(
      'ID магазина для подписки:\n\n(отправьте /cancel для отмены)',
      Markup.removeKeyboard()
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterShopId step:', error);
    throw error;
  }
};

// Step 2: Validate shop ID and ask mode
const selectMode = async (ctx) => {
  try {
    // Check for /cancel command
    if (ctx.message?.text?.trim() === '/cancel') {
      await ctx.reply('Отменено', successButtons);
      return ctx.scene.leave();
    }

    // Get shop ID from message
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Отправьте ID магазина', cancelButton);
      return;
    }

    // Check token first
    if (!ctx.session.token) {
      await ctx.reply('Ошибка авторизации', cancelButton);
      return ctx.scene.leave();
    }

    const sourceShopId = parseInt(ctx.message.text.trim());

    if (isNaN(sourceShopId) || sourceShopId <= 0) {
      await ctx.reply('Невалидный ID', cancelButton);
      return;
    }

    // Check if shop exists
    try {
      await shopApi.getShop(sourceShopId);
    } catch (error) {
      if (error.response?.status === 404) {
        await ctx.reply('Магазин не найден', cancelButton);
      } else {
        logger.error('Error checking shop existence:', error);
        await ctx.reply('Ошибка проверки магазина', cancelButton);
      }
      return;
    }

    // Check self-follow
    if (sourceShopId === ctx.session.shopId) {
      await ctx.reply('Нельзя подписаться на свой магазин', successButtons);
      return ctx.scene.leave();
    }

    // Check FREE limit
    try {
      const limit = await followApi.checkFollowLimit(ctx.session.shopId, ctx.session.token);
      if (limit.reached) {
        await ctx.reply(
          `Лимит достигнут (${limit.count}/${limit.limit})\n\nНужен PRO ($35/мес)`,
          successButtons
        );
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
        [Markup.button.callback('« Отменить', 'cancel_scene')]
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
      await ctx.reply('Выберите режим кнопками');
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
    // Check for /cancel command
    if (ctx.message?.text?.trim() === '/cancel') {
      await ctx.reply('Отменено', successButtons);
      return ctx.scene.leave();
    }

    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Отправьте процент наценки', cancelButton);
      return;
    }

    const markupText = ctx.message.text.trim().replace(',', '.');
    const markup = parseFloat(markupText);

    if (isNaN(markup) || markup < 1 || markup > 500) {
      await ctx.reply('Наценка должна быть 1-500%', cancelButton);
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
      await ctx.reply(
        'Ошибка: магазин не найден\n\nСначала создайте магазин',
        successButtons
      );
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      logger.error('Missing auth token when creating follow', {
        userId: ctx.from.id,
        session: ctx.session
      });
      await ctx.reply(
        'Ошибка авторизации. Попробуйте снова через главное меню',
        successButtons
      );
      return await ctx.scene.leave();
    }

    // Create follow with markup
    try {
      await ctx.reply('Сохраняем...');

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

      await ctx.reply(`✅ Подписка создана (Resell)\n\nНаценка: +${markup}%`, successButtons);
      return ctx.scene.leave();
    } catch (error) {
      logger.error('Error creating follow:', error);

      if (error.response?.status === 402) {
        await ctx.reply('Лимит достигнут\n\nНужен PRO ($35/мес)', successButtons);
      } else if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || '';
        const errorLower = errorMsg.toLowerCase();
        if (errorLower.includes('circular')) {
          await ctx.reply('Ошибка: циклическая подписка', successButtons);
        } else if (errorLower.includes('already exists')) {
          await ctx.reply('Подписка уже существует', successButtons);
        } else {
          await ctx.reply('Ошибка создания', successButtons);
        }
      } else {
        await ctx.reply('Ошибка создания', successButtons);
      }

      return ctx.scene.leave();
    }
  } catch (error) {
    logger.error('Error in handleMarkup step:', error);
    await ctx.reply(
      'Ошибка. Попробуйте позже',
      successButtons
    );
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
  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left createFollow scene`);
});

// Handle cancel command
createFollowScene.command('cancel', async (ctx) => {
  try {
    logger.info('follow_create_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await ctx.reply('Отменено', successButtons);
  } catch (error) {
    logger.error('Error in cancel command handler:', error);
    // Local error handling
    try {
      await ctx.reply('Произошла ошибка при отмене\n\nПопробуйте позже', successButtons);
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
