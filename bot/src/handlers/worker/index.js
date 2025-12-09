import { Markup } from 'telegraf';
import { workerMenu } from '../../keyboards/worker.js';
import { mainMenu } from '../../keyboards/main.js';
import { shopApi, productApi, workerApi } from '../../utils/api.js';
import * as smartMessage from '../../utils/smartMessage.js';
import logger from '../../utils/logger.js';
import { messages } from '../../texts/messages.js';
import { t } from '../../i18n/index.js';

const { general: generalMessages } = messages;

const setWorkspaceSession = (ctx, shop) => {
  ctx.session.role = 'worker';
  ctx.session.workspaceShopId = shop.id;
  ctx.session.workspaceShop = shop;
  ctx.session.shopId = shop.id; // re-use existing flows/scenes
  ctx.session.shopName = shop.name;
  ctx.session.shopTier = shop.tier;
  ctx.session.isShopOwner = false;

};

const ensureWorkspaceShop = async (ctx) => {
  const lang = ctx.lang || ctx.session?.language || 'ru';
  if (!ctx.session.token) {
    await smartMessage.send(ctx, {
      text: generalMessages.authorizationRequired(lang),
      keyboard: mainMenu(false, lang),
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
      text: ctx.t('worker.modeUnavailable'),
      keyboard: Markup.inlineKeyboard([[Markup.button.callback(ctx.t('buttons.back'), 'role:toggle')]]),
    });
    return null;
  }

  const shop = shops.find((s) => s.id === currentShopId) || shops[0];
  setWorkspaceSession(ctx, shop);
  return shop;
};

const formatProductsList = (products, lang = 'ru') => {
  if (!products || products.length === 0) {
    return null; // Return null so caller can use localized string
  }

  const pcsLabel = t('orders.pcs', {}, lang);
  return products
    .slice(0, 20)
    .map((p, idx) => {
      const price = p.price ? Number(p.price).toString() : '—';
      const stock = p.stock_quantity ?? p.stock ?? 0;
      return `${idx + 1}. ${p.name} — ${price} (${stock} ${pcsLabel})`;
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

    const lang = ctx.lang || ctx.session?.language || 'ru';
    if (!ctx.session.token) {
      await smartMessage.send(ctx, {
        text: generalMessages.authorizationRequired(lang),
        keyboard: mainMenu(false, lang),
      });
      return;
    }

    const shops = await shopApi.getWorkerShops(ctx.session.token);

    if (!Array.isArray(shops) || shops.length === 0) {
      await smartMessage.send(ctx, {
        text: ctx.t('worker.notAddedToAnyShop', { telegramId: ctx.from.id }),
        keyboard: Markup.inlineKeyboard([[Markup.button.callback(ctx.t('buttons.back'), 'role:toggle')]]),
      });
      return;
    }

    const shop =
      shops.find((s) => s.id === ctx.session.workspaceShopId || ctx.session.shopId) || shops[0];
    setWorkspaceSession(ctx, shop);

    await smartMessage.send(ctx, {
      text: ctx.t('worker.aiInstructions', { shopName: shop.name }),
      keyboard: workerMenu(shop.name, ctx.lang),
    });
  } catch (error) {
    logger.error('handleWorkerDashboard error:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed(langErr),
      keyboard: mainMenu(false, langErr),
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

    const list = formatProductsList(products, ctx.lang) || ctx.t('worker.catalogEmpty');

    await smartMessage.send(ctx, {
      text: ctx.t('worker.shopProducts', { shopName: shop.name, list }),
      keyboard: workerMenu(shop.name, ctx.lang),
    });
  } catch (error) {
    logger.error('handleWorkerProducts error:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed(langErr),
      keyboard: workerMenu(undefined, langErr),
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

    const stats = await workerApi.getStats(shop.id, ctx.session.token);
    const ordersCount = Number(stats?.total_orders ?? 0);
    const revenue = Number(stats?.revenue ?? 0);

    await smartMessage.send(ctx, {
      text: ctx.t('worker.stats', { revenue, ordersCount }),
      keyboard: workerMenu(shop.name, ctx.lang),
    });
  } catch (error) {
    logger.error('handleWorkerStats error:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    await smartMessage.send(ctx, {
      text: generalMessages.actionFailed(langErr),
      keyboard: workerMenu(undefined, langErr),
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
