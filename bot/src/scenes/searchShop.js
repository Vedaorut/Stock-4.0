import { Scenes } from 'telegraf';
import { buyerMenu, shopResultsKeyboard } from '../keyboards/buyer.js';
import { cancelButton } from '../keyboards/common.js';
import { shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import * as messageCleanup from '../utils/messageCleanup.js';

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
      text: 'Название (мин 2 символа):',
      keyboard: cancelButton
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
        text: 'Введите название магазина'
      });
      return;
    }

    const query = ctx.message.text.trim();

    if (query.length < 2) {
      await smartMessage.send(ctx, {
        text: 'Минимум 2 символа'
      });
      return;
    }

    logger.info('shop_search_step:query', {
      userId: ctx.from.id,
      query: query
    });

    await smartMessage.send(ctx, {
      text: 'Поиск...'
    });

    // Search shops via backend
    const shops = await shopApi.searchShops(query, ctx.session?.token);

    if (!shops || shops.length === 0) {
      await smartMessage.send(ctx, {
        text: 'Не найдено',
        keyboard: buyerMenu
      });
      return await ctx.scene.leave();
    }

    // Create shop list text (all shops in one message)
    const shopList = shops.map((shop, index) => {
      const sellerUsername = shop.seller_username
        ? `@${shop.seller_username}`
        : (shop.seller_first_name || 'Продавец');
      const subscribed = shop.is_subscribed ? ' ✅' : '';
      return `${index + 1}. ${shop.name} • ${sellerUsername}${subscribed}`;
    }).join('\n');

    logger.info('shop_search_found', {
      count: shops.length,
      query: query,
      userId: ctx.from.id
    });

    // Show ALL results in ONE message
    await smartMessage.send(ctx, {
      text: `Найдено (${shops.length}):\n\n${shopList}`,
      keyboard: shopResultsKeyboard(shops)
    });

    // Leave scene
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error searching shops:', error);
    await smartMessage.send(ctx, {
      text: 'Ошибка поиска',
      keyboard: buyerMenu
    });
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const searchShopScene = new Scenes.WizardScene(
  'searchShop',
  enterShopName,
  showResults
);

// Handle scene leave
searchShopScene.leave(async (ctx) => {
  // Cleanup wizard messages (keep final message)
  await messageCleanup.cleanupWizard(ctx, {
    keepFinalMessage: true,
    keepWelcome: true
  });

  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left searchShop scene`);
});

// Handle cancel action within scene
searchShopScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('shop_search_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();

    await smartMessage.send(ctx, {
      text: 'Отменено',
      keyboard: buyerMenu
    });
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: 'Произошла ошибка при отмене\n\nПопробуйте позже',
        keyboard: buyerMenu
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default searchShopScene;
