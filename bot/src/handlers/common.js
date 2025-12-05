import { Markup } from 'telegraf';
import { mainMenu } from '../keyboards/main.js';
import { sellerMenu } from '../keyboards/seller.js';
import { buyerMenu } from '../keyboards/buyer.js';
import { authApi, shopApi } from '../utils/api.js';
import { handleSellerRole } from './seller/index.js';
import { handleBuyerRole } from './buyer/index.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { getMessages } from '../texts/messages.js';
import { workerMenu } from '../keyboards/worker.js';
import { handleWorkerDashboard } from './worker/index.js';
import { t } from '../i18n/index.js';
import { handleStart } from './start.js';

/**
 * Get language with fallback (C5 fix: ctx.lang undefined)
 */
const getLangSafe = (ctx) => ctx.lang || ctx.session?.language || 'ru';


/**
 * Setup common handlers (main menu, cancel, etc.)
 */
export const setupCommonHandlers = (bot) => {
  // Language selection (first-time users)
  bot.action(/^lang:(ru|en)$/, handleLanguageSelection);

  // Main menu action
  bot.action('main_menu', handleMainMenu);

  // Back to main menu (from subscription notifications)
  bot.action('back_to_main', handleBackToMain);

  // Start create shop (from subscription pending notification)
  bot.action(/^start_create_shop(?::.+)?$/, handleStartCreateShop);

  // Cancel scene action
  bot.action('cancel_scene', handleCancelScene);

  // Generic back action
  bot.action('back', handleBack);

  // Role toggle action - show role selection menu
  bot.action('role:toggle', handleRoleToggle);

  // Role selection actions
  bot.action('role:buyer', handleRoleBuyer);
  bot.action('role:seller', handleRoleSeller);
  bot.action('role:worker', handleRoleWorker);

  // Workspace shop selection
  bot.action(/^workspace:(\d+)$/, handleSelectWorkspace);
};

/**
 * Handle language selection (first-time users)
 */
const handleLanguageSelection = async (ctx) => {
  try {
    const lang = ctx.match[1]; // 'ru' or 'en'
    await ctx.answerCbQuery();

    logger.info(`User ${ctx.from.id} selected language: ${lang}`);

    // Save language to session
    ctx.session.language = lang;

    // Save language to database via API
    try {
      if (ctx.session.token) {
        await authApi.updateLanguage(lang, ctx.session.token);
        logger.info(`Saved language ${lang} to database for user ${ctx.from.id}`);
      }
    } catch (error) {
      logger.error('Failed to save language to database:', error);
      // Continue anyway - language is set in session
    }

    // Show confirmation and continue to main flow
    const confirmMessage = ctx.t('settings.languageChanged');
    await ctx.editMessageText(`✅ ${confirmMessage}`);

    // Small delay for UX
    await new Promise(resolve => setTimeout(resolve, 500));

    // Continue with normal start flow
    await handleStart(ctx);
  } catch (error) {
    logger.error('Error in language selection handler:', error);
    try {
      await ctx.reply(t('general.actionFailed', {}, 'ru'));
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle main menu action
 */
const handleMainMenu = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // CRITICAL: Leave any active scene before transition
    if (ctx.scene && ctx.scene.current) {
      await ctx.scene.leave();
      logger.info(`User ${ctx.from.id} left scene ${ctx.scene.current} via main_menu`);
    }

    // Check if user has saved role - redirect to dashboard instead of resetting
    const savedRole = ctx.session.role;

    if (savedRole === 'seller') {
      logger.info(`User ${ctx.from.id} has saved role: seller, redirecting to seller dashboard`);
      return await handleSellerRole(ctx);
    } else if (savedRole === 'buyer') {
      logger.info(`User ${ctx.from.id} has saved role: buyer, redirecting to buyer dashboard`);
      return await handleBuyerRole(ctx);
    } else if (savedRole === 'worker') {
      logger.info(`User ${ctx.from.id} has saved role: worker, redirecting to worker dashboard`);
      return await handleRoleWorker(ctx);
    }

    // No saved role - show role selection
    ctx.session.role = null;

    const lang = getLangSafe(ctx);
    const { start: startMessages } = getMessages(lang);

    await smartMessage.send(ctx, {
      text: startMessages.welcome(lang),
      keyboard: mainMenu(false, lang),
    });
  } catch (error) {
    logger.error('Error in main menu handler:', error);
    // H8 FIX: Answer callback query in catch to prevent infinite spinner
    try { await ctx.answerCbQuery(); } catch { /* ignore */ }
    // Local error handling - don't throw to avoid infinite spinner
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: mainMenu(false, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle cancel scene action
 * Routes user back to appropriate menu based on their role
 */
const handleCancelScene = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Leave current scene
    await ctx.scene.leave();

    // Route based on user role
    const role = ctx.session?.role || ctx.session?.user?.selectedRole;
    const lang = getLangSafe(ctx);
    const { start: startMessages, seller: sellerMessages, buyer: buyerMessages } = getMessages(lang);

    if (role === 'buyer') {
      // Buyer: return to buyer menu
      await smartMessage.send(ctx, {
        text: buyerMessages.panel(lang),
        keyboard: buyerMenu(lang),
      });
    } else if (role === 'seller') {
      // Seller: return to seller menu
      await smartMessage.send(ctx, {
        text: sellerMessages.panel(lang),
        keyboard: sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, lang),
      });
    } else {
      // No role or unknown: return to main menu
      await smartMessage.send(ctx, {
        text: startMessages.welcome(lang),
        keyboard: mainMenu(false, lang),
      });
    }
  } catch (error) {
    logger.error('Error canceling scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: mainMenu(false, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle generic back action
 */
const handleBack = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const lang = getLangSafe(ctx);
    const { start: startMessages, seller: sellerMessages, buyer: buyerMessages } = getMessages(lang);

    // Route based on current role
    if (ctx.session.role === 'seller') {
      await smartMessage.send(ctx, {
        text: sellerMessages.panel(lang),
        keyboard: sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, lang),
      });
    } else if (ctx.session.role === 'worker') {
      await smartMessage.send(ctx, {
        text: ctx.t('worker.menu'),
        keyboard: workerMenu(undefined, lang),
      });
    } else if (ctx.session.role === 'buyer') {
      await smartMessage.send(ctx, {
        text: buyerMessages.panel(lang),
        keyboard: buyerMenu(lang),
      });
    } else {
      await smartMessage.send(ctx, {
        text: startMessages.welcome(lang),
        keyboard: mainMenu(false, lang),
      });
    }
  } catch (error) {
    logger.error('Error in back handler:', error);
    // H7 FIX: Answer callback query in catch to prevent infinite spinner
    try { await ctx.answerCbQuery(); } catch { /* ignore */ }
    // Local error handling - don't throw to avoid infinite spinner
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: mainMenu(false, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle role toggle action - auto-swap buyer↔seller or show menu if worker
 */
const handleRoleToggle = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user is a worker in any shop
    let isWorker = false;
    if (ctx.session.token) {
      try {
        const workerShops = await shopApi.getWorkerShops(ctx.session.token);
        isWorker = Array.isArray(workerShops) && workerShops.length > 0;
      } catch {
        // Silently ignore - just don't show worker option
      }
    }

    // If NOT worker - auto-swap buyer↔seller without showing menu
    if (!isWorker) {
      const currentRole = ctx.session.role || 'buyer';
      if (currentRole === 'buyer' || currentRole === null) {
        // Switch to seller
        return handleRoleSeller(ctx);
      } else {
        // Switch to buyer
        return handleRoleBuyer(ctx);
      }
    }

    // If worker - show role selection menu with 3 options
    const buttons = [
      [Markup.button.callback(ctx.t('roleSelection.buying'), 'role:buyer')],
      [Markup.button.callback(ctx.t('roleSelection.selling'), 'role:seller')],
      [Markup.button.callback(ctx.t('roleSelection.worker'), 'role:worker')],
    ];

    await smartMessage.send(ctx, {
      text: ctx.t('roleSelection.chooseRole'),
      keyboard: Markup.inlineKeyboard(buttons),
    });
  } catch (error) {
    logger.error('Error in role toggle handler:', error);
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: mainMenu(false, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle role:buyer action - switch to buyer role
 * PERF: Role update done here, passed to handleBuyerRole with skipRoleUpdate
 */
const handleRoleBuyer = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    logger.info(`User ${ctx.from.id} switching to buyer role`);

    // Save role to database ONCE here
    try {
      if (ctx.session.token) {
        await authApi.updateRole('buyer', ctx.session.token);
        ctx.session.role = 'buyer';
        ctx.session.workspaceShopId = null; // Clear workspace
        logger.info(`Saved buyer role for user ${ctx.from.id}`);
      } else {
        logger.warn(`User ${ctx.from.id} has no token, cannot save role`);
        ctx.session.role = 'buyer';
      }
    } catch (error) {
      logger.error('Failed to save buyer role:', error);
      ctx.session.role = 'buyer';
    }

    // PERF: Pass skipRoleUpdate to avoid duplicate PATCH /auth/role call
    await handleBuyerRole(ctx, { skipRoleUpdate: true });
  } catch (error) {
    logger.error('Error in role:buyer handler:', error);
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: mainMenu(false, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle role:seller action - switch to seller role
 * NOTE: Role is saved to DB only when shop is created (in createShop scene)
 * This prevents seller role being saved for users without a shop
 */
const handleRoleSeller = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    logger.info(`User ${ctx.from.id} switching to seller role`);

    // Only set role in SESSION, not in DB
    // DB role is updated only when shop is actually created (createShop scene)
    // This prevents the bug where user selects "seller", cancels shop creation,
    // but webapp still shows seller UI because role was saved to DB
    ctx.session.role = 'seller';
    ctx.session.workspaceShopId = null; // Clear workspace

    // Check if user already has a shop - then save role to DB
    if (ctx.session.token) {
      try {
        const shops = await shopApi.getMyShop(ctx.session.token);
        if (shops && Array.isArray(shops) && shops.length > 0) {
          // User HAS a shop - safe to save seller role to DB
          await authApi.updateRole('seller', ctx.session.token);
          logger.info(`Saved seller role for user ${ctx.from.id} (has shop)`);
        } else {
          logger.info(`User ${ctx.from.id} has no shop, role NOT saved to DB yet`);
        }
      } catch (error) {
        logger.debug('Failed to check shops for role save:', error.message);
      }
    }

    await handleSellerRole(ctx, { skipRoleUpdate: true });
  } catch (error) {
    logger.error('Error in role:seller handler:', error);
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: mainMenu(false, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle role:worker action - enter workspace mode
 */
const handleRoleWorker = async (ctx) => {
  try {
    // Check for workspace shops
    if (!ctx.session.token) {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery(ctx.t('errors.authRequired'), { show_alert: true });
      }
      return;
    }

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    try {
      await authApi.updateRole('worker', ctx.session.token);
      ctx.session.role = 'worker';
    } catch (error) {
      logger.error('Failed to persist worker role:', error);
      ctx.session.role = 'worker';
    }

    let workspaceShops;
    try {
      workspaceShops = await shopApi.getWorkerShops(ctx.session.token);
    } catch (error) {
      logger.error('Failed to get workspace shops:', error);
      await ctx.answerCbQuery(ctx.t('errors.loadShopsError'), { show_alert: true });
      return;
    }

    // No workspace shops - show informative message with user's Telegram ID
    if (!Array.isArray(workspaceShops) || workspaceShops.length === 0) {
      await smartMessage.send(ctx, {
        text: ctx.t('worker.notAddedWithUsername', { telegramId: ctx.from.id }),
        keyboard: Markup.inlineKeyboard([[Markup.button.callback(ctx.t('buttons.back'), 'role:toggle')]]),
      });
      return;
    }

    // If only 1 shop - directly enter workspace
    if (workspaceShops.length === 1) {
      const shop = workspaceShops[0];
      logger.info(`User ${ctx.from.id} entering workspace for shop ${shop.id} (${shop.name})`);

      ctx.session.role = 'worker';
      ctx.session.workspaceShopId = shop.id;
      ctx.session.workspaceShop = shop;
      ctx.session.shopId = shop.id;
      ctx.session.shopName = shop.name;
      ctx.session.shopTier = shop.tier;
      ctx.session.isShopOwner = false;

      await smartMessage.send(ctx, {
        text: ctx.t('worker.workingInShop', { shopName: shop.name }),
        keyboard: workerMenu(shop.name, getLangSafe(ctx)),
      });
      return;
    }

    // Multiple shops - show selection
    const buttons = workspaceShops.map((shop) => [
      Markup.button.callback(shop.name, `workspace:${shop.id}`),
    ]);

    // Add back button
    buttons.push([Markup.button.callback(ctx.t('buttons.back'), 'role:toggle')]);

    await smartMessage.send(ctx, {
      text: ctx.t('worker.selectShop'),
      keyboard: Markup.inlineKeyboard(buttons),
    });
  } catch (error) {
    logger.error('Error in role:worker handler:', error);
    try {
      await ctx.answerCbQuery(ctx.t('errors.genericError'), { show_alert: true });
    } catch (cbError) {
      logger.error('Failed to answer callback:', cbError);
    }
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: mainMenu(false, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle workspace shop selection
 */
const handleSelectWorkspace = async (ctx) => {
  try {
    const shopId = parseInt(ctx.match[1], 10);

    if (!ctx.session.token) {
      await ctx.answerCbQuery(ctx.t('errors.authRequired'), { show_alert: true });
      return;
    }

    // Verify user has access to this shop
    let workspaceShops;
    try {
      workspaceShops = await shopApi.getWorkerShops(ctx.session.token);
    } catch (error) {
      logger.error('Failed to verify workspace access:', error);
      await ctx.answerCbQuery(ctx.t('errors.accessCheckError'), { show_alert: true });
      return;
    }

    const shop = workspaceShops?.find((s) => s.id === shopId);
    if (!shop) {
      await ctx.answerCbQuery(ctx.t('errors.noShopAccess'), { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    logger.info(`User ${ctx.from.id} entering workspace for shop ${shop.id} (${shop.name})`);

    ctx.session.role = 'worker';
    ctx.session.workspaceShopId = shop.id;
    ctx.session.workspaceShop = shop;
    ctx.session.shopId = shop.id;
    ctx.session.shopName = shop.name;
    ctx.session.shopTier = shop.tier;
    ctx.session.isShopOwner = false;

    // Show worker dashboard/menu
    await handleWorkerDashboard(ctx);
  } catch (error) {
    logger.error('Error in workspace selection handler:', error);
    try {
      await ctx.answerCbQuery(ctx.t('errors.genericError'), { show_alert: true });
    } catch (cbError) {
      logger.error('Failed to answer callback:', cbError);
    }
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: mainMenu(false, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle back to main menu (from subscription notifications)
 */
const handleBackToMain = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // CRITICAL: Leave any active scene
    if (ctx.scene && ctx.scene.current) {
      await ctx.scene.leave();
      logger.info(`User ${ctx.from.id} left scene ${ctx.scene.current} via back_to_main`);
    }

    // Set seller role since subscription payment means they're a seller
    ctx.session.role = 'seller';

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('seller', ctx.session.token);
        logger.info(`Saved seller role for user ${ctx.from.id} (from subscription notification)`);
      }
    } catch (error) {
      logger.error('Failed to save role:', error);
    }

    // PERF: Pass skipRoleUpdate since we already called updateRole above
    await handleSellerRole(ctx, { skipRoleUpdate: true });
  } catch (error) {
    logger.error('Error in back to main handler:', error);
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: sellerMenu(0, {}, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle start create shop (from subscription pending notification)
 */
const handleStartCreateShop = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Extract tier from callback data (format: start_create_shop:{tier}) with safe fallback
    const callbackData = ctx.callbackQuery?.data || '';
    const [, tierFromCallback] = callbackData.split(':');
    const tier = tierFromCallback || 'pro';

    // Set seller role
    ctx.session.role = 'seller';

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('seller', ctx.session.token);
        logger.info(`Saved seller role for user ${ctx.from.id} (from create shop button)`);
      }
    } catch (error) {
      logger.error('Failed to save role:', error);
    }

    // Enter create shop scene directly with the paid tier
    logger.info(`User ${ctx.from.id} entering create shop scene from subscription notification`, {
      tier,
    });
    await ctx.scene.enter('createShop', { tier });
  } catch (error) {
    logger.error('Error in start create shop handler:', error);
    const lang = getLangSafe(ctx);
    const { general: generalMessages } = getMessages(lang);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(lang),
        keyboard: sellerMenu(0, {}, lang),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};
