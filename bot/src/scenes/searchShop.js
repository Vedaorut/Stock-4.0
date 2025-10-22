import { Scenes } from 'telegraf';
import { buyerMenu, shopActionsKeyboard } from '../keyboards/buyer.js';
import { cancelButton } from '../keyboards/common.js';
import { shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';

/**
 * Search Shop Scene - Simple wizard
 * Steps:
 * 1. Enter shop name
 * 2. Show results
 */

// Step 1: Enter shop name
const enterShopName = async (ctx) => {
  try {
    logger.info('shop_search_step:name', { userId: ctx.from.id });
    
    await ctx.reply(
      'Введите название магазина',
      cancelButton
    );

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
      await ctx.reply('Введите название магазина', cancelButton);
      return;
    }

    const query = ctx.message.text.trim();

    if (query.length < 2) {
      await ctx.reply('Минимум 2 символа', cancelButton);
      return;
    }

    logger.info('shop_search_step:query', {
      userId: ctx.from.id,
      query: query
    });

    await ctx.reply('Поиск...');

    // Search shops via backend
    const shops = await shopApi.searchShops(query, ctx.session?.token);

    if (!shops || shops.length === 0) {
      await ctx.reply(
        'Не найдено',
        buyerMenu
      );
      return await ctx.scene.leave();
    }

    // Show all results
    for (const shop of shops) {
      const sellerUsername = shop.seller_username
        ? `@${shop.seller_username}`
        : (shop.seller_first_name || 'Продавец');

      await ctx.reply(
        `${shop.name}\nПродавец: ${sellerUsername}\n\n`,
        shopActionsKeyboard(shop.id, Boolean(shop.is_subscribed))
      );

      logger.info('shop_search_found', {
        shopId: shop.id,
        query: query,
        userId: ctx.from.id
      });
    }

    // Leave scene
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error searching shops:', error);
    await ctx.reply(
      'Ошибка поиска',
      buyerMenu
    );
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
  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left searchShop scene`);
});

// Handle cancel action within scene
searchShopScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('shop_search_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await ctx.reply('Отменено', { reply_markup: buyerMenu.reply_markup });
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка при отмене\n\nПопробуйте позже',
        buyerMenu
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default searchShopScene;
