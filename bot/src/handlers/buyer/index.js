import { buyerMenu, shopActionsKeyboard } from '../../keyboards/buyer.js';
import { subscriptionApi, shopApi } from '../../utils/api.js';
import logger from '../../utils/logger.js';

/**
 * Setup buyer-related handlers
 */
export const setupBuyerHandlers = (bot) => {
  // Buyer role selected
  bot.action('role:buyer', handleBuyerRole);

  // Search shops action
  bot.action('buyer:search', handleSearchShops);

  // View subscriptions
  bot.action('buyer:subscriptions', handleSubscriptions);

  // Subscribe to shop
  bot.action(/^subscribe:(.+)$/, handleSubscribe);

  // Back to buyer menu
  bot.action('buyer:main', handleBuyerRole);
};

/**
 * Handle buyer role selection
 */
const handleBuyerRole = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    ctx.session.role = 'buyer';
    logger.info(`User ${ctx.from.id} selected buyer role`);

    await ctx.editMessageText(
      'Мои покупки\n\n',
      buyerMenu
    );
  } catch (error) {
    logger.error('Error in buyer role handler:', error);
    throw error;
  }
};

/**
 * Handle search shops action
 */
const handleSearchShops = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Enter searchShop scene
    await ctx.scene.enter('searchShop');
  } catch (error) {
    logger.error('Error entering searchShop scene:', error);
    throw error;
  }
};

/**
 * Handle view subscriptions
 */
const handleSubscriptions = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Get user subscriptions
    const subscriptions = await subscriptionApi.getMySubscriptions(ctx.session.token);

    if (!subscriptions || subscriptions.length === 0) {
      await ctx.editMessageText(
        'У вас нет подписок\n\nНайдите магазины и подпишитесь',
        buyerMenu
      );
      return;
    }

    // Format subscriptions list
    let message = 'Мои подписки:\n\n';
    subscriptions.forEach((sub, index) => {
      message += `${index + 1}. ${sub.shopName}\n`;
    });

    await ctx.editMessageText(message, buyerMenu);
  } catch (error) {
    logger.error('Error fetching subscriptions:', error);
    await ctx.editMessageText(
      'Не удалось загрузить подписки\n\nПопробуйте позже',
      buyerMenu
    );
  }
};

/**
 * Handle subscribe to shop
 */
const handleSubscribe = async (ctx) => {
  try {
    await ctx.answerCbQuery('Подписываем...');

    const shopId = ctx.match[1];

    // Subscribe to shop
    await subscriptionApi.subscribe(shopId, ctx.session.token);

    // Get shop details
    const shop = await shopApi.getShop(shopId);

    await ctx.editMessageText(
      `✓ Вы подписались на ${shop.name}\n\nВы получите уведомление о новых товарах`,
      shopActionsKeyboard(shopId, true)
    );

    logger.info(`User ${ctx.from.id} subscribed to shop ${shopId}`);
  } catch (error) {
    logger.error('Error subscribing to shop:', error);
    await ctx.answerCbQuery('Ошибка подписки', { show_alert: true });
  }
};
