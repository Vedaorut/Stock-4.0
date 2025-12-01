import { buyerMenu, buyerMenuNoShop, shopActionsKeyboard } from '../../keyboards/buyer.js';
import { subscriptionApi, shopApi, authApi, orderApi, productApi } from '../../utils/api.js';
import { splitProductsByAvailability } from '../../utils/minimalist.js';
import logger from '../../utils/logger.js';
import * as smartMessage from '../../utils/smartMessage.js';
import { messages, formatters } from '../../texts/messages.js';

const { buyer: buyerMessages, general: generalMessages } = messages;

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

  // View shop sections
  bot.action(/^shop:stock:(.+)$/, handleShopStock);
  bot.action(/^shop:preorder:(.+)$/, handleShopPreorder);
};

const resolveSubscription = async (ctx, shopId) => {
  if (!ctx.session.token) return false;
  try {
    const checkResult = await subscriptionApi.checkSubscription(shopId, ctx.session.token);
    return checkResult.subscribed || false;
  } catch (error) {
    logger.error('Failed to check subscription status:', error);
    return false;
  }
};

const resolveSectionCounts = async (shopId, products = null) => {
  try {
    const list = products || (await productApi.getShopProducts(shopId));
    const split = splitProductsByAvailability(list);
    return {
      stock: split.stock.length,
      preorder: split.preorder.length,
    };
  } catch (error) {
    logger.error('Failed to resolve section counts:', error);
    return { stock: 0, preorder: 0 };
  }
};

const buildSubscriptionsMessage = (subscriptions) => {
  if (!subscriptions?.length) {
    return buyerMessages.noSubscriptions;
  }

  const list = formatters.subscriptions(subscriptions);
  return `${buyerMessages.listSubscriptionsTitle(subscriptions.length)}\n${list}`;
};

const buildShopInfoMessage = (shop, sections) => formatters.shopInfo(shop, sections);

const buildProductSectionMessage = (section, shopName, products) =>
  formatters.productSection(section, shopName, products);

/**
 * Handle buyer role selection
 */
export const handleBuyerRole = async (ctx) => {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

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
    // STABILITY FIX #2: Use explicit .catch() for graceful fallback on 401/403
    if (ctx.session.token) {
      const shops = await shopApi.getMyShop(ctx.session.token).catch((error) => {
        // Graceful fallback: on 401/403 or any error, return null to show normal menu
        if (error.response?.status === 401 || error.response?.status === 403) {
          logger.debug('Token expired or forbidden when checking shop for buyer, showing normal menu');
        } else {
          logger.error('Failed to check shop for buyer:', error);
        }
        return null;
      });

      if (shops !== null && (!shops || shops.length === 0)) {
        // No shop - show CTA to create shop
        await smartMessage.send(ctx, {
          text: buyerMessages.panel,
          keyboard: buyerMenuNoShop,
        });
        logger.info(`Buyer ${ctx.from.id} has no shop, showing CTA`);
        return;
      }
    }

    await smartMessage.send(ctx, {
      text: buyerMessages.panel,
      keyboard: buyerMenu,
    });
  } catch (error) {
    logger.error('Error in buyer role handler:', error);
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
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: buyerMenu,
      });
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
      await smartMessage.send(ctx, {
        text: generalMessages.authorizationRequired,
        keyboard: buyerMenu,
      });
      return;
    }

    const subscriptions = await subscriptionApi.getMySubscriptions(ctx.session.token);

    const message = buildSubscriptionsMessage(subscriptions);

    await smartMessage.send(ctx, {
      text: message,
      keyboard: buyerMenu,
    });
  } catch (error) {
    logger.error('Error fetching subscriptions:', error);
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed,
      keyboard: buyerMenu,
    });
  }
};

/**
 * Handle subscribe to shop
 */
const handleSubscribe = async (ctx) => {
  try {
    const shopId = parseInt(ctx.match[1], 10);

    // Validate shopId
    if (!Number.isInteger(shopId) || shopId <= 0) {
      await ctx.answerCbQuery('Некорректный ID магазина', { show_alert: true });
      return;
    }

    // Check authentication
    if (!ctx.session.token) {
      await ctx.answerCbQuery(generalMessages.authorizationRequired, { show_alert: true });
      return;
    }

    // Check if already subscribed BEFORE attempting to subscribe
    const checkResult = await subscriptionApi.checkSubscription(shopId, ctx.session.token);

    if (checkResult.subscribed) {
      await ctx.answerCbQuery(buyerMessages.subscriptionAlreadyToast);

      const counts = await resolveSectionCounts(shopId);

      await smartMessage.send(ctx, {
        text: buyerMessages.subscriptionActive(),
        keyboard: shopActionsKeyboard(shopId, true, counts),
      });

      logger.info(`User ${ctx.from.id} already subscribed to shop ${shopId}`);
      return;
    }

    // Not subscribed - proceed with subscription (pass telegram_id for broadcast feature)
    await subscriptionApi.subscribe(shopId, ctx.session.token, ctx.from.id);

    // P2-1 FIX: Handle case when shop is deleted after subscription
    const shop = await shopApi.getShop(shopId);
    if (!shop) {
      await ctx.answerCbQuery(buyerMessages.shopNotFound || 'Магазин не найден', { show_alert: true });
      return;
    }

    const counts = await resolveSectionCounts(shopId);

    await ctx.answerCbQuery(generalMessages.done);

    await smartMessage.send(ctx, {
      text: buyerMessages.subscriptionAdded(shop.name),
      keyboard: shopActionsKeyboard(shopId, true, counts),
    });

    logger.info(`User ${ctx.from.id} subscribed to shop ${shopId}`);
  } catch (error) {
    logger.error('Error subscribing to shop:', error);

    // Parse backend error message
    const errorMsg = error.response?.data?.error;

    if (errorMsg === 'Cannot subscribe to your own shop') {
      await ctx.answerCbQuery(buyerMessages.subscriptionOwnShop, { show_alert: true });
    } else if (errorMsg === 'Already subscribed to this shop') {
      await ctx.answerCbQuery(buyerMessages.subscriptionAlreadyToast, { show_alert: true });
    } else {
      await ctx.answerCbQuery(buyerMessages.subscriptionError, { show_alert: true });
    }
  }
};

/**
 * Handle unsubscribe from shop
 */
const handleUnsubscribe = async (ctx) => {
  try {
    const shopId = parseInt(ctx.match[1], 10);

    // Validate shopId
    if (!Number.isInteger(shopId) || shopId <= 0) {
      await ctx.answerCbQuery('Некорректный ID магазина', { show_alert: true });
      return;
    }

    // Check authentication
    if (!ctx.session.token) {
      await ctx.answerCbQuery(generalMessages.authorizationRequired, { show_alert: true });
      return;
    }

    // MEDIUM severity fix - move answerCbQuery AFTER API call to avoid double call
    await subscriptionApi.unsubscribe(shopId, ctx.session.token);

    const shop = await shopApi.getShop(shopId);
    const counts = await resolveSectionCounts(shopId);

    await ctx.answerCbQuery(generalMessages.done);

    await smartMessage.send(ctx, {
      text: buyerMessages.subscriptionRemoved(shop.name),
      keyboard: shopActionsKeyboard(shopId, false, counts),
    });

    logger.info(`User ${ctx.from.id} unsubscribed from shop ${shopId}`);
  } catch (error) {
    logger.error('Error unsubscribing from shop:', error);
    await ctx.answerCbQuery(buyerMessages.unsubscribeError, { show_alert: true });
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
      await smartMessage.send(ctx, {
        text: generalMessages.authorizationRequired,
        keyboard: buyerMenu,
      });
      return;
    }

    // Get buyer orders
    const orders = await orderApi.getMyOrders(ctx.session.token);

    const message = orders.length
      ? `${buyerMessages.ordersTitle(orders.length)}\n${formatters.orders(orders)}`
      : buyerMessages.ordersEmpty;

    await smartMessage.send(ctx, {
      text: message,
      keyboard: buyerMenu,
    });
    logger.info(`User ${ctx.from.id} viewed orders (${orders.length} total)`);
  } catch (error) {
    logger.error('Error fetching orders:', error);
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed,
      keyboard: buyerMenu,
    });
  }
};

/**
 * Handle noop action (informational button)
 */
const handleNoop = async (ctx) => {
  try {
    await ctx.answerCbQuery(buyerMessages.subscriptionAlreadyToast);
  } catch (error) {
    logger.error('Error in noop handler:', error);
  }
};

/**
 * Handle view shop details
 */
const handleShopView = async (ctx) => {
  try {
    const shopId = parseInt(ctx.match[1], 10);

    // Validate shopId
    if (!Number.isInteger(shopId) || shopId <= 0) {
      await ctx.answerCbQuery('Некорректный ID магазина', { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    // Get shop details
    const shop = await shopApi.getShop(shopId);

    // P2-2 FIX: Handle deleted shop
    if (!shop) {
      await smartMessage.send(ctx, {
        text: buyerMessages.shopNotFound || 'Магазин не найден или был удалён',
        keyboard: buyerMenu,
      });
      return;
    }

    const products = await productApi.getShopProducts(shopId);
    const sectioned = splitProductsByAvailability(products);
    const message = buildShopInfoMessage(shop, sectioned);
    const isSubscribed = await resolveSubscription(ctx, shopId);

    await smartMessage.send(ctx, {
      text: message,
      keyboard: shopActionsKeyboard(shopId, isSubscribed, {
        stock: sectioned.stock.length,
        preorder: sectioned.preorder.length,
      }),
    });

    logger.info(`User ${ctx.from.id} viewed shop ${shopId} details`);
  } catch (error) {
    logger.error('Error viewing shop:', error);

    // ✅ P2-2 FIX: Answer callback query to remove spinner
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('Ошибка загрузки').catch(() => {});
    }

    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed,
      keyboard: buyerMenu,
    });
  }
};

const handleShopStock = async (ctx) => handleShopSection(ctx, 'stock');
const handleShopPreorder = async (ctx) => handleShopSection(ctx, 'preorder');

const handleShopSection = async (ctx, section) => {
  try {
    const shopId = parseInt(ctx.match[1], 10);

    // Validate shopId
    if (!Number.isInteger(shopId) || shopId <= 0) {
      await ctx.answerCbQuery('Некорректный ID магазина', { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    const [shop, products] = await Promise.all([
      shopApi.getShop(shopId),
      productApi.getShopProducts(shopId),
    ]);

    const sectioned = splitProductsByAvailability(products);
    const list = section === 'preorder' ? sectioned.preorder : sectioned.stock;
    const message = buildProductSectionMessage(section, shop.name, list);
    const isSubscribed = await resolveSubscription(ctx, shopId);

    await smartMessage.send(ctx, {
      text: message,
      keyboard: shopActionsKeyboard(shopId, isSubscribed, {
        stock: sectioned.stock.length,
        preorder: sectioned.preorder.length,
      }),
    });

    logger.info(`User ${ctx.from.id} viewed section ${section} for shop ${shopId}`);
  } catch (error) {
    logger.error('Error viewing shop section:', error);

    // ✅ P2-2 FIX: Answer callback query to remove spinner
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('Ошибка загрузки').catch(() => {});
    }

    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed,
      keyboard: buyerMenu,
    });
  }
};
