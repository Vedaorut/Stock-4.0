import { Markup } from 'telegraf';
import { mainMenu } from '../keyboards/main.js';
import { sellerMenu } from '../keyboards/seller.js';
import { buyerMenu } from '../keyboards/buyer.js';
import { authApi, shopApi } from '../utils/api.js';
import { handleSellerRole } from './seller/index.js';
import { handleBuyerRole } from './buyer/index.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { messages } from '../texts/messages.js';
import { workerMenu } from '../keyboards/worker.js';
import { handleWorkerDashboard } from './worker/index.js';

const {
  start: startMessages,
  general: generalMessages,
  seller: sellerMessages,
  buyer: buyerMessages,
} = messages;

/**
 * Setup common handlers (main menu, cancel, etc.)
 */
export const setupCommonHandlers = (bot) => {
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
 * Handle main menu action
 */
const handleMainMenu = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // КРИТИЧНО: Выйти из любой активной сцены перед переходом
    if (ctx.scene && ctx.scene.current) {
      await ctx.scene.leave();
      logger.info(`User ${ctx.from.id} left scene ${ctx.scene.current} via main_menu`);
    }

    // Check if user has saved role - redirect to dashboard instead of resetting
    const savedRole = ctx.session.user?.selectedRole;

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

    await smartMessage.send(ctx, {
      text: startMessages.welcome,
      keyboard: mainMenu(),
    });
  } catch (error) {
    logger.error('Error in main menu handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle cancel scene action
 */
const handleCancelScene = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Leave current scene
    await ctx.scene.leave();

    // Return to main menu (minimalist)
    await smartMessage.send(ctx, {
      text: startMessages.welcome,
      keyboard: mainMenu(),
    });
  } catch (error) {
    logger.error('Error canceling scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
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

    // Route based on current role
    if (ctx.session.role === 'seller') {
      await smartMessage.send(ctx, {
        text: sellerMessages.panel,
        keyboard: sellerMenu(0, { hasFollows: ctx.session?.hasFollows }),
      });
    } else if (ctx.session.role === 'worker') {
      await smartMessage.send(ctx, {
        text: 'Меню сотрудника',
        keyboard: workerMenu(),
      });
    } else if (ctx.session.role === 'buyer') {
      await smartMessage.send(ctx, {
        text: buyerMessages.panel,
        keyboard: buyerMenu,
      });
    } else {
      await smartMessage.send(ctx, {
        text: startMessages.welcome,
        keyboard: mainMenu(),
      });
    }
  } catch (error) {
    logger.error('Error in back handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle role toggle action - show role selection menu
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

    // Build role selection keyboard
    const buttons = [
      [Markup.button.callback('\u{1F6D2} Покупаю', 'role:buyer')],
      [Markup.button.callback('\u{1F3EA} Продаю', 'role:seller')],
    ];

    // Only show worker option if user is actually a worker
    if (isWorker) {
      buttons.push([Markup.button.callback('\u{1F477} Сотрудник', 'role:worker')]);
    }

    await smartMessage.send(ctx, {
      text: 'Выберите роль:',
      keyboard: Markup.inlineKeyboard(buttons),
    });
  } catch (error) {
    logger.error('Error in role toggle handler:', error);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle role:buyer action - switch to buyer role
 */
const handleRoleBuyer = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    logger.info(`User ${ctx.from.id} switching to buyer role`);

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('buyer', ctx.session.token);
        ctx.session.role = 'buyer';
        ctx.session.workspaceShopId = null; // Clear workspace
        if (ctx.session.user) {
          ctx.session.user.selectedRole = 'buyer';
        }
        logger.info(`Saved buyer role for user ${ctx.from.id}`);
      } else {
        logger.warn(`User ${ctx.from.id} has no token, cannot save role`);
        ctx.session.role = 'buyer';
      }
    } catch (error) {
      logger.error('Failed to save buyer role:', error);
      ctx.session.role = 'buyer';
    }

    await handleBuyerRole(ctx);
  } catch (error) {
    logger.error('Error in role:buyer handler:', error);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle role:seller action - switch to seller role
 */
const handleRoleSeller = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    logger.info(`User ${ctx.from.id} switching to seller role`);

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('seller', ctx.session.token);
        ctx.session.role = 'seller';
        ctx.session.workspaceShopId = null; // Clear workspace
        if (ctx.session.user) {
          ctx.session.user.selectedRole = 'seller';
        }
        logger.info(`Saved seller role for user ${ctx.from.id}`);
      } else {
        logger.warn(`User ${ctx.from.id} has no token, cannot save role`);
        ctx.session.role = 'seller';
      }
    } catch (error) {
      logger.error('Failed to save seller role:', error);
      ctx.session.role = 'seller';
    }

    await handleSellerRole(ctx);
  } catch (error) {
    logger.error('Error in role:seller handler:', error);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
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
        await ctx.answerCbQuery('\u274C Требуется авторизация', { show_alert: true });
      }
      return;
    }

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    try {
      await authApi.updateRole('worker', ctx.session.token);
      ctx.session.role = 'worker';
      if (ctx.session.user) {
        ctx.session.user.selectedRole = 'worker';
      }
    } catch (error) {
      logger.error('Failed to persist worker role:', error);
      ctx.session.role = 'worker';
    }

    let workspaceShops;
    try {
      workspaceShops = await shopApi.getWorkerShops(ctx.session.token);
    } catch (error) {
      logger.error('Failed to get workspace shops:', error);
      await ctx.answerCbQuery('\u274C Ошибка загрузки магазинов', { show_alert: true });
      return;
    }

    // No workspace shops - show informative message with user's Telegram ID
    if (!Array.isArray(workspaceShops) || workspaceShops.length === 0) {
      await smartMessage.send(ctx, {
        text:
          '\u{1F477} *Режим сотрудника*\n\n' +
          'Вы ещё не добавлены как сотрудник ни в один магазин.\n\n' +
          '\u{1F4A1} *Как стать сотрудником:*\n' +
          '\u2022 Попросите владельца магазина добавить вас\n' +
          '\u2022 Он должен указать ваш @username или Telegram ID\n\n' +
          `\u{1F4CD} _Ваш ID: \`${ctx.from.id}\`_`,
        keyboard: Markup.inlineKeyboard([[Markup.button.callback('\u00AB Назад', 'role:toggle')]]),
        parse_mode: 'Markdown',
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
        text: `\u{1F477} Вы работаете в магазине "${shop.name}".`,
        keyboard: workerMenu(),
      });
      return;
    }

    // Multiple shops - show selection
    const buttons = workspaceShops.map((shop) => [
      Markup.button.callback(`\u{1F3EA} ${shop.name}`, `workspace:${shop.id}`),
    ]);

    // Add back button
    buttons.push([Markup.button.callback('\u2B05 Назад', 'role:toggle')]);

    await smartMessage.send(ctx, {
      text: 'Выберите магазин для работы:',
      keyboard: Markup.inlineKeyboard(buttons),
    });
  } catch (error) {
    logger.error('Error in role:worker handler:', error);
    try {
      await ctx.answerCbQuery('\u274C Произошла ошибка', { show_alert: true });
    } catch (cbError) {
      logger.error('Failed to answer callback:', cbError);
    }
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
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
      await ctx.answerCbQuery('\u274C Требуется авторизация', { show_alert: true });
      return;
    }

    // Verify user has access to this shop
    let workspaceShops;
    try {
      workspaceShops = await shopApi.getWorkerShops(ctx.session.token);
    } catch (error) {
      logger.error('Failed to verify workspace access:', error);
      await ctx.answerCbQuery('\u274C Ошибка проверки доступа', { show_alert: true });
      return;
    }

    const shop = workspaceShops?.find((s) => s.id === shopId);
    if (!shop) {
      await ctx.answerCbQuery('\u274C У вас нет доступа к этому магазину', { show_alert: true });
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
      await ctx.answerCbQuery('\u274C Произошла ошибка', { show_alert: true });
    } catch (cbError) {
      logger.error('Failed to answer callback:', cbError);
    }
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: mainMenu(),
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

    // КРИТИЧНО: Выйти из любой активной сцены
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
        if (ctx.session.user) {
          ctx.session.user.selectedRole = 'seller';
        }
        logger.info(`Saved seller role for user ${ctx.from.id} (from subscription notification)`);
      }
    } catch (error) {
      logger.error('Failed to save role:', error);
    }

    // Redirect to seller dashboard
    await handleSellerRole(ctx);
  } catch (error) {
    logger.error('Error in back to main handler:', error);
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: sellerMenu(0),
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
    const tier = tierFromCallback || 'basic';

    // Set seller role
    ctx.session.role = 'seller';

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('seller', ctx.session.token);
        if (ctx.session.user) {
          ctx.session.user.selectedRole = 'seller';
        }
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
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: sellerMenu(0),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};
