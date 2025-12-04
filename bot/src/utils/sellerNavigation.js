import { sellerMenu, sellerMenuNoShop, sellerToolsMenu } from '../keyboards/seller.js';
import { shopApi, orderApi, followApi } from './api.js';
import * as smartMessage from './smartMessage.js';
import logger from './logger.js';
import { messages } from '../texts/messages.js';
import { t } from '../i18n/index.js';

const { seller: sellerMessages } = messages;

const getLang = (ctx) => ctx.lang || ctx.session?.language || 'ru';

const formatDate = (dateValue) => {
  if (!dateValue) {
    return null;
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().split('T')[0];
};

export const showSellerMainMenu = async (ctx) => {
  try {
    const lang = getLang(ctx);

    if (!ctx.session?.token) {
      await smartMessage.send(ctx, {
        text: t('general.authorizationRequired', {}, lang),
        keyboard: sellerMenuNoShop(lang),
      });
      return false;
    }

    let shopId = ctx.session.shopId;
    let shopName = ctx.session.shopName;

    if (!shopId) {
      const shops = await shopApi.getMyShop(ctx.session.token);
      if (!Array.isArray(shops) || shops.length === 0) {
        await smartMessage.send(ctx, {
          text: t('seller.noShop', {}, lang),
          keyboard: sellerMenuNoShop(lang),
        });
        return false;
      }
      const [shop] = shops;
      shopId = shop.id;
      shopName = shop.name;
      ctx.session.shopId = shopId;
      ctx.session.shopName = shopName;
      ctx.session.shopTier = shop.tier;
      ctx.session.isShopOwner = true;
    }

    let weekRevenue = 0;
    try {
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);

      const analytics = await orderApi.getAnalytics(
        shopId,
        formatDate(weekAgo) || weekAgo.toISOString().split('T')[0],
        formatDate(today) || today.toISOString().split('T')[0],
        ctx.session.token
      );
      weekRevenue = analytics?.summary?.totalRevenue || 0;
    } catch (analyticsError) {
      logger.warn('Failed to fetch weekly analytics for seller menu', {
        error: analyticsError.message,
      });
    }

    let activeCount = 0;
    try {
      activeCount = await orderApi.getActiveOrdersCount(shopId, ctx.session.token);
    } catch (countError) {
      logger.warn('Failed to fetch active orders count for seller menu', {
        error: countError.message,
      });
    }

    let hasFollows = false;
    try {
      // Use HTTP API with JWT token
      const follows = await followApi.getMyFollows(shopId, ctx.session.token);
      hasFollows = Array.isArray(follows) && follows.length > 0;
    } catch (followError) {
      logger.warn('Failed to fetch follows for seller menu', {
        error: followError.message,
      });
    }
    ctx.session.hasFollows = hasFollows;

    const header = sellerMessages.shopPanelWithStats(
      shopName || t('general.shopFallbackName', {}, lang),
      weekRevenue,
      activeCount,
      null,
      lang
    );
    await smartMessage.send(ctx, {
      text: header,
      keyboard: sellerMenu(activeCount, { hasFollows }, lang),
    });
    return true;
  } catch (error) {
    logger.error('Error showing seller main menu:', error);
    const lang = getLang(ctx);
    await smartMessage.send(ctx, {
      text: t('general.actionFailed', {}, lang),
      keyboard: sellerMenuNoShop(lang),
    });
    return false;
  }
};

export const showSellerToolsMenu = async (ctx, isOwnerOverride = null) => {
  try {
    const lang = getLang(ctx);
    const isOwner = isOwnerOverride ?? ctx.session?.isShopOwner ?? false;
    await smartMessage.send(ctx, {
      text: t('seller.toolsIntro', {}, lang),
      keyboard: sellerToolsMenu(isOwner, lang),
    });
    return true;
  } catch (error) {
    logger.error('Error showing seller tools menu:', error);
    const lang = getLang(ctx);
    await smartMessage.send(ctx, {
      text: t('general.actionFailed', {}, lang),
      keyboard: sellerMenuNoShop(lang),
    });
    return false;
  }
};
