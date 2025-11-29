import { Markup } from 'telegraf';
import {
  followsMenu,
  followDetailMenu,
  followCatalogMenu,
  sellerMenu,
  sellerMenuNoShop,
} from '../../keyboards/seller.js';
import { followApi } from '../../utils/api.js';
import { formatFollowDetail } from '../../utils/minimalist.js';
import logger from '../../utils/logger.js';
import { messages } from '../../texts/messages.js';
import { validateShopBeforeScene } from '../../utils/sceneValidation.js';

const { general: generalMessages, follows: followMessages } = messages;

const formatMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
};

const buildFollowLabel = (follow) => {
  const name = follow.source_shop_name || follow.sourceShopName || follow.name || 'Магазин';
  const isResell = follow.mode === 'resell';
  const markupType = follow.markup_type || 'percentage';
  let markupSuffix = '';
  if (isResell) {
    if (markupType === 'fixed') {
      const fixedValue = Number(follow.markup_fixed ?? 0);
      if (Number.isFinite(fixedValue) && fixedValue > 0) {
        markupSuffix = ` (+$${fixedValue})`;
      }
    } else {
      const percentValue = Number(follow.markup_percentage ?? follow.markup ?? 0);
      if (Number.isFinite(percentValue) && percentValue > 0) {
        markupSuffix = ` (+${Math.round(percentValue)}%)`;
      }
    }
  }
  const modeLabel = isResell ? 'Перепродажа' : 'Мониторинг';
  return `🏪 ${name} (${modeLabel}${markupSuffix})`;
};

const sendOrEdit = async (ctx, text, keyboard) => {
  const replyMarkup = keyboard instanceof Object ? keyboard : undefined;
  if (ctx.updateType === 'callback_query' && ctx.callbackQuery?.message) {
    return ctx.editMessageText(text, replyMarkup);
  }
  return ctx.reply(text, replyMarkup);
};

const formatProductLine = (index, name, price, stock) =>
  `${index + 1}. ${name} • $${formatMoney(price)} • ${Number.isFinite(stock) ? stock : 0} шт`;

const formatPriceWithMarkup = (sourcePrice, markupType, markupValue) => {
  const price = Number(sourcePrice) || 0;
  let finalPrice;
  let markupSuffix;

  if (markupType === 'fixed') {
    const fixed = Number(markupValue) || 0;
    finalPrice = price + fixed;
    markupSuffix = fixed > 0 ? `(+$${fixed})` : '';
  } else {
    const percent = Number(markupValue) || 0;
    finalPrice = price * (1 + percent / 100);
    markupSuffix = percent > 0 ? `(+${Math.round(percent)}%)` : '';
  }

  return `$${formatMoney(price)} → $${formatMoney(finalPrice)} ${markupSuffix}`.trim();
};

const buildCatalogMessage = (followInfo, products, mode) => {
  const lines = [];
  const shopName = followInfo.source_shop_name || followInfo.sourceShopName || 'Магазин';
  const isResell = mode === 'resell';
  const markupType = followInfo.markup_type || 'percentage';
  let markupSuffix = '';
  if (isResell) {
    if (markupType === 'fixed') {
      const fixedValue = Number(followInfo.markup_fixed ?? 0);
      if (Number.isFinite(fixedValue) && fixedValue > 0) {
        markupSuffix = ` (+$${fixedValue})`;
      }
    } else {
      const percentValue = Number(followInfo.markup_percentage ?? followInfo.markup ?? 0);
      if (Number.isFinite(percentValue) && percentValue > 0) {
        markupSuffix = ` (+${Math.round(percentValue)}%)`;
      }
    }
  }
  const modeLabel = isResell ? `Перепродажа${markupSuffix}` : 'Мониторинг';

  lines.push(`🏪 ${shopName}`);
  lines.push(`Режим: ${modeLabel}`);
  lines.push('');

  if (!Array.isArray(products) || products.length === 0) {
    lines.push(isResell ? followMessages.resellProductsEmpty : followMessages.monitorProductsEmpty);
    return lines.join('\n');
  }

  const markupValue = markupType === 'fixed'
    ? (followInfo.markup_fixed ?? 0)
    : (followInfo.markup_percentage ?? followInfo.markup ?? 0);

  products.slice(0, 10).forEach((product, index) => {
    if (isResell) {
      const synced = product.synced_product || product.syncedProduct || {};
      const name =
        synced.name || product.source_product?.name || product.name || `Товар #${product.id}`;
      const sourcePrice = product.source_product?.price ?? 0;
      const stock = synced.stock_quantity ?? product.source_product?.stock_quantity ?? 0;
      const priceStr = formatPriceWithMarkup(sourcePrice, markupType, markupValue);
      lines.push(`${index + 1}. ${name}`);
      lines.push(`   💰 ${priceStr} • ${Number.isFinite(stock) ? stock : 0} шт`);
    } else {
      const name = product.name || `Товар #${product.id}`;
      const price = product.price ?? 0;
      const stock = product.stock_quantity ?? 0;
      lines.push(formatProductLine(index, name, price, stock));
    }
  });

  return lines.join('\n');
};

/**
 * View all follows for current shop
 */
export const handleViewFollows = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.reply(generalMessages.shopRequired, sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      await ctx.reply(
        generalMessages.authorizationRequired,
        sellerMenu(0, { hasFollows: ctx.session?.hasFollows })
      );
      return;
    }

    const follows = await followApi.getMyFollows(ctx.session.shopId, ctx.session.token);

    const hasFollows = Array.isArray(follows) && follows.length > 0;
    ctx.session.hasFollows = hasFollows;

    if (!hasFollows) {
      const text = `${followMessages.contextDetailed}\n\n${followMessages.emptyState}`;
      await sendOrEdit(ctx, text, followsMenu(false));
      return;
    }

    const followButtons = follows.map((follow) => [
      Markup.button.callback(buildFollowLabel(follow), `follow_detail:${follow.id}`),
    ]);

    const listText = follows
      .map((follow, index) => `${index + 1}. ${buildFollowLabel(follow).slice(2)}`) // remove leading emoji for text list
      .join('\n');

    const message = `${followMessages.contextDetailed}\n\n${listText}`;

    await sendOrEdit(ctx, message, followsMenu(true, followButtons));
    logger.info(`User ${ctx.from.id} viewed follows (${follows.length} total)`);
  } catch (error) {
    logger.error('Error fetching follows:', error);
    await sendOrEdit(ctx, followMessages.loadError, followsMenu(Boolean(ctx.session?.hasFollows)));
  }
};

/**
 * Start creating a follow
 * P2-9 FIX: Validate shop existence before entering scene
 */
export const handleCreateFollow = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // P2-9 FIX: Validate shop exists in database
    const isValid = await validateShopBeforeScene(ctx, 'createFollow');
    if (!isValid) return;

    await ctx.scene.enter('createFollow');
  } catch (error) {
    logger.error('Error entering createFollow scene:', error);
    await ctx.reply(generalMessages.actionFailed, followsMenu(Boolean(ctx.session?.hasFollows)));
  }
};

/**
 * View follow detail
 */
export const handleFollowDetail = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired);
      return;
    }

    const token = ctx.session.token;

    let followDetail;
    try {
      followDetail = await followApi.getFollowDetail(followId, token);
    } catch (error) {
      if (error.response?.status === 404) {
        await ctx.editMessageText(followMessages.notFound, followsMenu(false));
        return;
      }
      if (error.response?.status === 403) {
        await ctx.editMessageText(followMessages.accessDenied, followsMenu(false));
        return;
      }
      throw error;
    }

    const productsPayload = await followApi.getFollowProducts(followId, token, { limit: 10 });
    const payload = productsPayload?.data || productsPayload || {};
    const mode = payload.mode || followDetail.mode;
    const products = Array.isArray(payload.products) ? payload.products : [];

    const message = buildCatalogMessage(followDetail, products, mode);

    await ctx.editMessageText(message, followCatalogMenu(followId));
    logger.info(`User ${ctx.from.id} viewed follow catalog ${followId}`);
  } catch (error) {
    // Telegram error when message content unchanged - silently ignore
    if (error.message?.includes('message is not modified')) {
      await ctx.answerCbQuery('Данные актуальны').catch(() => {});
      return;
    }

    logger.error('Error viewing follow detail:', error);
    const status = error.response?.status;
    if (status === 404) {
      await ctx.editMessageText(followMessages.notFound, followsMenu(false));
    } else if (status === 403) {
      await ctx.editMessageText(followMessages.accessDenied, followsMenu(false));
    } else {
      await ctx.editMessageText(followMessages.loadError, followsMenu(false));
    }
  }
};

export const handleFollowSettings = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1], 10);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired);
      return;
    }

    const follow = await followApi.getFollowDetail(followId, ctx.session.token);

    const message = formatFollowDetail(follow);
    await ctx.editMessageText(message, followDetailMenu(followId, follow.mode));
    logger.info(`User ${ctx.from.id} viewed follow settings ${followId}`);
  } catch (error) {
    logger.error('Error viewing follow settings:', error);

    const status = error.response?.status;
    if (status === 404) {
      await ctx.editMessageText(followMessages.notFound, followsMenu(false));
    } else if (status === 403) {
      await ctx.editMessageText(followMessages.accessDenied, followsMenu(false));
    } else {
      await ctx.editMessageText(followMessages.loadError, followsMenu(false));
    }
  }
};

/**
 * Delete follow with confirmation
 */
export const handleDeleteFollow = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired);
      return;
    }

    await followApi.deleteFollow(followId, ctx.session.token);
    logger.info(`User ${ctx.from.id} deleted follow ${followId}`);

    const follows = await followApi.getMyFollows(ctx.session.shopId, ctx.session.token);
    const hasFollows = Array.isArray(follows) && follows.length > 0;
    ctx.session.hasFollows = hasFollows;

    if (!hasFollows) {
      const text = `${followMessages.contextDetailed}\n\n${followMessages.emptyState}`;
      await ctx.editMessageText(text, followsMenu(false));
      return;
    }

    const followButtons = follows.map((follow) => [
      Markup.button.callback(buildFollowLabel(follow), `follow_detail:${follow.id}`),
    ]);

    const listText = follows
      .map((follow, index) => `${index + 1}. ${buildFollowLabel(follow).slice(2)}`)
      .join('\n');

    const message = `${followMessages.contextDetailed}\n\n${listText}`;

    await ctx.editMessageText(message, followsMenu(true, followButtons));
  } catch (error) {
    logger.error('Error deleting follow:', error);
    await ctx.editMessageText(followMessages.deleteError, followsMenu(false));
  }
};

/**
 * Switch follow mode (Monitor ↔ Resell)
 * P1-BOT-003 FIX: Use scene for markup input to prevent race conditions
 * P2-9 FIX: Validate shop existence before entering scene
 */
export const handleSwitchMode = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired);
      return;
    }

    const follow = await followApi.getFollowDetail(followId, ctx.session.token);

    const newMode = follow.mode === 'monitor' ? 'resell' : 'monitor';

    // If switching to resell, need markup percentage - use scene
    if (newMode === 'resell') {
      // P2-9 FIX: Validate shop exists before entering scene
      const isValid = await validateShopBeforeScene(ctx, 'editFollowMarkup');
      if (!isValid) return;

      await ctx.scene.enter('editFollowMarkup', {
        followId,
        pendingModeSwitch: 'resell',
      });
      return;
    }

    // Switch to monitor mode (no markup needed)
    await followApi.switchMode(followId, newMode, ctx.session.token);

    const updated = await followApi.getFollowDetail(followId, ctx.session.token);
    const message = formatFollowDetail(updated);
    await ctx.editMessageText(message, followDetailMenu(followId, updated.mode));
    logger.info(`User ${ctx.from.id} switched follow ${followId} to ${newMode}`);
  } catch (error) {
    logger.error('Error switching mode:', error);

    const errorMsg = error.response?.data?.error;

    if (error.response?.status === 402) {
      await ctx.editMessageText(followMessages.limitReached, followsMenu(false));
    } else if (error.response?.status === 404) {
      await ctx.editMessageText(followMessages.notFound, followsMenu(false));
    } else if (errorMsg?.toLowerCase().includes('circular')) {
      await ctx.editMessageText(followMessages.modeLimit, followsMenu(false));
    } else {
      await ctx.editMessageText(followMessages.switchError, followsMenu(false));
    }
  }
};

/**
 * Handle edit markup button click
 * P1-BOT-003 FIX: Use scene instead of inline handler to prevent race conditions
 * P2-9 FIX: Validate shop existence before entering scene
 */
export const handleEditMarkup = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired);
      return;
    }

    // P2-9 FIX: Validate shop exists before entering scene
    const isValid = await validateShopBeforeScene(ctx, 'editFollowMarkup');
    if (!isValid) return;

    // Enter scene with followId in state
    await ctx.scene.enter('editFollowMarkup', { followId });

    logger.info(`User ${ctx.from.id} initiated markup edit for follow ${followId}`);
  } catch (error) {
    logger.error('Error initiating markup edit:', error);
    await ctx.editMessageText(followMessages.switchError);
  }
};

// P1-BOT-003 FIX: Removed inline handleMarkupUpdate handler
// Now using editFollowMarkup scene to prevent race conditions

/**
 * Setup follow-related handlers
 * P1-BOT-003 FIX: Removed inline text handler, now using scene
 */
export const setupFollowHandlers = (bot) => {
  // View follows list
  bot.action('follows:list', handleViewFollows);
  bot.action('seller:follows', handleViewFollows);

  // Create follow
  bot.action('follows:create', handleCreateFollow);

  // View follow detail (pattern: follow_detail:123)
  bot.action(/^follow_detail:(\d+)$/, handleFollowDetail);

  // View follow settings
  bot.action(/^follow_settings:(\d+)$/, handleFollowSettings);

  // Delete follow (pattern: follow_delete:123)
  bot.action(/^follow_delete:(\d+)$/, handleDeleteFollow);

  // Switch mode (pattern: follow_mode:123)
  bot.action(/^follow_mode:(\d+)$/, handleSwitchMode);

  // Edit markup (pattern: follow_edit:123) - now enters scene
  bot.action(/^follow_edit:(\d+)$/, handleEditMarkup);

  logger.info('Follow handlers registered');
};
