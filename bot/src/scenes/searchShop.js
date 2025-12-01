import { Scenes } from 'telegraf';
import { buyerMenu, shopResultsKeyboard } from '../keyboards/buyer.js';
import { cancelButton } from '../keyboards/common.js';
import { shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { messages, formatters } from '../texts/messages.js';

const { buyer: buyerMessages, search: searchMessages, general: generalMessages } = messages;

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

    await smartMessage.send(ctx, {
      text: searchMessages.prompt,
      keyboard: cancelButton,
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
    // Get shop name from message
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, {
        text: 'Пожалуйста, отправьте название магазина текстом.\n\n' + searchMessages.inputRequired,
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
        text: searchMessages.tooShort,
      });
      return;
    }

    logger.info('shop_search_step:query', {
      userId: ctx.from.id,
      query: query,
    });

    await smartMessage.send(ctx, {
      text: searchMessages.searching,
    });

    // Search shops via backend
    const shops = await shopApi.searchShops(query, ctx.session?.token);

    if (!shops || shops.length === 0) {
      await smartMessage.send(ctx, {
        text: searchMessages.noResults,
        keyboard: buyerMenu,
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
    const moreInfo = shops.length > 10 ? `\n\n_Показаны первые 10 из ${shops.length}_` : '';

    await smartMessage.send(ctx, {
      text: `${buyerMessages.searchResultsTitle(shops.length)}\n${shopList}${moreInfo}`,
      keyboard: shopResultsKeyboard(shops),
    });

    // Leave scene
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error searching shops:', error);
    await smartMessage.send(ctx, {
      text: searchMessages.error,
      keyboard: buyerMenu,
    });
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const searchShopScene = new Scenes.WizardScene('searchShop', enterShopName, showResults);

// Handle scene leave
searchShopScene.leave(async (ctx) => {
  // ✅ P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};
  logger.info(`User ${ctx.from?.id} left searchShop scene`);
});

// Handle cancel action within scene
searchShopScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery(); // Silent
    logger.info('shop_search_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();

    // Silent transition - edit message without "Отменено" text
    await ctx.editMessageText(buyerMessages.panel, buyerMenu);
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: buyerMenu,
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default searchShopScene;
