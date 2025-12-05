import { Markup } from 'telegraf';
import { sellerMenu, sellerMenuNoShop, sellerToolsMenu } from '../../keyboards/seller.js';
import { manageWorkersMenu, confirmWorkerRemoval } from '../../keyboards/workspace.js';
import { shopApi, authApi, orderApi, workerApi, followApi } from '../../utils/api.js';
import logger from '../../utils/logger.js';
import { messages } from '../../texts/messages.js';
import { t } from '../../i18n/index.js';
import { checkShopHealth } from '../../utils/shopHealthCheck.js';
import { getTipForShop } from '../../utils/sellerTips.js';
import {
  handleActiveOrders,
  handleOrderHistory,
  handleMarkShipped,
  handleMarkDelivered,
  handleCancelOrder,
  handleOrderHistoryPage,
  handleOrderStats,
  handleOrderSearch,
  handleOrderExport,
  handleOrderHistoryJump,
} from './orders.js';
import { showSellerToolsMenu } from '../../utils/sellerNavigation.js';
import { validateShopBeforeScene } from '../../utils/sceneValidation.js';

const { seller: sellerMessages } = messages;

/**
 * Get language with fallback (C5 fix: ctx.lang undefined)
 */
const getLangSafe = (ctx) => ctx.lang || ctx.session?.language || 'ru';

/**
 * Get seller menu with active orders count
 * @returns {Object} { menu, tokenExpired } - menu keyboard and token expiration flag
 */
const getSellerMenu = async (ctx) => {
  let activeCount = 0;
  let hasFollows = false;
  let tokenExpired = false;

  const shopId = ctx.session.shopId;
  const token = ctx.session.token;

  if (shopId) {
    try {
      const [countResult, followsResult] = await Promise.all([
        // Active orders count requires token (user-specific data)
        token
          ? orderApi.getActiveOrdersCount(shopId, token).catch((error) => {
              logger.error('Failed to get active orders count:', error);
              // STABILITY FIX #1: Track token expiration
              if (error.response?.status === 401) {
                return { count: 0, tokenExpired: true };
              }
              return { count: 0, tokenExpired: false };
            })
          : Promise.resolve({ count: 0, tokenExpired: false }),
        // Follows list - use HTTP API with token
        token
          ? followApi.getMyFollows(shopId, token).catch((error) => {
              // STABILITY FIX #1: Track token expiration for re-auth message
              if (error.response?.status === 401) {
                logger.debug('Token expired or user not authenticated for follows menu');
                return { follows: [], tokenExpired: true };
              }
              logger.error('Failed to get follows for menu:', error);
              return { follows: [], tokenExpired: false };
            })
          : Promise.resolve({ follows: [], tokenExpired: false }),
      ]);

      // Handle both old format (number/array) and new format (object with tokenExpired)
      if (typeof countResult === 'object' && 'count' in countResult) {
        activeCount = countResult.count || 0;
        tokenExpired = tokenExpired || countResult.tokenExpired;
      } else {
        activeCount = countResult || 0;
      }

      if (typeof followsResult === 'object' && 'follows' in followsResult) {
        hasFollows = Array.isArray(followsResult.follows) && followsResult.follows.length > 0;
        tokenExpired = tokenExpired || followsResult.tokenExpired;
      } else {
        hasFollows = Array.isArray(followsResult) && followsResult.length > 0;
      }
    } catch (error) {
      logger.error('Failed to compose seller menu data:', error);
      // Ensure values are set
      activeCount = 0;
      hasFollows = false;
    }
  }

  ctx.session.hasFollows = hasFollows;
  
  // STABILITY FIX #1: Return both menu and tokenExpired flag
  return { menu: sellerMenu(activeCount, { hasFollows }, getLangSafe(ctx)), tokenExpired };
};

/**
 * Helper to get just the menu keyboard (backward compatible)
 * For places that only need the keyboard without tokenExpired check
 */
const getSellerMenuKeyboard = async (ctx) => {
  const result = await getSellerMenu(ctx);
  return result.menu;
};

const getWorkerDisplayName = (worker) => {
  if (worker.username) {
    return `@${worker.username}`;
  }
  if (worker.first_name) {
    return worker.last_name ? `${worker.first_name} ${worker.last_name}` : worker.first_name;
  }
  if (worker.telegram_id) {
    return `ID:${worker.telegram_id}`;
  }
  return `User#${worker.user_id}`;
};

const buildWorkersListKeyboard = (workers, lang = 'ru') => {
  const buttons = workers.map((worker) => [
    Markup.button.callback(getWorkerDisplayName(worker), `workers:remove:${worker.id}`),
  ]);

  buttons.push([Markup.button.callback(t('buttons.addWorker', {}, lang), 'workers:add')]);
  buttons.push([Markup.button.callback(t('buttons.back', {}, lang), 'seller:workers')]);

  return Markup.inlineKeyboard(buttons);
};

const showWorkersList = async (ctx, options = {}) => {
  const lang = getLangSafe(ctx);
  const shopName = ctx.session.shopName || t('general.shop', {}, lang);
  const successPrefix = options.successMessage ? `${options.successMessage}\n\n` : '';

  try {
    const workers = await workerApi.listWorkers(ctx.session.shopId, ctx.session.token);
    ctx.session.workerList = workers;

    if (!Array.isArray(workers) || workers.length === 0) {
      await ctx.reply(
        `${successPrefix}${ctx.t('seller.noWorkers', { shop: shopName })}`,
        manageWorkersMenu(lang)
      );
      return;
    }

    const lines = workers.map((worker) => `- ${getWorkerDisplayName(worker)}`).join('\n');
    const header = ctx.t('seller.workersListTitle', { shop: shopName });
    const instruction = ctx.t('seller.workersListInstruction');
    await ctx.reply(
      `${successPrefix}${header}\n\n${instruction}\n${lines}`,
      buildWorkersListKeyboard(workers, lang)
    );
  } catch (error) {
    logger.error('Error fetching workers:', error);
    await ctx.reply(ctx.t('general.actionFailed'), manageWorkersMenu(lang));
  }
};

const formatSubscriptionStatus = (ctx, data) => {
  const tier = data.tier || 'pro';
  const status = data.status || (data.currentSubscription ? 'active' : 'inactive');
  const lang = getLangSafe(ctx);

  // Prepare expiresAt date
  const dateSource =
    data.nextPaymentDue || data.periodEnd || data.currentSubscription?.period_end || null;

  // Use detailed messages based on tier (PRO or MAX)
  if (tier === 'pro') {
    return t(
      'seller.subscriptionProInfo',
      {
        status,
        renewDate: dateSource,
      },
      lang
    );
  }

  if (tier === 'max') {
    return t(
      'seller.subscriptionMaxInfo',
      {
        status,
        renewDate: dateSource,
      },
      lang
    );
  }

  // Fallback for unknown tier - use i18n
  const fallbackDate = dateSource ? new Date(dateSource).toLocaleDateString() : '—';
  return t(
    'seller.subscriptionFallback',
    { tier: tier.toUpperCase(), status, date: fallbackDate },
    lang
  );
};

const buildSubscriptionKeyboard = (data, lang = 'ru') => {
  const buttons = [];
  const status = data.status || (data.currentSubscription ? 'active' : 'inactive');

  if (!data.currentSubscription || ['inactive', 'grace_period', 'past_due'].includes(status)) {
    buttons.push([Markup.button.callback(t('buttons.paySubscription', {}, lang), 'subscription:pay')]);
  }

  if (data.tier === 'pro') {
    buttons.push([Markup.button.callback(t('buttons.upgradeToMax', {}, lang), 'subscription:upgrade')]);
  }

  buttons.push([Markup.button.callback(t('buttons.backToMenu', {}, lang), 'seller:menu')]);
  return Markup.inlineKeyboard(buttons);
};

// Export follows handlers
export * from './follows.js';

// Export getSellerMenu helper for use in other seller modules
// Export both full getSellerMenu (returns {menu, tokenExpired}) and keyboard-only helper
export { getSellerMenu, getSellerMenuKeyboard };

/**
 * Handle seller role selection
 * @param {Object} ctx - Telegraf context
 * @param {Object} options - Options
 * @param {boolean} options.skipRoleUpdate - Skip PATCH /auth/role (already called by caller)
 */
export const handleSellerRole = async (ctx, options = {}) => {
  try {
    // M12 FIX: Only answer callback query if this is actually a callback query
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    ctx.session.role = 'seller';
    logger.info(`User ${ctx.from.id} selected seller role`);

    // NOTE: Role is saved to DB only if user has a shop
    // This prevents the bug where user selects "seller", cancels shop creation,
    // but webapp still shows seller UI because role was saved to DB
    // skipRoleUpdate is passed when caller already handled role save logic

    if (!ctx.session.token) {
      logger.warn(`User ${ctx.from.id} has no token, cannot check shop`);
      ctx.session.shopId = null;
      ctx.session.shopName = null;
      ctx.session.shopTier = null;
      await ctx.reply(t('seller.noShop', {}, getLangSafe(ctx)), sellerMenuNoShop(getLangSafe(ctx)));
      return;
    }

    try {
      const shops = await shopApi.getMyShop(ctx.session.token);

      logger.debug('Fetched user shops:', {
        userId: ctx.from.id,
        isArray: Array.isArray(shops),
        shopsCount: Array.isArray(shops) ? shops.length : 'not array',
      });

      if (Array.isArray(shops) && shops.length > 0) {
        const shop = shops[0];
        ctx.session.shopId = shop.id;
        ctx.session.shopName = shop.name;
        ctx.session.shopTier = shop.tier;

        logger.info('User shop loaded:', {
          userId: ctx.from.id,
          shopId: shop.id,
          shopName: shop.name,
        });

        // PERF: Fetch all data in parallel instead of sequential calls
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);

        const [analyticsResult, activeCountResult, followsResult, shopHealth] = await Promise.all([
          // Analytics for 7 days
          orderApi.getAnalytics(
            shop.id,
            weekAgo.toISOString().split('T')[0],
            today.toISOString().split('T')[0],
            ctx.session.token
          ).catch((error) => {
            logger.error('Failed to get week analytics:', error);
            return null;
          }),
          // Active orders count
          orderApi.getActiveOrdersCount(shop.id, ctx.session.token).catch((error) => {
            logger.error('Failed to get active orders count:', error);
            return 0;
          }),
          // Follows list
          followApi.getMyFollows(shop.id, ctx.session.token).catch((error) => {
            if (error.response?.status === 401) {
              logger.debug('Token expired or user not authenticated, showing menu without follows');
            } else {
              logger.error('Failed to get follows list for seller menu:', error);
            }
            return [];
          }),
          // Shop health check
          checkShopHealth(shop.id, ctx.session.token).catch((error) => {
            logger.error('Failed to check shop health:', error);
            return null;
          }),
        ]);

        const weekRevenue = analyticsResult?.summary?.totalRevenue || 0;
        const activeCount = activeCountResult || 0;
        const hasFollows = Array.isArray(followsResult) && followsResult.length > 0;
        ctx.session.hasFollows = hasFollows;

        // H9 FIX: Get tip or warning (with null check)
        const statusBar = shopHealth ? getTipForShop(ctx, shopHealth) : '';

        // Format header with analytics and status bar
        const header = sellerMessages.shopPanelWithStats(
          shop.name,
          weekRevenue,
          activeCount,
          statusBar,
          getLangSafe(ctx)
        );

        await ctx.reply(header, sellerMenu(activeCount, { hasFollows }, getLangSafe(ctx)));
        return;
      }

      logger.info(`User ${ctx.from.id} has no shops, showing create shop menu`);
      ctx.session.shopId = null;
      ctx.session.shopName = null;
      ctx.session.shopTier = null;
      await ctx.reply(t('seller.noShop', {}, getLangSafe(ctx)), sellerMenuNoShop(getLangSafe(ctx)));
    } catch (error) {
      logger.error('Error checking shop:', error);

      // ✅ P2-3 FIX: Clear shop data but keep role='seller'
      // (user can be seller without shop - shows create shop menu)
      ctx.session.shopId = null;
      ctx.session.shopName = null;
      ctx.session.shopTier = null;
      // ctx.session.role remains 'seller' - this is intentional

      const message =
        error.response?.status === 404 || error.response?.status === 401
          ? t('seller.noShop', {}, getLangSafe(ctx))
          : t('general.actionFailed', {}, getLangSafe(ctx));

      await ctx.reply(message, sellerMenuNoShop(getLangSafe(ctx)));
    }
  } catch (error) {
    logger.error('Error in seller role handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.reply(t('general.actionFailed', {}, getLangSafe(ctx)), sellerMenuNoShop(getLangSafe(ctx)));
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle create shop action
 */
const handleCreateShop = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Enter chooseTier scene first (user selects tier before creating shop)
    await ctx.scene.enter('chooseTier');
  } catch (error) {
    logger.error('Error entering chooseTier scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.reply(t('general.actionFailed', {}, getLangSafe(ctx)), sellerMenuNoShop(getLangSafe(ctx)));
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle add product action
 * P2-9 FIX: Validate shop existence before entering scene
 */
const handleAddProduct = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // P2-9 FIX: Validate shop exists in database
    const isValid = await validateShopBeforeScene(ctx, 'addProduct');
    if (!isValid) return;

    // Enter addProduct scene
    await ctx.scene.enter('addProduct');
  } catch (error) {
    logger.error('Error entering addProduct scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(ctx.t('general.actionFailed'), menu);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle manage wallets action
 * P2-9 FIX: Validate shop existence before entering scene
 */
const handleWallets = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // P2-9 FIX: Validate shop exists in database
    const isValid = await validateShopBeforeScene(ctx, 'manageWallets');
    if (!isValid) return;

    // Enter manageWallets scene
    await ctx.scene.enter('manageWallets');
  } catch (error) {
    logger.error('Error entering manageWallets scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(ctx.t('general.actionFailed'), menu);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle invite link - show copyable link for sharing
 */
const handleInviteLink = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.reply(ctx.t('general.shopRequired'), sellerMenuNoShop(getLangSafe(ctx)));
      return;
    }

    const shopId = ctx.session.shopId;
    const botUsername = process.env.BOT_USERNAME || 'saveropus_bot';
    const lang = getLangSafe(ctx);

    // Build invite link message with copyable link
    const title = t('inviteLink.title', {}, lang);
    const description = t('inviteLink.description', {}, lang);
    const copyHint = t('inviteLink.copyHint', {}, lang);
    const link = `https://t.me/${botUsername}?start=shop_${shopId}`;

    const message = `${title}\n\n${description}\n\n${copyHint}\n<code>${link}</code>`;

    await ctx.replyWithHTML(message, sellerToolsMenu(ctx.session.isShopOwner ?? false, lang));

    logger.info(`User ${ctx.from.id} viewed invite link for shop ${shopId}`);
  } catch (error) {
    logger.error('Error in invite link handler:', error);
    try {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(ctx.t('general.actionFailed'), menu);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Setup seller-related handlers
 */
export const setupSellerHandlers = (bot) => {
  // Seller role selected
  bot.action('role:seller', handleSellerRole);

  // Create shop action
  bot.action('seller:create_shop', handleCreateShop);

  // Add product action
  bot.action('seller:add_product', handleAddProduct);

  // Active orders management
  bot.action('seller:active_orders', handleActiveOrders);
  // P2-9 FIX: Validate shop before entering markOrdersShipped scene
  bot.action('seller:mark_shipped', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      // P2-9 FIX: Validate shop exists in database
      const isValid = await validateShopBeforeScene(ctx, 'markOrdersShipped');
      if (!isValid) return;

      await ctx.scene.enter('markOrdersShipped');
    } catch (error) {
      logger.error('Error entering markOrdersShipped scene:', error);
      await ctx.reply(ctx.t('general.actionFailed'), await getSellerMenuKeyboard(ctx));
    }
  });
  bot.action(/^order:ship:(\d+)$/, handleMarkShipped);
  bot.action(/^order:deliver:(\d+)$/, handleMarkDelivered);
  bot.action(/^order:cancel:(\d+)$/, handleCancelOrder);

  // Order history (renamed from sales)
  bot.action('seller:order_history', (ctx) => handleOrderHistory(ctx, 1));

  // Order history pagination
  bot.action(/seller:order_history:(\d+)/, handleOrderHistoryPage);

  // Order history features (placeholders)
  bot.action('seller:order_history:jump', handleOrderHistoryJump);
  bot.action('seller:order_stats', handleOrderStats);
  bot.action('seller:order_search', handleOrderSearch);
  bot.action('seller:order_export', handleOrderExport);

  // Manage wallets
  bot.action('seller:wallets', handleWallets);

  // Workers management
  bot.action('seller:workers', handleWorkers);
  bot.action('workers:add', handleWorkersAdd);
  bot.action('workers:list', handleWorkersList);
  bot.action(/^workers:remove:(\d+)$/, handleWorkerRemove);
  bot.action(/^workers:remove:confirm:(\d+)$/, handleWorkerRemoveConfirm);

  // P2-9 FIX: Validate shop before entering migrate_channel scene
  bot.action('seller:migrate_channel', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      // P2-9 FIX: Validate shop exists in database
      const isValid = await validateShopBeforeScene(ctx, 'migrate_channel');
      if (!isValid) return;

      // Check ownership (only owner can migrate channel)
      let isOwner = ctx.session.isShopOwner;
      if (typeof isOwner !== 'boolean') {
        try {
          const shopResponse = await shopApi.getShop(ctx.session.shopId, ctx.session.token);
          isOwner = shopResponse?.owner_id === ctx.session.userId;
          if (shopResponse?.tier) {
            ctx.session.shopTier = shopResponse.tier;
          }
          ctx.session.isShopOwner = isOwner;
        } catch (error) {
          logger.error('Failed to verify ownership for migrate_channel:', error);
          isOwner = false;
        }
      }

      if (!isOwner) {
        await ctx.reply(
          ctx.t('seller.migration.accessDenied'),
          sellerToolsMenu(false, getLangSafe(ctx))
        );
        return;
      }

      await ctx.scene.enter('migrate_channel');
    } catch (error) {
      logger.error('Error entering migrate_channel scene:', error);
      await ctx.reply(
        ctx.t('general.actionFailed'),
        sellerToolsMenu(ctx.session.isShopOwner ?? false, getLangSafe(ctx))
      );
    }
  });

  // Channel migration (PRO feature)
  // Subscription management
  // P2-9 FIX: Validate shop before entering pay_subscription scene
  bot.action('subscription:pay', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      // P2-9 FIX: Validate shop exists in database
      const isValid = await validateShopBeforeScene(ctx, 'pay_subscription');
      if (!isValid) return;

      await ctx.scene.enter('pay_subscription');
    } catch (error) {
      logger.error('Error entering pay_subscription scene:', error);
      await ctx.reply(ctx.t('general.actionFailed'), await getSellerMenuKeyboard(ctx));
    }
  });

  // P2-9 FIX: Validate shop before entering upgrade_shop scene
  bot.action('subscription:upgrade', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      // P2-9 FIX: Validate shop exists in database
      const isValid = await validateShopBeforeScene(ctx, 'upgrade_shop');
      if (!isValid) return;

      await ctx.scene.enter('upgrade_shop');
    } catch (error) {
      logger.error('Error entering upgrade_shop scene:', error);
      await ctx.reply(ctx.t('general.actionFailed'), await getSellerMenuKeyboard(ctx));
    }
  });

  bot.action('subscription:status', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId) {
        await ctx.reply(ctx.t('general.shopRequired'), sellerMenuNoShop);
        return;
      }

      if (!ctx.session.token) {
        await ctx.reply(
          ctx.t('general.authorizationRequired'),
          sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, getLangSafe(ctx))
        );
        return;
      }

      const api = await import('../../utils/api.js');
      const response = await api.default.get(`/subscriptions/status/${ctx.session.shopId}`, {
        headers: { Authorization: `Bearer ${ctx.session.token}` },
      });

      const status = response.data;
      const message = formatSubscriptionStatus(ctx, status);

      await ctx.reply(message, buildSubscriptionKeyboard(status, getLangSafe(ctx)));

      logger.info(`User ${ctx.from.id} viewed subscription status`);
    } catch (error) {
      logger.error('Error fetching subscription status:', error);
      await ctx.reply(
        ctx.t('seller.subscriptionStatusError'),
        sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, getLangSafe(ctx))
      );
    }
  });

  // Tools Submenu - advanced features (Wallets, Follows, Workers)
  bot.action('seller:tools', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId || !ctx.session.token) {
        const menu = await getSellerMenuKeyboard(ctx);
        await ctx.reply(ctx.t('general.authorizationRequired'), menu);
        return;
      }

      // Check if user is shop owner
      const shopResponse = await shopApi.getShop(ctx.session.shopId, ctx.session.token);
      const isOwner = shopResponse.owner_id === ctx.session.userId;
      if (shopResponse?.tier) {
        ctx.session.shopTier = shopResponse.tier;
      }
      ctx.session.isShopOwner = isOwner;

      await showSellerToolsMenu(ctx, isOwner);

      logger.info(`User ${ctx.from.id} opened tools submenu`);
    } catch (error) {
      logger.error('Error in tools submenu handler:', error);
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(ctx.t('seller.toolsError'), menu);
    }
  });

  // Invite link - show copyable link for sharing
  bot.action('seller:invite_link', handleInviteLink);

  // Back to seller menu
  bot.action('seller:main', handleSellerRole);
  bot.action('seller:menu', handleSellerRole);
};

/**
 * Handle workers management menu
 */
const handleWorkers = async (ctx) => {
  await ctx.answerCbQuery();

  try {
    if (!ctx.session.shopId) {
      await ctx.reply(ctx.t('general.shopRequired'), sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(ctx.t('general.authorizationRequired'), menu);
      return;
    }

    let shopTier = ctx.session.shopTier;

    if (!shopTier) {
      try {
        const shopDetails = await shopApi.getShop(ctx.session.shopId, ctx.session.token);
        shopTier = shopDetails?.tier || null;
        if (shopDetails?.tier) {
          ctx.session.shopTier = shopDetails.tier;
        }

        if (shopDetails?.owner_id && shopDetails.owner_id !== ctx.session.userId) {
          const menu = await getSellerMenuKeyboard(ctx);
          await ctx.reply(ctx.t('seller.workersOwnerOnly'), menu);
          return;
        }
      } catch (error) {
        logger.error('Failed to load shop details for workers menu:', error);
        const menu = await getSellerMenuKeyboard(ctx);
        await ctx.reply(ctx.t('general.actionFailed'), menu);
        return;
      }
    }

    if (shopTier !== 'max') {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(ctx.t('seller.workersMaxOnly'), menu);
      return;
    }

    const shopName = ctx.session.shopName || ctx.t('general.shopFallbackName');
    await ctx.reply(ctx.t('seller.workersMenuIntro', { shop: shopName }), manageWorkersMenu(getLangSafe(ctx)));

    logger.info(`User ${ctx.from.id} opened workers management`);
  } catch (error) {
    logger.error('Error in workers menu handler:', error);

    try {
      const menu = await getSellerMenuKeyboard(ctx);
      // Edit message instead of reply (does not create new message)
      await ctx.editMessageText(ctx.t('general.actionFailed'), menu);
    } catch (editError) {
      // Fallback if edit failed (e.g., message deleted)
      // Check if callback query was already answered
      if (!ctx.callbackQuery?.answered) {
        logger.debug('Failed to edit message, using reply fallback:', editError.message);
        const menu = await getSellerMenuKeyboard(ctx);
        await ctx.reply(ctx.t('general.actionFailed'), menu);
      }
    }
  }
};

/**
 * Handle add worker action
 * P2-9 FIX: Validate shop existence before entering scene
 */
const handleWorkersAdd = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // P2-9 FIX: Validate shop exists in database
    const isValid = await validateShopBeforeScene(ctx, 'manageWorkers');
    if (!isValid) return;

    // Enter manageWorkers scene
    await ctx.scene.enter('manageWorkers');
  } catch (error) {
    logger.error('Error entering manageWorkers scene:', error);
    await ctx.reply(ctx.t('general.actionFailed'), manageWorkersMenu(getLangSafe(ctx)));
  }
};

/**
 * Handle list workers action
 */
const handleWorkersList = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.reply(ctx.t('general.shopRequired'), sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      await ctx.reply(ctx.t('general.authorizationRequired'), manageWorkersMenu(getLangSafe(ctx)));
      return;
    }
    await showWorkersList(ctx);

    const workerCount = Array.isArray(ctx.session.workerList) ? ctx.session.workerList.length : 0;
    logger.info(`User ${ctx.from.id} viewed workers list (${workerCount} total)`);
  } catch (error) {
    logger.error('Error fetching workers:', error);
    await ctx.reply(ctx.t('general.actionFailed'), manageWorkersMenu(getLangSafe(ctx)));
  }
};

/**
 * Handle remove worker action
 * SECURITY FIX: Only shop owner can remove workers
 */
const handleWorkerRemove = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.reply(ctx.t('general.shopRequired'), sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(ctx.t('general.authorizationRequired'), menu);
      return;
    }

    // SECURITY FIX: Only shop owner can remove workers
    if (!ctx.session.isShopOwner) {
      await ctx.reply(ctx.t('seller.workersOwnerOnly'), manageWorkersMenu(getLangSafe(ctx)));
      return;
    }

    const workerId = Number.parseInt(ctx.match[1], 10);
    if (!Number.isInteger(workerId) || workerId <= 0) {
      await ctx.answerCbQuery(ctx.t('seller.workerSelectionInvalid'));
      return;
    }

    let workers = Array.isArray(ctx.session.workerList) ? ctx.session.workerList : [];
    let worker = workers.find((w) => w.id === workerId);

    if (!worker) {
      workers = await workerApi.listWorkers(ctx.session.shopId, ctx.session.token);
      ctx.session.workerList = workers;
      worker = workers.find((w) => w.id === workerId);
    }

    if (!worker) {
      await ctx.answerCbQuery(ctx.t('seller.workerNotFound'));
      await showWorkersList(ctx);
      return;
    }

    const name = getWorkerDisplayName(worker);
    await ctx.reply(
      ctx.t('seller.workerRemoveConfirm', { name }),
      confirmWorkerRemoval(workerId, getLangSafe(ctx))
    );
  } catch (error) {
    logger.error('Error in worker remove handler:', error);
    await ctx.answerCbQuery(ctx.t('general.actionFailed'));
  }
};

/**
 * Handle confirm worker removal
 * SECURITY FIX: Only shop owner can remove workers
 */
const handleWorkerRemoveConfirm = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.reply(ctx.t('general.shopRequired'), sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(ctx.t('general.authorizationRequired'), menu);
      return;
    }

    // SECURITY FIX: Only shop owner can remove workers
    if (!ctx.session.isShopOwner) {
      await ctx.reply(ctx.t('seller.workersOwnerOnly'), manageWorkersMenu(getLangSafe(ctx)));
      return;
    }

    const workerId = Number.parseInt(ctx.match[1], 10);
    if (!Number.isInteger(workerId) || workerId <= 0) {
      await ctx.answerCbQuery(ctx.t('seller.workerSelectionInvalid'));
      return;
    }

    await workerApi.removeWorker(ctx.session.shopId, workerId, ctx.session.token);

    if (Array.isArray(ctx.session.workerList)) {
      ctx.session.workerList = ctx.session.workerList.filter((worker) => worker.id !== workerId);
    }

    logger.info(`User ${ctx.from.id} removed worker ${workerId}`);

    await showWorkersList(ctx, { successMessage: ctx.t('seller.workerRemoved') });
  } catch (error) {
    logger.error('Error in worker remove confirm handler:', error);
    const backendMessage = error.response?.data?.error;
    const message = backendMessage || ctx.t('seller.workerRemoveError');

    await ctx.reply(message, manageWorkersMenu(getLangSafe(ctx)));
  }
};
