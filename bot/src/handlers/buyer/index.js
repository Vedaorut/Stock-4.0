import { buyerMenu, buyerMenuNoShop, shopActionsKeyboard } from '../../keyboards/buyer.js';
import { subscriptionApi, shopApi, authApi, orderApi, productApi } from '../../utils/api.js';
import { formatPrice, formatOrderStatus } from '../../utils/format.js';
import { formatBuyerOrders, formatSubscriptions, formatShopInfo } from '../../utils/minimalist.js';
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

  // Unsubscribe from shop
  bot.action(/^unsubscribe:(.+)$/, handleUnsubscribe);

  // Noop handler for "Подписан" button
  bot.action(/^noop:/, handleNoop);

  // Back to buyer menu
  bot.action('buyer:main', handleBuyerRole);

  // View orders
  bot.action('buyer:orders', handleOrders);

  // View shop details
  bot.action(/^shop:view:(.+)$/, handleShopView);
};

/**
 * Handle buyer role selection
 */
export const handleBuyerRole = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    ctx.session.role = 'buyer';
    logger.info(`User ${ctx.from.id} selected buyer role`);

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('buyer', ctx.session.token);
        if (ctx.session.user) {
          ctx.session.user.selectedRole = 'buyer'; // Update session cache
        }
        logger.info(`Saved buyer role for user ${ctx.from.id}`);
      }
    } catch (error) {
      logger.error('Failed to save role:', error);
    }

    // Check if buyer has shop (for CTA to create shop)
    try {
      // MEDIUM severity fix - add token check
      if (ctx.session.token) {
        const shops = await shopApi.getMyShop(ctx.session.token);

        if (!shops || shops.length === 0) {
          // No shop - show CTA to create shop
          await ctx.editMessageText(
            'Мои покупки\n\nПродавец — $25',
            buyerMenuNoShop
          );
          logger.info(`Buyer ${ctx.from.id} has no shop, showing CTA`);
          return;
        }
      }
    } catch (error) {
      logger.error('Failed to check shop for buyer:', error);
      // Continue to show normal buyer menu on error
    }

    await ctx.editMessageText(
      'Мои покупки',
      buyerMenu
    );
  } catch (error) {
    logger.error('Error in buyer role handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        buyerMenu
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
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
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        buyerMenu
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle view subscriptions
 */
const handleSubscriptions = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Get user subscriptions
    if (!ctx.session.token) {
      await ctx.editMessageText(
        'Необходима авторизация. Перезапустите бота командой /start',
        buyerMenu
      );
      return;
    }

    const subscriptions = await subscriptionApi.getMySubscriptions(ctx.session.token);

    // Use minimalist formatter
    const message = formatSubscriptions(subscriptions);

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
    const shopId = ctx.match[1];

    // Check authentication
    if (!ctx.session.token) {
      await ctx.answerCbQuery('Нет токена авторизации', { show_alert: true });
      return;
    }

    // Check if already subscribed BEFORE attempting to subscribe
    const checkResult = await subscriptionApi.checkSubscription(shopId, ctx.session.token);

    if (checkResult.subscribed) {
      // Already subscribed - show info message
      await ctx.answerCbQuery('ℹ️ Вы уже подписаны на этот магазин');

      // Get shop details for message
      const shop = await shopApi.getShop(shopId);

      // Update message with subscribed state
      await ctx.editMessageText(
        `✓ Подписка активна: ${shop.name}`,
        shopActionsKeyboard(shopId, true)
      );

      logger.info(`User ${ctx.from.id} already subscribed to shop ${shopId}`);
      return;
    }

    // Not subscribed - proceed with subscription
    await subscriptionApi.subscribe(shopId, ctx.session.token);

    // Get shop details
    const shop = await shopApi.getShop(shopId);

    // Success - answer callback query
    await ctx.answerCbQuery('✅ Подписались!');

    await ctx.editMessageText(
      `✓ Подписались: ${shop.name}`,
      shopActionsKeyboard(shopId, true)
    );

    logger.info(`User ${ctx.from.id} subscribed to shop ${shopId}`);
  } catch (error) {
    logger.error('Error subscribing to shop:', error);

    // Parse backend error message
    const errorMsg = error.response?.data?.error;

    if (errorMsg === 'Cannot subscribe to your own shop') {
      await ctx.answerCbQuery('❌ Нельзя подписаться на свой магазин', { show_alert: true });
    } else if (errorMsg === 'Already subscribed to this shop') {
      await ctx.answerCbQuery('ℹ️ Вы уже подписаны', { show_alert: true });
    } else {
      await ctx.answerCbQuery('❌ Ошибка подписки', { show_alert: true });
    }
  }
};

/**
 * Handle unsubscribe from shop
 */
const handleUnsubscribe = async (ctx) => {
  try {
    const shopId = ctx.match[1];

    // Check authentication
    if (!ctx.session.token) {
      await ctx.answerCbQuery('Нет токена авторизации', { show_alert: true });
      return;
    }

    // MEDIUM severity fix - move answerCbQuery AFTER API call to avoid double call
    await subscriptionApi.unsubscribe(shopId, ctx.session.token);

    // Get shop details
    const shop = await shopApi.getShop(shopId);

    // Answer callback query AFTER successful API call
    await ctx.answerCbQuery('✓ Отписались');

    await ctx.editMessageText(
      `✓ Отписались: ${shop.name}`,
      shopActionsKeyboard(shopId, false)
    );

    logger.info(`User ${ctx.from.id} unsubscribed from shop ${shopId}`);
  } catch (error) {
    logger.error('Error unsubscribing from shop:', error);
    await ctx.answerCbQuery('Ошибка отписки', { show_alert: true });
  }
};

/**
 * Handle view orders
 */
const handleOrders = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check authentication
    if (!ctx.session.token) {
      await ctx.editMessageText(
        'Необходима авторизация. Перезапустите бота командой /start',
        buyerMenu
      );
      return;
    }

    // Get buyer orders
    const orders = await orderApi.getMyOrders(ctx.session.token);

    // Use minimalist formatter (9 lines → 4 lines)
    const message = formatBuyerOrders(orders);

    await ctx.editMessageText(message, buyerMenu);
    logger.info(`User ${ctx.from.id} viewed orders (${orders.length} total)`);
  } catch (error) {
    logger.error('Error fetching orders:', error);
    await ctx.editMessageText(
      'Ошибка загрузки',
      buyerMenu
    );
  }
};

/**
 * Handle noop action (informational button)
 */
const handleNoop = async (ctx) => {
  try {
    await ctx.answerCbQuery('ℹ️ Вы уже подписаны на этот магазин');
  } catch (error) {
    logger.error('Error in noop handler:', error);
  }
};

/**
 * Handle view shop details
 */
const handleShopView = async (ctx) => {
  try {
    const shopId = ctx.match[1];
    await ctx.answerCbQuery();

    // Get shop details
    const shop = await shopApi.getShop(shopId);

    // Get shop products
    const products = await productApi.getShopProducts(shopId);

    // Use minimalist formatter (13 lines → 7 lines)
    const message = formatShopInfo(shop, products);

    // Check subscription status (MEDIUM severity fix - add token check)
    let isSubscribed = false;
    if (ctx.session.token) {
      try {
        const checkResult = await subscriptionApi.checkSubscription(shopId, ctx.session.token);
        isSubscribed = checkResult.subscribed || false;
      } catch (error) {
        logger.error('Failed to check subscription status:', error);
        // Continue with isSubscribed = false on error
      }
    }

    await ctx.editMessageText(
      message,
      shopActionsKeyboard(shopId, isSubscribed)
    );

    logger.info(`User ${ctx.from.id} viewed shop ${shopId} details`);
  } catch (error) {
    logger.error('Error viewing shop:', error);
    await ctx.editMessageText(
      'Не удалось загрузить информацию о магазине\n\nПопробуйте позже',
      buyerMenu
    );
  }
};
