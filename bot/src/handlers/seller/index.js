import { Markup } from 'telegraf';
import { sellerMenu, sellerMenuNoShop, sellerToolsMenu } from '../../keyboards/seller.js';
import { manageWorkersMenu, confirmWorkerRemoval } from '../../keyboards/workspace.js';
import { shopApi, authApi, orderApi, workerApi, followApi } from '../../utils/api.js';
import logger from '../../utils/logger.js';
import { messages, buttons as buttonText } from '../../texts/messages.js';
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

const { seller: sellerMessages, general: generalMessages } = messages;

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
      // Гарантия что значения установлены
      activeCount = 0;
      hasFollows = false;
    }
  }

  ctx.session.hasFollows = hasFollows;
  
  // STABILITY FIX #1: Return both menu and tokenExpired flag
  return { menu: sellerMenu(activeCount, { hasFollows }, ctx.lang), tokenExpired };
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

const buildWorkersListKeyboard = (workers) => {
  const buttons = workers.map((worker) => [
    Markup.button.callback(getWorkerDisplayName(worker), `workers:remove:${worker.id}`),
  ]);

  buttons.push([Markup.button.callback(buttonText.addWorker, 'workers:add')]);
  buttons.push([Markup.button.callback(buttonText.back, 'seller:workers')]);

  return Markup.inlineKeyboard(buttons);
};

const showWorkersList = async (ctx, options = {}) => {
  const shopName = ctx.session.shopName || 'Магазин';
  const successPrefix = options.successMessage ? `${options.successMessage}\n\n` : '';

  try {
    const workers = await workerApi.listWorkers(ctx.session.shopId, ctx.session.token);
    ctx.session.workerList = workers;

    if (!Array.isArray(workers) || workers.length === 0) {
      await ctx.reply(`${successPrefix}${sellerMessages.noWorkers(shopName)}`, manageWorkersMenu());
      return;
    }

    const lines = workers.map((worker) => `- ${getWorkerDisplayName(worker)}`).join('\n');
    const header = sellerMessages.workersListTitle(shopName);
    const instruction = sellerMessages.workersListInstruction;
    await ctx.reply(
      `${successPrefix}${header}\n\n${instruction}\n${lines}`,
      buildWorkersListKeyboard(workers)
    );
  } catch (error) {
    logger.error('Error fetching workers:', error);
    await ctx.reply(generalMessages.actionFailed, manageWorkersMenu());
  }
};

const formatSubscriptionStatus = (data) => {
  const tier = data.tier || 'pro';
  const status = data.status || (data.currentSubscription ? 'active' : 'inactive');

  // Prepare expiresAt date
  const dateSource =
    data.nextPaymentDue || data.periodEnd || data.currentSubscription?.period_end || null;

  // Use detailed messages based on tier (PRO or MAX)
  if (tier === 'pro') {
    return sellerMessages.subscriptionProInfo({ status, renewDate: dateSource });
  }

  if (tier === 'max') {
    return sellerMessages.subscriptionMaxInfo({ status, renewDate: dateSource });
  }

  // Fallback for unknown tier
  const fallbackDate = dateSource ? new Date(dateSource).toLocaleDateString('ru-RU') : '—';
  return `Тариф: ${tier.toUpperCase()}\nСтатус: ${status}\nДействителен до: ${fallbackDate}`;
};

const buildSubscriptionKeyboard = (data) => {
  const buttons = [];
  const status = data.status || (data.currentSubscription ? 'active' : 'inactive');

  if (!data.currentSubscription || ['inactive', 'grace_period', 'past_due'].includes(status)) {
    buttons.push([Markup.button.callback(buttonText.paySubscription, 'subscription:pay')]);
  }

  if (data.tier === 'pro') {
    buttons.push([Markup.button.callback(buttonText.upgradeToMax, 'subscription:upgrade')]);
  }

  buttons.push([Markup.button.callback(buttonText.backToMenu, 'seller:menu')]);
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

    // PERF: Skip role update if already done by caller (e.g., handleRoleSeller)
    if (!options.skipRoleUpdate) {
      try {
        if (ctx.session.token) {
          await authApi.updateRole('seller', ctx.session.token);
          if (ctx.session.user) {
            ctx.session.user.selectedRole = 'seller'; // Update session cache
          }
          logger.info(`Saved seller role for user ${ctx.from.id}`);
        }
      } catch (error) {
        logger.error('Failed to save role:', error);
      }
    } else {
      // Just update session cache
      if (ctx.session.user) {
        ctx.session.user.selectedRole = 'seller';
      }
    }

    if (!ctx.session.token) {
      logger.warn(`User ${ctx.from.id} has no token, cannot check shop`);
      ctx.session.shopId = null;
      ctx.session.shopName = null;
      ctx.session.shopTier = null;
      await ctx.reply(t('seller.noShop', {}, ctx.lang), sellerMenuNoShop(ctx.lang));
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
          checkShopHealth(shop.id, ctx.session.token),
        ]);

        const weekRevenue = analyticsResult?.summary?.totalRevenue || 0;
        const activeCount = activeCountResult || 0;
        const hasFollows = Array.isArray(followsResult) && followsResult.length > 0;
        ctx.session.hasFollows = hasFollows;

        // Получить совет или предупреждение
        const statusBar = getTipForShop(ctx, shopHealth);

        // Форматировать заголовок с аналитикой и статус-баром
        const header = sellerMessages.shopPanelWithStats(
          shop.name,
          weekRevenue,
          activeCount,
          statusBar,
          ctx.lang
        );

        await ctx.reply(header, sellerMenu(activeCount, { hasFollows }, ctx.lang));
        return;
      }

      logger.info(`User ${ctx.from.id} has no shops, showing create shop menu`);
      ctx.session.shopId = null;
      ctx.session.shopName = null;
      ctx.session.shopTier = null;
      await ctx.reply(t('seller.noShop', {}, ctx.lang), sellerMenuNoShop(ctx.lang));
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
          ? t('seller.noShop', {}, ctx.lang)
          : t('general.actionFailed', {}, ctx.lang);

      await ctx.reply(message, sellerMenuNoShop(ctx.lang));
    }
  } catch (error) {
    logger.error('Error in seller role handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.reply(t('general.actionFailed', {}, ctx.lang), sellerMenuNoShop(ctx.lang));
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
      await ctx.reply(t('general.actionFailed', {}, ctx.lang), sellerMenuNoShop(ctx.lang));
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
      await ctx.reply(generalMessages.actionFailed, menu);
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
      await ctx.reply(generalMessages.actionFailed, menu);
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
      await ctx.reply(generalMessages.shopRequired, sellerMenuNoShop(ctx.lang));
      return;
    }

    const shopId = ctx.session.shopId;
    const botUsername = process.env.BOT_USERNAME || 'SellStatusBot';
    const lang = ctx.lang || 'ru';

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
      await ctx.reply(generalMessages.actionFailed, menu);
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
      await ctx.reply(generalMessages.actionFailed, await getSellerMenuKeyboard(ctx));
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
          isOwner = shopResponse?.owner_id === ctx.session.user?.id;
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
        await ctx.reply(sellerMessages.migration.accessDenied, sellerToolsMenu(false, ctx.lang));
        return;
      }

      await ctx.scene.enter('migrate_channel');
    } catch (error) {
      logger.error('Error entering migrate_channel scene:', error);
      await ctx.reply(
        generalMessages.actionFailed,
        sellerToolsMenu(ctx.session.isShopOwner ?? false, ctx.lang)
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
      await ctx.reply(generalMessages.actionFailed, await getSellerMenuKeyboard(ctx));
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
      await ctx.reply(generalMessages.actionFailed, await getSellerMenuKeyboard(ctx));
    }
  });

  bot.action('subscription:status', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId) {
        await ctx.reply(generalMessages.shopRequired, sellerMenuNoShop);
        return;
      }

      if (!ctx.session.token) {
        await ctx.reply(
          generalMessages.authorizationRequired,
          sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, ctx.lang)
        );
        return;
      }

      const api = await import('../../utils/api.js');
      const response = await api.default.get(`/subscriptions/status/${ctx.session.shopId}`, {
        headers: { Authorization: `Bearer ${ctx.session.token}` },
      });

      const status = response.data;
      const message = formatSubscriptionStatus(status);

      await ctx.reply(message, buildSubscriptionKeyboard(status));

      logger.info(`User ${ctx.from.id} viewed subscription status`);
    } catch (error) {
      logger.error('Error fetching subscription status:', error);
      await ctx.reply(
        sellerMessages.subscriptionStatusError,
        sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, ctx.lang)
      );
    }
  });

  // Tools Submenu - advanced features (Wallets, Follows, Workers)
  bot.action('seller:tools', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId || !ctx.session.token) {
        const menu = await getSellerMenuKeyboard(ctx);
        await ctx.reply(generalMessages.authorizationRequired, menu);
        return;
      }

      // Check if user is shop owner
      const shopResponse = await shopApi.getShop(ctx.session.shopId, ctx.session.token);
      const isOwner = shopResponse.owner_id === ctx.session.user?.id;
      if (shopResponse?.tier) {
        ctx.session.shopTier = shopResponse.tier;
      }
      ctx.session.isShopOwner = isOwner;

      await showSellerToolsMenu(ctx, isOwner);

      logger.info(`User ${ctx.from.id} opened tools submenu`);
    } catch (error) {
      logger.error('Error in tools submenu handler:', error);
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(sellerMessages.toolsError, menu);
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
      await ctx.reply(generalMessages.shopRequired, sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(generalMessages.authorizationRequired, menu);
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

        if (shopDetails?.owner_id && shopDetails.owner_id !== ctx.session.user?.id) {
          const menu = await getSellerMenuKeyboard(ctx);
          await ctx.reply(sellerMessages.workersOwnerOnly, menu);
          return;
        }
      } catch (error) {
        logger.error('Failed to load shop details for workers menu:', error);
        const menu = await getSellerMenuKeyboard(ctx);
        await ctx.reply(generalMessages.actionFailed, menu);
        return;
      }
    }

    if (shopTier !== 'max') {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(sellerMessages.workersMaxOnly, menu);
      return;
    }

    const shopName = ctx.session.shopName || 'Магазин';
    await ctx.reply(sellerMessages.workersMenuIntro(shopName), manageWorkersMenu());

    logger.info(`User ${ctx.from.id} opened workers management`);
  } catch (error) {
    logger.error('Error in workers menu handler:', error);

    try {
      const menu = await getSellerMenuKeyboard(ctx);
      // Edit message вместо reply (не создаёт новое сообщение)
      await ctx.editMessageText(generalMessages.actionFailed, menu);
    } catch (editError) {
      // Fallback если edit не удался (например, сообщение удалено)
      logger.debug('Failed to edit message, using reply fallback:', editError.message);
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(generalMessages.actionFailed, menu);
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
    await ctx.reply(generalMessages.actionFailed, manageWorkersMenu());
  }
};

/**
 * Handle list workers action
 */
const handleWorkersList = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.reply(generalMessages.shopRequired, sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      await ctx.reply(generalMessages.authorizationRequired, manageWorkersMenu());
      return;
    }
    await showWorkersList(ctx);

    const workerCount = Array.isArray(ctx.session.workerList) ? ctx.session.workerList.length : 0;
    logger.info(`User ${ctx.from.id} viewed workers list (${workerCount} total)`);
  } catch (error) {
    logger.error('Error fetching workers:', error);
    await ctx.reply(generalMessages.actionFailed, manageWorkersMenu());
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
      await ctx.reply(generalMessages.shopRequired, sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(generalMessages.authorizationRequired, menu);
      return;
    }

    // SECURITY FIX: Only shop owner can remove workers
    if (!ctx.session.isShopOwner) {
      await ctx.reply(sellerMessages.workersOwnerOnly, manageWorkersMenu());
      return;
    }

    const workerId = Number.parseInt(ctx.match[1], 10);
    if (!Number.isInteger(workerId) || workerId <= 0) {
      await ctx.answerCbQuery(sellerMessages.workerSelectionInvalid);
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
      await ctx.answerCbQuery(sellerMessages.workerNotFound);
      await showWorkersList(ctx);
      return;
    }

    const name = getWorkerDisplayName(worker);
    await ctx.reply(sellerMessages.workerRemoveConfirm(name), confirmWorkerRemoval(workerId));
  } catch (error) {
    logger.error('Error in worker remove handler:', error);
    await ctx.answerCbQuery(generalMessages.actionFailed);
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
      await ctx.reply(generalMessages.shopRequired, sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      const menu = await getSellerMenuKeyboard(ctx);
      await ctx.reply(generalMessages.authorizationRequired, menu);
      return;
    }

    // SECURITY FIX: Only shop owner can remove workers
    if (!ctx.session.isShopOwner) {
      await ctx.reply(sellerMessages.workersOwnerOnly, manageWorkersMenu());
      return;
    }

    const workerId = Number.parseInt(ctx.match[1], 10);
    if (!Number.isInteger(workerId) || workerId <= 0) {
      await ctx.answerCbQuery(sellerMessages.workerSelectionInvalid);
      return;
    }

    await workerApi.removeWorker(ctx.session.shopId, workerId, ctx.session.token);

    if (Array.isArray(ctx.session.workerList)) {
      ctx.session.workerList = ctx.session.workerList.filter((worker) => worker.id !== workerId);
    }

    logger.info(`User ${ctx.from.id} removed worker ${workerId}`);

    await showWorkersList(ctx, { successMessage: sellerMessages.workerRemoved });
  } catch (error) {
    logger.error('Error in worker remove confirm handler:', error);
    const backendMessage = error.response?.data?.error;
    const message = backendMessage || sellerMessages.workerRemoveError;

    await ctx.reply(message, manageWorkersMenu());
  }
};
