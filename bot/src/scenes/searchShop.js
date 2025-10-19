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
    await ctx.editMessageText(
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
    // Skip callback queries
    if (ctx.callbackQuery) {
      return;
    }

    // Get shop name from message
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Введите название магазина', cancelButton);
      return;
    }

    const query = ctx.message.text.trim();

    if (query.length < 2) {
      await ctx.reply('Минимум 2 символа для поиска', cancelButton);
      return;
    }

    logger.info(`User ${ctx.from.id} searching for: ${query}`);

    await ctx.reply('Ищем...');

    // Search shops via backend
    const shops = await shopApi.searchShops(query);

    if (!shops || shops.length === 0) {
      await ctx.reply(
        'Магазин не найден\n\nПопробуйте другое название',
        buyerMenu
      );
      return await ctx.scene.leave();
    }

    // Show first result
    const shop = shops[0];
    const seller = shop.seller || {};
    const sellerUsername = seller.username ? `@${seller.username}` : 'Продавец';

    await ctx.reply(
      `${shop.name}\nПродавец: ${sellerUsername}\n\n`,
      shopActionsKeyboard(shop.id, shop.isSubscribed)
    );

    logger.info(`Shop found: ${shop.id} for query: ${query}`);

    // Leave scene
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error searching shops:', error);
    await ctx.reply(
      'Не удалось найти магазин\n\nПопробуйте позже',
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

export default searchShopScene;
