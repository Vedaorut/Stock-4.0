import { Scenes } from 'telegraf';
import { manageWorkersMenu } from '../keyboards/workspace.js';
import { cancelButton } from '../keyboards/common.js';
import { workerApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { messages } from '../texts/messages.js';
import { showSellerToolsMenu } from '../utils/sellerNavigation.js';

const { seller: sellerMessages, general: generalMessages } = messages;

/**
 * Manage Workers Scene - Add/Remove workers
 * Owner can add workers by Telegram ID
 */

// Step 1: Ask for Telegram ID
const enterTelegramId = async (ctx) => {
  try {
    logger.info('manage_workers_step:telegram_id', { userId: ctx.from.id });

    // Show context + prompt
    const message = `${sellerMessages.workersContext}\n\n${sellerMessages.workerPrompt}`;

    await smartMessage.send(ctx, {
      text: message,
      keyboard: cancelButton,
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
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, {
        text: 'Пожалуйста, отправьте Telegram ID или @username текстом.\n\n' + sellerMessages.workerPrompt,
      });
      return;
    }

    const input = ctx.message.text.trim();
    let telegramId = null;
    let usernameInput = null;

    if (input.startsWith('@')) {
      usernameInput = input.slice(1).trim();

      // P1-BOT-005 FIX: Stronger username validation
      // Telegram usernames: 5-32 chars, alphanumeric + underscore only
      const usernameRegex = /^[a-zA-Z0-9_]{5,32}$/;
      if (!usernameInput || !usernameRegex.test(usernameInput)) {
        await smartMessage.send(ctx, {
          text: '❌ Некорректный username.\n\nUsername должен:\n• Длина 5-32 символа\n• Только буквы, цифры и _\n\nПример: @john_doe',
        });
        return;
      }

      try {
        const chat = await ctx.telegram.getChat(input);
        if (!chat || !chat.id) {
          await smartMessage.send(ctx, { text: sellerMessages.workerAddNotFound });
          return;
        }
        telegramId = chat.id;
        if (!usernameInput && chat.username) {
          usernameInput = chat.username;
        }
        logger.info('manage_workers_lookup_username', {
          requester: ctx.from.id,
          lookup: input,
          resolvedId: telegramId,
        });
      } catch (lookupError) {
        // FALLBACK: getChat не сработал - отправим username на backend для поиска в БД
        logger.info('manage_workers_username_fallback', {
          requester: ctx.from.id,
          username: usernameInput,
          reason: lookupError.message,
        });
        telegramId = null; // Backend будет искать только по username
      }
    } else if (/^\d+$/.test(input)) {
      telegramId = Number.parseInt(input, 10);
      if (!Number.isFinite(telegramId) || telegramId <= 0) {
        await smartMessage.send(ctx, { text: sellerMessages.workerIdInvalid });
        return;
      }
    } else {
      await smartMessage.send(ctx, { text: sellerMessages.workerIdInvalid });
      return;
    }

    ctx.wizard.state.telegramId = telegramId;

    // Если нет ни telegramId, ни username - это ошибка
    if (!telegramId && !usernameInput) {
      await smartMessage.send(ctx, { text: sellerMessages.workerAddNotFound });
      return;
    }

    logger.info('manage_workers_step:confirm', {
      userId: ctx.from.id,
      telegramId,
      username: usernameInput || null,
    });

    if (!ctx.session.shopId) {
      logger.error('No shopId in session when adding worker', {
        userId: ctx.from.id,
        session: ctx.session,
      });
      await smartMessage.send(ctx, {
        text: generalMessages.shopRequired,
        keyboard: manageWorkersMenu(),
      });
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      logger.error('Missing auth token when adding worker', {
        userId: ctx.from.id,
        session: ctx.session,
      });
      await smartMessage.send(ctx, {
        text: generalMessages.authorizationRequired,
        keyboard: manageWorkersMenu(),
      });
      return await ctx.scene.leave();
    }

    const existingWorkers = Array.isArray(ctx.session.workerList)
      ? ctx.session.workerList
      : await workerApi.listWorkers(ctx.session.shopId, ctx.session.token).catch(() => []);

    if (!Array.isArray(ctx.session.workerList) && Array.isArray(existingWorkers)) {
      ctx.session.workerList = existingWorkers;
    }

    if (
      existingWorkers?.some(
        (worker) =>
          worker.telegram_id === telegramId ||
          (usernameInput &&
            worker.username &&
            worker.username.toLowerCase() === usernameInput.toLowerCase())
      )
    ) {
      await smartMessage.send(ctx, {
        text: sellerMessages.workerAddAlready,
        keyboard: manageWorkersMenu(),
      });
      return await ctx.scene.leave();
    }

    await smartMessage.send(ctx, { text: sellerMessages.workerAdding });

    try {
      logger.info('worker_add_request', {
        shopId: ctx.session.shopId,
        telegramId,
        username: usernameInput,
        requestedBy: ctx.from.id,
      });

      const worker = await workerApi.addWorker(
        ctx.session.shopId,
        {
          telegram_id: telegramId || undefined,
          username: usernameInput ? `@${usernameInput}` : undefined,
        },
        ctx.session.token
      );

      logger.info('worker_added', {
        workerId: worker.id,
        telegramId,
        shopId: ctx.session.shopId,
        addedBy: ctx.from.id,
      });

      const workerName = worker.username
        ? `@${worker.username}`
        : worker.first_name || `ID:${telegramId}`;

      if (Array.isArray(existingWorkers)) {
        ctx.session.workerList = [...existingWorkers, worker];
      }

      await smartMessage.send(ctx, {
        text: sellerMessages.workerAdded(workerName),
        keyboard: manageWorkersMenu(),
      });
    } catch (error) {
      logger.error('Error adding worker:', error);

      let errorMessage = sellerMessages.workerAddError;

      if (error.response?.data?.error) {
        const apiError = error.response.data.error;

        if (apiError.includes('not found') || apiError.includes('used the bot')) {
          errorMessage = sellerMessages.workerAddNotFound;
        } else if (apiError.includes('already a worker')) {
          errorMessage = sellerMessages.workerAddAlready;
        } else if (apiError.includes('owner cannot be added')) {
          errorMessage = sellerMessages.workerAddOwner;
        } else if (apiError.includes('PRO subscription') || apiError.includes('Workspace feature')) {
          errorMessage = 'Функция Workspace доступна только для PRO магазинов. Обновите подписку.';
        }
      }

      await smartMessage.send(ctx, {
        text: errorMessage,
        keyboard: manageWorkersMenu(),
      });
    }

    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error in confirmAndAdd step:', error);
    await smartMessage.send(ctx, {
      text: sellerMessages.workerLookupError,
      keyboard: manageWorkersMenu(),
    });
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const manageWorkersScene = new Scenes.WizardScene('manageWorkers', enterTelegramId, confirmAndAdd);

// Handle scene leave
manageWorkersScene.leave(async (ctx) => {
  // P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};

  // Очистить __scenes из Redis сессии для предотвращения застревания
  if (ctx.session && ctx.session.__scenes) {
    delete ctx.session.__scenes;
  }

  logger.info(`User ${ctx.from?.id} left manageWorkers scene`);
});

// Handle cancel command
manageWorkersScene.command('cancel', async (ctx) => {
  try {
    logger.info('manage_workers_cancelled_cmd', { userId: ctx.from.id });
    await ctx.scene.leave();
    
    const { showSellerToolsMenu } = await import('../utils/sellerNavigation.js');
    await showSellerToolsMenu(ctx);
  } catch (error) {
    logger.error('Error in cancel command handler:', error);
    try {
      await ctx.reply(generalMessages.actionFailed);
    } catch { /* Intentionally ignored */ }
  }
});

// Handle cancel action within scene
manageWorkersScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('manage_workers_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await showSellerToolsMenu(ctx);
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      await ctx.editMessageText(generalMessages.actionFailed, manageWorkersMenu());
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

manageWorkersScene.action('seller:tools', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('manage_workers_back_to_tools', { userId: ctx.from.id });
    await ctx.scene.leave();
    await showSellerToolsMenu(ctx);
  } catch (error) {
    logger.error('Error handling seller:tools in manageWorkers scene:', error);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: manageWorkersMenu(),
      });
    } catch (replyError) {
      logger.error('Failed to send fallback message:', replyError);
    }
  }
});

export default manageWorkersScene;
