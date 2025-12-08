import { Scenes, Markup } from 'telegraf';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { getMessages } from '../texts/messages.js';
import { notificationApi, shopApi } from '../utils/api.js';
import { showSellerToolsMenu } from '../utils/sellerNavigation.js';
import { t } from '../i18n/index.js';

const parseChannelInput = (input) => {
  if (!input) {
    return null;
  }

  let value = input.trim();
  value = value.replace(/^https?:\/\//i, '');
  value = value.replace(/^t\.me\//i, '');
  if (value.startsWith('@')) {
    value = value.slice(1);
  }
  value = value.split('?')[0];

  const usernameRegex = /^[a-zA-Z0-9_]{5,32}$/;
  if (!usernameRegex.test(value)) {
    return null;
  }

  return `@${value}`;
};

const migrateChannelScene = new Scenes.WizardScene(
  'migrate_channel',
  async (ctx) => {
    try {
      const lang = ctx.lang || ctx.session?.language || 'ru';
      const { seller: sellerMessages } = getMessages(lang);

      await smartMessage.send(ctx, {
        text: `${sellerMessages.migration.intro(lang)}\n\n${sellerMessages.migration.confirmPrompt(lang)}`,
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.migrationConfirm', {}, lang), 'migrate:confirm')],
          [Markup.button.callback(t('buttons.backToTools', {}, lang), 'seller:tools')],
        ]),
      });
    } catch (error) {
      logger.error('Error sending migration intro:', error);
      await showSellerToolsMenu(ctx);
      return ctx.scene.leave();
    }

    return ctx.wizard.next();
  },
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    if (!ctx.callbackQuery) {
      await ctx.reply(t('scenes.useButtonsForMigration', {}, lang));
      return;
    }

    const data = ctx.callbackQuery.data;

    if (data === 'seller:tools') {
      await ctx.answerCbQuery();
      await showSellerToolsMenu(ctx);
      return ctx.scene.leave();
    }

    if (data !== 'migrate:confirm') {
      await ctx.answerCbQuery();
      return;
    }

    await ctx.answerCbQuery();

    try {
      await smartMessage.send(ctx, {
        text: sellerMessages.migration.askChannel(lang),
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.backToTools', {}, lang), 'seller:tools')],
        ]),
      });
    } catch (error) {
      logger.error('Error requesting new channel:', error);
      await showSellerToolsMenu(ctx);
      return ctx.scene.leave();
    }

    return ctx.wizard.next();
  },
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    if (ctx.callbackQuery?.data === 'seller:tools') {
      await ctx.answerCbQuery();
      await showSellerToolsMenu(ctx);
      return ctx.scene.leave();
    }

    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, {
        text: t('scenes.sendChannelText', {}, lang),
      });
      return;
    }

    const userMessageId = ctx.message.message_id;
    const rawInput = ctx.message.text.trim();
    const parsedChannel = parseChannelInput(rawInput);

    try {
      await ctx.deleteMessage(userMessageId).catch(() => {});
    } catch (error) {
      logger.warn('Failed to delete user message during migration:', error.message);
    }

    if (!parsedChannel) {
      await smartMessage.send(ctx, {
        text: sellerMessages.migration.invalidChannel(lang),
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.backToTools', {}, lang), 'seller:tools')],
        ]),
      });
      return;
    }

    const shopId = ctx.session.shopId;
    let buyersCount = 0;
    let shopName = ctx.session.shopName || ctx.t('general.shopFallbackName');

    if (shopId && ctx.session.token) {
      try {
        const shop = await shopApi.getShop(ctx.session.shopId, ctx.session.token);
        if (shop?.name) {
          shopName = shop.name;
          ctx.session.shopName = shop.name;
        }
        buyersCount =
          shop?.buyers_count ??
          shop?.buyersCount ??
          shop?.subscribers_count ??
          shop?.subscribersCount ??
          ctx.session.migrationBuyersCount ??
          0;
        ctx.session.migrationBuyersCount = buyersCount;
      } catch (error) {
        logger.warn('Failed to fetch shop info for migration confirmation:', error.message);
      }
    }

    const normalizedCount = Number.isFinite(Number(buyersCount)) ? Number(buyersCount) : 0;

    ctx.wizard.state.newChannel = parsedChannel;
    ctx.wizard.state.shopName = shopName;
    ctx.wizard.state.buyersCount = normalizedCount;

    const confirmationMessage = sellerMessages.migration.confirmation({
      shopName,
      channel: parsedChannel,
      buyersCount: normalizedCount,
    });

    await smartMessage.send(ctx, {
      text: confirmationMessage,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.sendNotifications', {}, lang), 'migrate:send')],
        [Markup.button.callback(t('buttons.backToTools', {}, lang), 'seller:tools')],
      ]),
    });

    return ctx.wizard.next();
  },
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMessages, general: generalMessages } = getMessages(lang);

    if (!ctx.callbackQuery) {
      await ctx.reply(t('scenes.useButtonsForNotifications', {}, lang));
      return;
    }

    const data = ctx.callbackQuery.data;

    if (data === 'seller:tools') {
      await ctx.answerCbQuery();
      await showSellerToolsMenu(ctx);
      return ctx.scene.leave();
    }

    if (data !== 'migrate:send') {
      await ctx.answerCbQuery();
      return;
    }

    await ctx.answerCbQuery();

    const shopId = ctx.session.shopId;
    const token = ctx.session.token;
    const newChannel = ctx.wizard.state.newChannel;
    const buyersCount = ctx.wizard.state.buyersCount ?? 0;

    if (!shopId || !token || !newChannel) {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.backToTools', {}, lang), 'seller:tools')],
        ]),
      });
      return ctx.scene.leave();
    }

    let loadingMessage;
    try {
      loadingMessage = await smartMessage.send(ctx, { text: sellerMessages.migration.sending(lang) });
    } catch (error) {
      logger.warn('Failed to send migration loading message:', error.message);
    }

    try {
      const response = await notificationApi.migrateChannel(shopId, newChannel, token);
      const notifiedRaw = response?.notified ?? response?.count ?? buyersCount;
      const notified = Number.isFinite(Number(notifiedRaw)) ? Number(notifiedRaw) : buyersCount;

      await smartMessage.send(ctx, {
        text: sellerMessages.migration.success({ channel: newChannel, buyersCount: notified }),
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.goToTools', {}, lang), 'seller:tools')],
          [Markup.button.callback(t('buttons.backToMenu', {}, lang), 'seller:menu')],
        ]),
      });
    } catch (error) {
      logger.error('Error migrating channel:', error);
      await smartMessage.send(ctx, {
        text: sellerMessages.migration.error(lang),
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.backToTools', {}, lang), 'seller:tools')],
        ]),
      });
    } finally {
      if (loadingMessage?.message_id) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id).catch(() => {});
      }
    }

    return ctx.scene.leave();
  }
);

migrateChannelScene.leave(async (ctx) => {
  // P0 FIX: Use assignment instead of delete to prevent TypeError
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  ctx.scene.state = {};

  // P0 FIX: REMOVED delete ctx.session.__scenes
  // Telegraf manages __scenes automatically. Deleting it here can cause
  // race condition when scene.leave() is followed by scene.enter()

  logger.info(`User ${ctx.from?.id} left migrateChannel scene`);
});

// Handle cancel button - prevents users from getting stuck in scene
migrateChannelScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('migrate_channel_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await showSellerToolsMenu(ctx);
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

// Also handle 'cancel' action (some buttons use this)
migrateChannelScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('migrate_channel_cancelled', { userId: ctx.from.id });
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

export default migrateChannelScene;
