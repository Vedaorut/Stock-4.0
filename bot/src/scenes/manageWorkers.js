import { Scenes } from 'telegraf';
import { manageWorkersMenu, confirmWorkerRemoval } from '../keyboards/workspace.js';
import { cancelButton } from '../keyboards/common.js';
import { workerApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as messageCleanup from '../utils/messageCleanup.js';
import * as smartMessage from '../utils/smartMessage.js';

/**
 * Manage Workers Scene - Add/Remove workers
 * Owner can add workers by Telegram ID
 */

// Step 1: Ask for Telegram ID
const enterTelegramId = async (ctx) => {
  try {
    logger.info('manage_workers_step:telegram_id', { userId: ctx.from.id });

    await smartMessage.send(ctx, {
      text: 'Telegram ID работника:\n\n(число, например: 123456789)',
      keyboard: cancelButton
    });

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterTelegramId step:', error);
    throw error;
  }
};

// Step 2: Confirm and add worker
const confirmAndAdd = async (ctx) => {
  try {
    // Get Telegram ID from message
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, { text: 'Отправьте Telegram ID' });
      return;
    }

    const input = ctx.message.text.trim();
    const telegramId = parseInt(input, 10);

    if (isNaN(telegramId) || telegramId <= 0) {
      await smartMessage.send(ctx, { text: '❌ Неверный формат\n\nTelegram ID - число больше 0\n\nПример: 123456789' });
      return;
    }

    ctx.wizard.state.telegramId = telegramId;

    logger.info('manage_workers_step:confirm', {
      userId: ctx.from.id,
      telegramId
    });

    // Validate shopId exists
    if (!ctx.session.shopId) {
      logger.error('No shopId in session when adding worker', {
        userId: ctx.from.id,
        session: ctx.session
      });
      await smartMessage.send(ctx, {
        text: 'Ошибка: магазин не найден\n\nСначала откройте магазин',
        keyboard: manageWorkersMenu(ctx.session.shopName)
      });
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      logger.error('Missing auth token when adding worker', {
        userId: ctx.from.id,
        session: ctx.session
      });
      await smartMessage.send(ctx, {
        text: 'Ошибка авторизации. Попробуйте снова через главное меню',
        keyboard: manageWorkersMenu(ctx.session.shopName)
      });
      return await ctx.scene.leave();
    }

    // Add worker via backend
    await smartMessage.send(ctx, { text: 'Добавляем...' });

    try {
      const worker = await workerApi.addWorker(
        ctx.session.shopId,
        { telegram_id: telegramId },
        ctx.session.token
      );

      logger.info('worker_added', {
        workerId: worker.id,
        telegramId,
        shopId: ctx.session.shopId,
        addedBy: ctx.from.id
      });

      const workerName = worker.username ? `@${worker.username}` : worker.first_name || `ID:${telegramId}`;

      await smartMessage.send(ctx, {
        text: `✅ Работник добавлен: ${workerName}\n\nТеперь они могут управлять продуктами в этом магазине.`,
        keyboard: manageWorkersMenu(ctx.session.shopName)
      });

    } catch (error) {
      logger.error('Error adding worker:', error);
      
      let errorMessage = 'Ошибка добавления работника';
      
      if (error.response?.data?.error) {
        const apiError = error.response.data.error;
        
        if (apiError.includes('not found') || apiError.includes('used the bot')) {
          errorMessage = '❌ Пользователь не найден\n\nУбедитесь, что он использовал бота хотя бы раз';
        } else if (apiError.includes('already a worker')) {
          errorMessage = 'ℹ️ Этот пользователь уже работник магазина';
        } else if (apiError.includes('owner cannot be added')) {
          errorMessage = '❌ Владелец не может быть добавлен как работник';
        } else {
          errorMessage = `❌ ${apiError}`;
        }
      }

      await smartMessage.send(ctx, {
        text: errorMessage,
        keyboard: manageWorkersMenu(ctx.session.shopName)
      });
    }

    // Leave scene
    return await ctx.scene.leave();

  } catch (error) {
    logger.error('Error in confirmAndAdd step:', error);
    await smartMessage.send(ctx, {
      text: 'Ошибка. Попробуйте позже',
      keyboard: manageWorkersMenu(ctx.session.shopName)
    });
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const manageWorkersScene = new Scenes.WizardScene(
  'manageWorkers',
  enterTelegramId,
  confirmAndAdd
);

// Handle scene leave
manageWorkersScene.leave(async (ctx) => {
  // Cleanup wizard messages (keep final message)
  await messageCleanup.cleanupWizard(ctx, {
    keepFinalMessage: true,
    keepWelcome: true
  });

  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left manageWorkers scene`);
});

// Handle cancel action within scene
manageWorkersScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('manage_workers_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await smartMessage.send(ctx, { text: 'Отменено', keyboard: manageWorkersMenu(ctx.session.shopName) });
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      await ctx.editMessageText(
        'Произошла ошибка при отмене\n\nПопробуйте позже',
        manageWorkersMenu(ctx.session.shopName)
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default manageWorkersScene;
