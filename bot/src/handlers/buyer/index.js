import { buyerMenu, shopActionsKeyboard } from '../../keyboards/buyer.js';
import { subscriptionApi, shopApi, authApi, orderApi, productApi } from '../../utils/api.js';
import { splitProductsByAvailability } from '../../utils/minimalist.js';
import logger from '../../utils/logger.js';
import * as smartMessage from '../../utils/smartMessage.js';
import { getMessages, formatters } from '../../texts/messages.js';

/**
 * Get language with fallback (C5 fix: ctx.lang undefined)
 */
const getLangSafe = (ctx) => ctx.lang || ctx.session?.language || 'ru';

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

  // Noop handler for "Subscribed" button
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

const buildSubscriptionsMessage = (subscriptions, lang = 'ru') => {
  const { buyer: buyerMessages } = getMessages(lang);
  if (!subscriptions?.length) {
    return buyerMessages.noSubscriptions(lang);
  }

  const list = formatters.subscriptions(subscriptions, lang);
  return `${buyerMessages.listSubscriptionsTitle(subscriptions.length, lang)}\n${list}`;
};

const buildShopInfoMessage = (shop, sections) => formatters.shopInfo(shop, sections);

const buildProductSectionMessage = (section, shopName, products) =>
  formatters.productSection(section, shopName, products);

/**
 * Handle buyer role selection
 * @param {Object} ctx - Telegraf context
 * @param {Object} options - Options
 * @param {boolean} options.skipRoleUpdate - Skip PATCH /auth/role (already called by caller)
 */
export const handleBuyerRole = async (ctx, options = {}) => {
  const lang = getLangSafe(ctx);
  const { buyer: buyerMessages, general: generalMessages } = getMessages(lang);

  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    ctx.session.role = 'buyer';
    logger.info(`User ${ctx.from.id} selected buyer role`);

    // PERF: Skip role update if already done by caller (e.g., handleRoleBuyer)
    if (!options.skipRoleUpdate) {
      try {
        if (ctx.session.token) {
          await authApi.updateRole('buyer', ctx.session.token);

          logger.info(`Saved buyer role for user ${ctx.from.id}`);
        }
      } catch (error) {
        logger.error('Failed to save role:', error);
      }
    }

    // Check if buyer has shop (to show/hide role switch button)
    // STABILITY FIX #2: Use explicit .catch() for graceful fallback on 401/403
    let hasShop = false;
    if (ctx.session.token) {
      const shops = await shopApi.getMyShop(ctx.session.token).catch((error) => {
        // Graceful fallback: on 401/403 or any error, return null
        if (error.response?.status === 401 || error.response?.status === 403) {
          logger.debug('Token expired or forbidden when checking shop for buyer, showing normal menu');
        } else {
          logger.error('Failed to check shop for buyer:', error);
        }
        return null;
      });

      hasShop = shops !== null && Array.isArray(shops) && shops.length > 0;
    }

    await smartMessage.send(ctx, {
      text: buyerMessages.panel(lang),
      keyboard: buyerMenu({ hasShop }, lang),
    });
    logger.info(`Buyer ${ctx.from.id} menu shown, hasShop=${hasShop}`);
  } catch (error) {
    logger.error('Error in buyer role handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: buyerMenu(lang),
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
  const lang = getLangSafe(ctx);
  const { general: generalMessages } = getMessages(lang);

  try {
    await ctx.answerCbQuery();

    // Enter searchShop scene
    await ctx.scene.enter('searchShop');
  } catch (error) {
    logger.error('Error entering searchShop scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: buyerMenu(lang),
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
  const lang = getLangSafe(ctx);
  const { general: generalMessages } = getMessages(lang);

  try {
    await ctx.answerCbQuery();

    // Get user subscriptions
    if (!ctx.session.token) {
      await smartMessage.send(ctx, {
        text: generalMessages.authorizationRequired(lang),
        keyboard: buyerMenu(lang),
      });
      return;
    }

    const subscriptions = await subscriptionApi.getMySubscriptions(ctx.session.token);

    const message = buildSubscriptionsMessage(subscriptions, lang);

    await smartMessage.send(ctx, {
      text: message,
      keyboard: buyerMenu(lang),
    });
  } catch (error) {
    logger.error('Error fetching subscriptions:', error);
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed(lang),
      keyboard: buyerMenu(lang),
    });
  }
};

/**
 * Handle subscribe to shop
 */
const handleSubscribe = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { buyer: buyerMessages, general: generalMessages } = getMessages(lang);

  try {
    const shopId = parseInt(ctx.match[1], 10);

    // Validate shopId
    if (!Number.isInteger(shopId) || shopId <= 0) {
      await ctx.answerCbQuery(ctx.t('errors.invalidShopId'), { show_alert: true });
      return;
    }

    // Check authentication
    if (!ctx.session.token) {
      await ctx.answerCbQuery(generalMessages.authorizationRequired(lang), { show_alert: true });
      return;
    }

    // Check if already subscribed BEFORE attempting to subscribe
    const checkResult = await subscriptionApi.checkSubscription(shopId, ctx.session.token);

    if (checkResult.subscribed) {
      await ctx.answerCbQuery(buyerMessages.subscriptionAlreadyToast(lang));

      const counts = await resolveSectionCounts(shopId);

      await smartMessage.send(ctx, {
        text: buyerMessages.subscriptionActive(lang),
        keyboard: shopActionsKeyboard(shopId, true, counts, lang),
      });

      logger.info(`User ${ctx.from.id} already subscribed to shop ${shopId}`);
      return;
    }

    // Not subscribed - proceed with subscription (pass telegram_id for broadcast feature)
    await subscriptionApi.subscribe(shopId, ctx.session.token, ctx.from.id);

    // P2-1 FIX: Handle case when shop is deleted after subscription
    const shop = await shopApi.getShop(shopId);
    if (!shop) {
      await ctx.answerCbQuery(ctx.t('general.shopNotFound'), { show_alert: true });
      return;
    }

    const counts = await resolveSectionCounts(shopId);

    await ctx.answerCbQuery(generalMessages.done(lang));

    await smartMessage.send(ctx, {
      text: buyerMessages.subscriptionAdded(shop.name, lang),
      keyboard: shopActionsKeyboard(shopId, true, counts, lang),
    });

    logger.info(`User ${ctx.from.id} subscribed to shop ${shopId}`);
  } catch (error) {
    logger.error('Error subscribing to shop:', error);

    // Parse backend error message
    const errorMsg = error.response?.data?.error;

    if (errorMsg === 'Cannot subscribe to your own shop') {
      await ctx.answerCbQuery(buyerMessages.subscriptionOwnShop(lang), { show_alert: true });
    } else if (errorMsg === 'Already subscribed to this shop') {
      await ctx.answerCbQuery(buyerMessages.subscriptionAlreadyToast(lang), { show_alert: true });
    } else {
      await ctx.answerCbQuery(buyerMessages.subscriptionError(lang), { show_alert: true });
    }
  }
};

/**
 * Handle unsubscribe from shop
 */
const handleUnsubscribe = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { buyer: buyerMessages, general: generalMessages } = getMessages(lang);

  try {
    const shopId = parseInt(ctx.match[1], 10);

    // Validate shopId
    if (!Number.isInteger(shopId) || shopId <= 0) {
      await ctx.answerCbQuery(ctx.t('errors.invalidShopId'), { show_alert: true });
      return;
    }

    // Check authentication
    if (!ctx.session.token) {
      await ctx.answerCbQuery(generalMessages.authorizationRequired(lang), { show_alert: true });
      return;
    }

    // MEDIUM severity fix - move answerCbQuery AFTER API call to avoid double call
    await subscriptionApi.unsubscribe(shopId, ctx.session.token);

    const shop = await shopApi.getShop(shopId);
    const counts = await resolveSectionCounts(shopId);

    await ctx.answerCbQuery(generalMessages.done(lang));

    await smartMessage.send(ctx, {
      text: buyerMessages.subscriptionRemoved(shop.name, lang),
      keyboard: shopActionsKeyboard(shopId, false, counts, lang),
    });

    logger.info(`User ${ctx.from.id} unsubscribed from shop ${shopId}`);
  } catch (error) {
    logger.error('Error unsubscribing from shop:', error);
    await ctx.answerCbQuery(buyerMessages.unsubscribeError(lang), { show_alert: true });
  }
};

/**
 * Handle view orders
 */
const handleOrders = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { buyer: buyerMessages, general: generalMessages } = getMessages(lang);

  try {
    await ctx.answerCbQuery();

    // Check authentication
    if (!ctx.session.token) {
      await smartMessage.send(ctx, {
        text: generalMessages.authorizationRequired(lang),
        keyboard: buyerMenu(lang),
      });
      return;
    }

    // Get buyer orders
    const orders = await orderApi.getMyOrders(ctx.session.token);

    const message = orders.length
      ? `${buyerMessages.ordersTitle(orders.length, lang)}\n${formatters.orders(orders, lang)}`
      : buyerMessages.ordersEmpty(lang);

    await smartMessage.send(ctx, {
      text: message,
      keyboard: buyerMenu(lang),
    });
    logger.info(`User ${ctx.from.id} viewed orders (${orders.length} total)`);
  } catch (error) {
    logger.error('Error fetching orders:', error);
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed(lang),
      keyboard: buyerMenu(lang),
    });
  }
};

/**
 * Handle noop action (informational button)
 */
const handleNoop = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { buyer: buyerMessages } = getMessages(lang);

  try {
    await ctx.answerCbQuery(buyerMessages.subscriptionAlreadyToast(lang));
  } catch (error) {
    logger.error('Error in noop handler:', error);
  }
};

/**
 * Handle view shop details
 */
const handleShopView = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages } = getMessages(lang);

  try {
    const shopId = parseInt(ctx.match[1], 10);

    // Validate shopId
    if (!Number.isInteger(shopId) || shopId <= 0) {
      await ctx.answerCbQuery(ctx.t('errors.invalidShopId'), { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    // PERF: Fetch all data in parallel instead of sequential calls
    const [shop, products, isSubscribed] = await Promise.all([
      shopApi.getShop(shopId),
      productApi.getShopProducts(shopId),
      resolveSubscription(ctx, shopId),
    ]);

    // P2-2 FIX: Handle deleted shop
    if (!shop) {
      await smartMessage.send(ctx, {
        text: ctx.t('general.shopNotFound'),
        keyboard: buyerMenu(lang),
      });
      return;
    }

    const sectioned = splitProductsByAvailability(products);
    const message = buildShopInfoMessage(shop, sectioned);

    await smartMessage.send(ctx, {
      text: message,
      keyboard: shopActionsKeyboard(shopId, isSubscribed, {
        stock: sectioned.stock.length,
        preorder: sectioned.preorder.length,
      }, lang),
    });

    logger.info(`User ${ctx.from.id} viewed shop ${shopId} details`);
  } catch (error) {
    logger.error('Error viewing shop:', error);

    // P2-2 FIX: Answer callback query to remove spinner
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery(ctx.t('errors.loadError')).catch(() => {});
    }

    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed(lang),
      keyboard: buyerMenu(lang),
    });
  }
};

const handleShopStock = async (ctx) => handleShopSection(ctx, 'stock');
const handleShopPreorder = async (ctx) => handleShopSection(ctx, 'preorder');

const handleShopSection = async (ctx, section) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages } = getMessages(lang);

  try {
    const shopId = parseInt(ctx.match[1], 10);

    // Validate shopId
    if (!Number.isInteger(shopId) || shopId <= 0) {
      await ctx.answerCbQuery(ctx.t('errors.invalidShopId'), { show_alert: true });
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
      }, lang),
    });

    logger.info(`User ${ctx.from.id} viewed section ${section} for shop ${shopId}`);
  } catch (error) {
    logger.error('Error viewing shop section:', error);

    // P2-2 FIX: Answer callback query to remove spinner
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery(ctx.t('errors.loadError')).catch(() => {});
    }

    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed(lang),
      keyboard: buyerMenu(lang),
    });
  }
};
