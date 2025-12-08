import { Scenes } from 'telegraf';
import { manageWorkersMenu } from '../keyboards/workspace.js';
import { cancelButton } from '../keyboards/common.js';
import { workerApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { showSellerToolsMenu } from '../utils/sellerNavigation.js';
import { t } from '../i18n/index.js';

/**
 * Get language with fallback
 */
const getLangSafe = (ctx) => ctx.lang || ctx.session?.language || 'ru';

/**
 * Manage Workers Scene - Add/Remove workers
 * Owner can add workers by Telegram ID
 */

// Step 1: Ask for Telegram ID
const enterTelegramId = async (ctx) => {
  try {
    logger.info('manage_workers_step:telegram_id', { userId: ctx.from.id });

    const lang = getLangSafe(ctx);
    // Show context + prompt
    const message = `${t('seller.workersContext', {}, lang)}\n\n${t('seller.workerPrompt', {}, lang)}`;

    await smartMessage.send(ctx, {
      text: message,
      keyboard: cancelButton(lang),
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
    const lang = getLangSafe(ctx);

    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, {
        text: t('scenes.sendTelegramIdText', {}, lang) + '\n\n' + t('seller.workerPrompt', {}, lang),
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
          text: t('seller.workerUsernameInvalid', {}, lang),
        });
        return;
      }

      try {
        const chat = await ctx.telegram.getChat(input);
        if (!chat || !chat.id) {
          await smartMessage.send(ctx, { text: t('seller.workerAddNotFound', {}, lang) });
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
        // FALLBACK: getChat failed - send username to backend for DB lookup
        logger.info('manage_workers_username_fallback', {
          requester: ctx.from.id,
          username: usernameInput,
          reason: lookupError.message,
        });
        telegramId = null; // Backend will search by username only
      }
    } else if (/^\d+$/.test(input)) {
      telegramId = Number.parseInt(input, 10);
      if (!Number.isFinite(telegramId) || telegramId <= 0) {
        await smartMessage.send(ctx, { text: t('seller.workerIdInvalid', {}, lang) });
        return;
      }
    } else {
      await smartMessage.send(ctx, { text: t('seller.workerIdInvalid', {}, lang) });
      return;
    }

    ctx.wizard.state.telegramId = telegramId;

    // If no telegramId and no username - this is an error
    if (!telegramId && !usernameInput) {
      await smartMessage.send(ctx, { text: t('seller.workerAddNotFound', {}, lang) });
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
        text: t('general.shopRequired', {}, lang),
        keyboard: manageWorkersMenu(lang),
      });
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      logger.error('Missing auth token when adding worker', {
        userId: ctx.from.id,
        session: ctx.session,
      });
      await smartMessage.send(ctx, {
        text: t('general.authorizationRequired', {}, lang),
        keyboard: manageWorkersMenu(lang),
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
        text: t('seller.workerAddAlready', {}, lang),
        keyboard: manageWorkersMenu(lang),
      });
      return await ctx.scene.leave();
    }

    await smartMessage.send(ctx, { text: t('seller.workerAdding', {}, lang) });

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
        text: t('seller.workerAdded', { name: workerName }, lang),
        keyboard: manageWorkersMenu(lang),
      });
    } catch (error) {
      logger.error('Error adding worker:', error);

      let errorMessage = t('seller.workerAddError', {}, lang);

      if (error.response?.data?.error) {
        const apiError = error.response.data.error;

        if (apiError.includes('not found') || apiError.includes('used the bot')) {
          errorMessage = t('seller.workerAddNotFound', {}, lang);
        } else if (apiError.includes('already a worker')) {
          errorMessage = t('seller.workerAddAlready', {}, lang);
        } else if (apiError.includes('owner cannot be added')) {
          errorMessage = t('seller.workerAddOwner', {}, lang);
        } else if (apiError.includes('PRO subscription') || apiError.includes('Workspace feature')) {
          errorMessage = t('seller.workersProSubscriptionRequired', {}, lang);
        }
      }

      await smartMessage.send(ctx, {
        text: errorMessage,
        keyboard: manageWorkersMenu(lang),
      });
    }

    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error in confirmAndAdd step:', error);
    const lang = getLangSafe(ctx);
    await smartMessage.send(ctx, {
      text: t('seller.workerLookupError', {}, lang),
      keyboard: manageWorkersMenu(lang),
    });
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const manageWorkersScene = new Scenes.WizardScene('manageWorkers', enterTelegramId, confirmAndAdd);

// Handle scene leave
manageWorkersScene.leave(async (ctx) => {
  // P0 FIX: Use assignment instead of delete to prevent TypeError
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  ctx.scene.state = {};

  // P0 FIX: REMOVED delete ctx.session.__scenes - Telegraf manages this

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
      await ctx.reply(t('general.actionFailed', {}, getLangSafe(ctx)));
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
    const lang = getLangSafe(ctx);
    try {
      await ctx.editMessageText(t('general.actionFailed', {}, lang), manageWorkersMenu(lang));
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

// Also handle 'cancel' action (some buttons use this)
manageWorkersScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('manage_workers_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
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

manageWorkersScene.action('seller:tools', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('manage_workers_back_to_tools', { userId: ctx.from.id });
    await ctx.scene.leave();
    await showSellerToolsMenu(ctx);
  } catch (error) {
    logger.error('Error handling seller:tools in manageWorkers scene:', error);
    const lang = getLangSafe(ctx);
    try {
      await smartMessage.send(ctx, {
        text: t('general.actionFailed', {}, lang),
        keyboard: manageWorkersMenu(lang),
      });
    } catch (replyError) {
      logger.error('Failed to send fallback message:', replyError);
    }
  }
});

export default manageWorkersScene;
