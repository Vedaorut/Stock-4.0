import { Scenes } from 'telegraf';
import { buyerMenu, shopResultsKeyboard } from '../keyboards/buyer.js';
import { cancelButton } from '../keyboards/common.js';
import { shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { getMessages, getFormatters } from '../texts/messages.js';
import { t } from '../i18n/index.js';

/**
 * Search Shop Scene - Clean chat implementation
 * Steps:
 * 1. Enter shop name
 * 2. Show results (ONE message with all shops)
 */

// Step 1: Enter shop name
const enterShopName = async (ctx) => {
  try {
    logger.info('shop_search_step:name', { userId: ctx.from.id });

    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { search: searchMessages } = getMessages(lang);

    await smartMessage.send(ctx, {
      text: searchMessages.prompt(lang),
      keyboard: cancelButton(lang),
    });

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterShopName step:', error);
    throw error;
  }
};

// Step 2: Show results
const showResults = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { buyer: buyerMessages, search: searchMessages } = getMessages(lang);
    const formatters = getFormatters(lang);

    // Get shop name from message
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, {
        text: t('scenes.sendShopNameText', {}, lang) + '\n\n' + searchMessages.inputRequired(lang),
      });
      return;
    }

    // FIX BUG #2: Track user message ID for cleanup
    const userMsgId = ctx.message.message_id;
    const query = ctx.message.text.trim();

    // Delete user message immediately (clean chat pattern)
    await ctx.deleteMessage(userMsgId).catch((err) => {
      logger.debug(`Could not delete user message ${userMsgId}:`, err.message);
    });

    if (query.length < 2) {
      await smartMessage.send(ctx, {
        text: searchMessages.tooShort(lang),
      });
      return;
    }

    logger.info('shop_search_step:query', {
      userId: ctx.from.id,
      query: query,
    });

    await smartMessage.send(ctx, {
      text: searchMessages.searching(lang),
    });

    // Search shops via backend
    const shops = await shopApi.searchShops(query, ctx.session?.token);

    if (!shops || shops.length === 0) {
      await smartMessage.send(ctx, {
        text: searchMessages.noResults(lang),
        keyboard: buyerMenu(lang),
      });
      return await ctx.scene.leave();
    }

    // Create shop list text (all shops in one message)
    const shopList = formatters.shopList(shops);

    logger.info('shop_search_found', {
      count: shops.length,
      query: query,
      userId: ctx.from.id,
    });

    // Show results (limited to 10 for clean UI)
    const moreInfo = shops.length > 10 ? `\n\n_${t('search.showingFirstN', { total: shops.length }, lang)}_` : '';

    await smartMessage.send(ctx, {
      text: `${buyerMessages.searchResultsTitle(shops.length, lang)}\n${shopList}${moreInfo}`,
      keyboard: shopResultsKeyboard(shops),
    });

    // Leave scene
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error searching shops:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    const { search: searchMsgs } = getMessages(langErr);
    await smartMessage.send(ctx, {
      text: searchMsgs.error(langErr),
      keyboard: buyerMenu(langErr),
    });
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const searchShopScene = new Scenes.WizardScene('searchShop', enterShopName, showResults);

// Handle scene leave
searchShopScene.leave(async (ctx) => {
  // P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  ctx.scene.state = {};

  // Clear __scenes from Redis session to prevent getting stuck
  if (ctx.session && ctx.session.__scenes) {
    delete ctx.session.__scenes;
  }

  logger.info(`User ${ctx.from?.id} left searchShop scene`);
});

// Handle cancel button - prevents users from getting stuck in scene
searchShopScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('search_shop_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();

    const lang = ctx.lang || ctx.session?.language || 'ru';
    await ctx.editMessageText(t('general.actionCancelled', {}, lang), buyerMenu(lang));
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
searchShopScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('search_shop_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();

    const lang = ctx.lang || ctx.session?.language || 'ru';
    await ctx.editMessageText(t('general.actionCancelled', {}, lang), buyerMenu(lang));
  } catch (error) {
    logger.error('Error in cancel handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

export default searchShopScene;
