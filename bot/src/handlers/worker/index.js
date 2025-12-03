import { Markup } from 'telegraf';
import { workerMenu } from '../../keyboards/worker.js';
import { mainMenu } from '../../keyboards/main.js';
import { shopApi, productApi, orderApi } from '../../utils/api.js';
import * as smartMessage from '../../utils/smartMessage.js';
import logger from '../../utils/logger.js';
import { messages } from '../../texts/messages.js';

// Note: orderApi kept for handleWorkerStats (revenue calculation)

const { general: generalMessages } = messages;

const setWorkspaceSession = (ctx, shop) => {
  ctx.session.role = 'worker';
  ctx.session.workspaceShopId = shop.id;
  ctx.session.workspaceShop = shop;
  ctx.session.shopId = shop.id; // re-use existing flows/scenes
  ctx.session.shopName = shop.name;
  ctx.session.shopTier = shop.tier;
  ctx.session.isShopOwner = false;
  if (ctx.session.user) {
    ctx.session.user.selectedRole = 'worker';
  }
};

const ensureWorkspaceShop = async (ctx) => {
  if (!ctx.session.token) {
    await smartMessage.send(ctx, {
      text: generalMessages.authorizationRequired,
      keyboard: mainMenu(false, ctx.lang),
    });
    return null;
  }

  const currentShopId = ctx.session.workspaceShopId || ctx.session.shopId;
  if (ctx.session.workspaceShop && ctx.session.workspaceShop.id === currentShopId) {
    return ctx.session.workspaceShop;
  }

  const shops = await shopApi.getWorkerShops(ctx.session.token);
  if (!Array.isArray(shops) || shops.length === 0) {
    await smartMessage.send(ctx, {
      text:
        'Режим сотрудника недоступен\n\n' +
        'Вас ещё не добавили в магазин. Попросите владельца добавить ваш @username или Telegram ID.',
      keyboard: Markup.inlineKeyboard([[Markup.button.callback('Назад', 'role:toggle')]]),
    });
    return null;
  }

  const shop = shops.find((s) => s.id === currentShopId) || shops[0];
  setWorkspaceSession(ctx, shop);
  return shop;
};

const formatProductsList = (products) => {
  if (!products || products.length === 0) {
    return 'Каталог пуст.';
  }

  return products
    .slice(0, 20)
    .map((p, idx) => {
      const price = p.price ? Number(p.price).toString() : '—';
      const stock = p.stock_quantity ?? p.stock ?? 0;
      return `${idx + 1}. ${p.name} — ${price} (${stock} шт)`;
    })
    .join('\n');
};

/**
 * Worker dashboard entry
 */
export const handleWorkerDashboard = async (ctx) => {
  try {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (err) {
        logger.debug('Callback already answered in worker dashboard', { error: err.message });
      }
    }

    if (!ctx.session.token) {
      await smartMessage.send(ctx, {
        text: generalMessages.authorizationRequired,
        keyboard: mainMenu(false, ctx.lang),
      });
      return;
    }

    const shops = await shopApi.getWorkerShops(ctx.session.token);

    if (!Array.isArray(shops) || shops.length === 0) {
      await smartMessage.send(ctx, {
        text:
          'Режим сотрудника\n\n' +
          'Вы ещё не добавлены как сотрудник ни в один магазин.\n\n' +
          'Как стать сотрудником:\n' +
          '- Попросите владельца магазина добавить вас\n' +
          `- Ваш ID: ${ctx.from.id}`,
        keyboard: Markup.inlineKeyboard([[Markup.button.callback('Назад', 'role:toggle')]]),
      });
      return;
    }

    const shop =
      shops.find((s) => s.id === ctx.session.workspaceShopId || ctx.session.shopId) || shops[0];
    setWorkspaceSession(ctx, shop);

    await smartMessage.send(ctx, {
      text:
        `Вы работаете в магазине "${shop.name}"\n\n` +
        `Используйте AI для управления товарами:\n` +
        `- "добавь iPhone за 999"\n` +
        `- "скидка 20% на MacBook"\n` +
        `- "покажи товары"\n\n` +
        `Кнопки ниже - для быстрого просмотра.`,
      keyboard: workerMenu(shop.name, ctx.lang),
    });
  } catch (error) {
    logger.error('handleWorkerDashboard error:', error);
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed,
      keyboard: mainMenu(false, ctx.lang),
    });
  }
};

/**
 * Show products for worker shop
 */
export const handleWorkerProducts = async (ctx) => {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const shop = await ensureWorkspaceShop(ctx);
    if (!shop) return;

    const products =
      (await shopApi
        .getShopProductsSecure(shop.id, ctx.session.token)
        .catch(() => productApi.getShopProducts(shop.id))) || [];

    const list = formatProductsList(products);

    await smartMessage.send(ctx, {
      text: `Товары магазина "${shop.name}":\n\n${list}`,
      keyboard: workerMenu(shop.name, ctx.lang),
    });
  } catch (error) {
    logger.error('handleWorkerProducts error:', error);
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed,
      keyboard: workerMenu(undefined, ctx.lang),
    });
  }
};

/**
 * Show basic stats for worker shop
 */
export const handleWorkerStats = async (ctx) => {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const shop = await ensureWorkspaceShop(ctx);
    if (!shop) return;

    const orders = await orderApi.getShopOrders(shop.id, ctx.session.token, { limit: 100 });
    const completedStatuses = ['confirmed', 'shipped', 'delivered'];
    const completed = orders.filter((o) => completedStatuses.includes(o.status));
    const revenue = completed.reduce((sum, o) => sum + Number(o.total_price || 0), 0);

    await smartMessage.send(ctx, {
      text: `Статистика (последние заказы)\n\nДоход: ${revenue}\nЗаказы: ${orders.length}`,
      keyboard: workerMenu(shop.name, ctx.lang),
    });
  } catch (error) {
    logger.error('handleWorkerStats error:', error);
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed,
      keyboard: workerMenu(undefined, ctx.lang),
    });
  }
};

/**
 * Register worker handlers (simplified - AI handles product management)
 */
export const setupWorkerHandlers = (bot) => {
  bot.action('worker:dashboard', handleWorkerDashboard);
  bot.action('worker:products', handleWorkerProducts);
  bot.action('worker:stats', handleWorkerStats);

  logger.info('Worker handlers registered');
};

export default {
  handleWorkerDashboard,
  handleWorkerProducts,
  handleWorkerStats,
  setupWorkerHandlers,
};
