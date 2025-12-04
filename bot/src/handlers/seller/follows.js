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
import { getMessages } from '../../texts/messages.js';
import { validateShopBeforeScene } from '../../utils/sceneValidation.js';
import { t } from '../../i18n/index.js';

const getLangSafe = (ctx) => ctx.lang || ctx.session?.language || 'ru';
const getLocalizedMessages = (ctx) => getMessages(getLangSafe(ctx));

const formatMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
};

const buildFollowLabel = (follow, lang = 'ru') => {
  const name = follow.source_shop_name || follow.sourceShopName || follow.name || t('formatters.followShop', {}, lang);
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
  const modeLabel = isResell ? t('formatters.modeResell', {}, lang) : t('formatters.modeMonitor', {}, lang);
  return `🏪 ${name} (${modeLabel}${markupSuffix})`;
};

const sendOrEdit = async (ctx, text, keyboard) => {
  const replyMarkup = keyboard instanceof Object ? keyboard : undefined;
  if (ctx.updateType === 'callback_query' && ctx.callbackQuery?.message) {
    return ctx.editMessageText(text, replyMarkup);
  }
  return ctx.reply(text, replyMarkup);
};

const formatProductLine = (index, name, price, stock, lang = 'ru') => {
  const pcsLabel = t('orders.pcs', {}, lang);
  return `${index + 1}. ${name} • $${formatMoney(price)} • ${
    Number.isFinite(stock) ? stock : 0
  } ${pcsLabel}`;
};

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

const buildCatalogMessage = (followInfo, products, mode, lang = 'ru') => {
  const lines = [];
  const shopName = followInfo.source_shop_name || followInfo.sourceShopName || t('formatters.followShop', {}, lang);
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
  const resellLabel = t('formatters.modeResell', {}, lang);
  const monitorLabel = t('formatters.modeMonitor', {}, lang);
  const modeLabel = isResell ? `${resellLabel}${markupSuffix}` : monitorLabel;
  const modeCaption = t('formatters.followMode', {}, lang);

  lines.push(`🏪 ${shopName}`);
  lines.push(`${modeCaption}: ${modeLabel}`);
  lines.push('');

  if (!Array.isArray(products) || products.length === 0) {
    lines.push(
      isResell
        ? t('follows.resellProductsEmpty', {}, lang)
        : t('follows.monitorProductsEmpty', {}, lang)
    );
    return lines.join('\n');
  }

  const markupValue = markupType === 'fixed'
    ? (followInfo.markup_fixed ?? 0)
    : (followInfo.markup_percentage ?? followInfo.markup ?? 0);

  const pcsLabel = t('orders.pcs', {}, lang);
  const productLabel = t('orders.productDefault', {}, lang);
  const productsList = products.slice(0, 10);
  productsList.forEach((product, index) => {
    if (isResell) {
      const synced = product.synced_product || product.syncedProduct || {};
      const name =
        synced.name || product.source_product?.name || product.name || `${productLabel} #${product.id}`;
      const sourcePrice = product.source_product?.price ?? 0;
      const stock = synced.stock_quantity ?? product.source_product?.stock_quantity ?? 0;
      const priceStr = formatPriceWithMarkup(sourcePrice, markupType, markupValue);
      lines.push(`${index + 1}. ${name}`);
      lines.push(`   💰 ${priceStr} • ${Number.isFinite(stock) ? stock : 0} ${pcsLabel}`);
    } else {
      const name = product.name || `${productLabel} #${product.id}`;
      const price = product.price ?? 0;
      const stock = product.stock_quantity ?? 0;
      lines.push(formatProductLine(index, name, price, stock, lang));
    }
    // Add blank line between products for readability (except after last)
    if (index < productsList.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n');
};

/**
 * View all follows for current shop
 */
export const handleViewFollows = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages, follows: followMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.reply(generalMessages.shopRequired(lang), sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      await ctx.reply(
        generalMessages.authorizationRequired(lang),
        sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, lang)
      );
      return;
    }

    const follows = await followApi.getMyFollows(ctx.session.shopId, ctx.session.token);

    const hasFollows = Array.isArray(follows) && follows.length > 0;
    ctx.session.hasFollows = hasFollows;

    if (!hasFollows) {
      const text = `${followMessages.contextDetailed(lang)}\n\n${followMessages.emptyState(lang)}`;
      await sendOrEdit(ctx, text, followsMenu(false, [], lang));
      return;
    }

    const followButtons = follows.map((follow) => [
      Markup.button.callback(buildFollowLabel(follow, lang), `follow_detail:${follow.id}`),
    ]);

    const listText = follows
      .map((follow, index) => `${index + 1}. ${buildFollowLabel(follow, lang).slice(2)}`) // remove leading emoji for text list
      .join('\n');

    const message = `${followMessages.contextDetailed(lang)}\n\n${listText}`;

    await sendOrEdit(ctx, message, followsMenu(true, followButtons, lang));
    logger.info(`User ${ctx.from.id} viewed follows (${follows.length} total)`);
  } catch (error) {
    logger.error('Error fetching follows:', error);
    await sendOrEdit(ctx, followMessages.loadError(lang), followsMenu(Boolean(ctx.session?.hasFollows), [], lang));
  }
};

/**
 * Start creating a follow
 * P2-9 FIX: Validate shop existence before entering scene
 */
export const handleCreateFollow = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery();

    // P2-9 FIX: Validate shop exists in database
    const isValid = await validateShopBeforeScene(ctx, 'createFollow');
    if (!isValid) return;

    await ctx.scene.enter('createFollow');
  } catch (error) {
    logger.error('Error entering createFollow scene:', error);
    await ctx.reply(
      generalMessages.actionFailed(lang),
      followsMenu(Boolean(ctx.session?.hasFollows), [], lang)
    );
  }
};

/**
 * View follow detail
 * SECURITY FIX: Added shopId check as defense-in-depth (backend also verifies ownership)
 */
export const handleFollowDetail = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages, follows: followMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    // SECURITY FIX: Require shop session before accessing follows
    if (!ctx.session.shopId) {
      await ctx.editMessageText(generalMessages.shopRequired(lang), followsMenu(false, [], lang));
      return;
    }

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired(lang));
      return;
    }

    const token = ctx.session.token;

    // PERF: Fetch follow detail and products in parallel
    let followDetail;
    let productsPayload;

    try {
      [followDetail, productsPayload] = await Promise.all([
        followApi.getFollowDetail(followId, token),
        followApi.getFollowProducts(followId, token, { limit: 10 }),
      ]);
    } catch (error) {
      if (error.response?.status === 404) {
        await ctx.editMessageText(followMessages.notFound(lang), followsMenu(false, [], lang));
        return;
      }
      if (error.response?.status === 403) {
        // SECURITY: Log 403 access denied for audit trail
        logger.warn('SECURITY: 403 access denied for follow detail', {
          userId: ctx.from?.id,
          followId,
          shopId: ctx.session?.shopId,
        });
        await ctx.editMessageText(followMessages.accessDenied(lang), followsMenu(false, [], lang));
        return;
      }
      throw error;
    }

    const payload = productsPayload?.data || productsPayload || {};
    const mode = payload.mode || followDetail.mode;
    const products = Array.isArray(payload.products) ? payload.products : [];

    const message = buildCatalogMessage(followDetail, products, mode, lang);

    await ctx.editMessageText(message, followCatalogMenu(followId));
    logger.info(`User ${ctx.from.id} viewed follow catalog ${followId}`);
  } catch (error) {
    // Telegram error when message content unchanged - silently ignore
    if (error.message?.includes('message is not modified')) {
      await ctx.answerCbQuery(ctx.t('follows.dataActual')).catch(() => {});
      return;
    }

    logger.error('Error viewing follow detail:', error);
    const status = error.response?.status;
    if (status === 404) {
      await ctx.editMessageText(followMessages.notFound(lang), followsMenu(false, [], lang));
    } else if (status === 403) {
      await ctx.editMessageText(followMessages.accessDenied(lang), followsMenu(false, [], lang));
    } else {
      await ctx.editMessageText(followMessages.loadError(lang), followsMenu(false, [], lang));
    }
  }
};

export const handleFollowSettings = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages, follows: followMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1], 10);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired(lang));
      return;
    }

    const follow = await followApi.getFollowDetail(followId, ctx.session.token);

    const message = formatFollowDetail(follow, lang);
    await ctx.editMessageText(message, followDetailMenu(followId, follow.mode));
    logger.info(`User ${ctx.from.id} viewed follow settings ${followId}`);
  } catch (error) {
    logger.error('Error viewing follow settings:', error);

    const status = error.response?.status;
    if (status === 404) {
      await ctx.editMessageText(followMessages.notFound(lang), followsMenu(false, [], lang));
    } else if (status === 403) {
      await ctx.editMessageText(followMessages.accessDenied(lang), followsMenu(false, [], lang));
    } else {
      await ctx.editMessageText(followMessages.loadError(lang), followsMenu(false, [], lang));
    }
  }
};

/**
 * Show delete confirmation dialog
 */
export const handleDeleteFollow = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages, follows: followMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired(lang));
      return;
    }

    // Fetch follow details to show in confirmation
    let follow;
    try {
      follow = await followApi.getFollowDetail(followId, ctx.session.token);
    } catch (error) {
      if (error.response?.status === 404) {
        await ctx.editMessageText(followMessages.notFound(lang), followsMenu(false, [], lang));
        return;
      }
      throw error;
    }

    const shopName = follow.source_shop_name || follow.sourceShopName || t('formatters.followShop', {}, lang);
    const isResell = follow.mode === 'resell';

    let confirmMessage = ctx.t('follows.confirmDelete', { shopName });
    if (isResell) {
      confirmMessage += `\n\n${ctx.t('follows.confirmDeleteResell')}`;
    }

    const confirmKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(ctx.t('follows.confirmYes'), `confirm_delete_follow:${followId}`),
        Markup.button.callback(ctx.t('follows.confirmNo'), `cancel_delete_follow:${followId}`),
      ],
    ]);

    await ctx.editMessageText(confirmMessage, confirmKeyboard);
    logger.info(`User ${ctx.from.id} requested delete confirmation for follow ${followId}`);
  } catch (error) {
    logger.error('Error showing delete confirmation:', error);
    await ctx.editMessageText(followMessages.deleteError(lang), followsMenu(false, [], lang));
  }
};

/**
 * Confirm and execute follow deletion
 */
export const handleConfirmDeleteFollow = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages, follows: followMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery(ctx.t('follows.deleting'));

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired(lang));
      return;
    }

    await followApi.deleteFollow(followId, ctx.session.token);
    logger.info(`User ${ctx.from.id} confirmed and deleted follow ${followId}`);

    const follows = await followApi.getMyFollows(ctx.session.shopId, ctx.session.token);
    const hasFollows = Array.isArray(follows) && follows.length > 0;
    ctx.session.hasFollows = hasFollows;

    if (!hasFollows) {
      const text = `${followMessages.contextDetailed(lang)}\n\n${followMessages.emptyState(lang)}`;
      await ctx.editMessageText(text, followsMenu(false, [], lang));
      return;
    }

    const followButtons = follows.map((follow) => [
      Markup.button.callback(buildFollowLabel(follow, lang), `follow_detail:${follow.id}`),
    ]);

    const listText = follows
      .map((follow, index) => `${index + 1}. ${buildFollowLabel(follow, lang).slice(2)}`)
      .join('\n');

    const message = `${followMessages.contextDetailed(lang)}\n\n${listText}`;

    await ctx.editMessageText(message, followsMenu(true, followButtons, lang));
  } catch (error) {
    logger.error('Error deleting follow:', error);
    await ctx.editMessageText(followMessages.deleteError(lang), followsMenu(false, [], lang));
  }
};

/**
 * Cancel follow deletion - return to follow detail
 */
export const handleCancelDeleteFollow = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages, follows: followMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery(ctx.t('follows.cancelled'));

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired(lang));
      return;
    }

    // Return to follow settings view
    const follow = await followApi.getFollowDetail(followId, ctx.session.token);
    const message = formatFollowDetail(follow, lang);
    await ctx.editMessageText(message, followDetailMenu(followId, follow.mode));
    logger.info(`User ${ctx.from.id} cancelled delete for follow ${followId}`);
  } catch (error) {
    logger.error('Error cancelling delete:', error);
    // If follow not found, go back to list
    if (error.response?.status === 404) {
      await ctx.editMessageText(followMessages.notFound(lang), followsMenu(false, [], lang));
    } else {
      await ctx.editMessageText(followMessages.loadError(lang), followsMenu(false, [], lang));
    }
  }
};

/**
 * Switch follow mode (Monitor ↔ Resell)
 * P1-BOT-003 FIX: Use scene for markup input to prevent race conditions
 * P2-9 FIX: Validate shop existence before entering scene
 */
export const handleSwitchMode = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages, follows: followMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired(lang));
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

    // Switching to monitor mode - show warning if there are synced products
    const syncedCount =
      follow.synced_products_count ?? follow.synced_count ?? follow.syncedProducts ?? 0;

    if (syncedCount > 0) {
      // Show confirmation warning
      const warningText = ctx.t('follows.switchToMonitorWarning', { count: syncedCount });

      await ctx.editMessageText(
        warningText,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(ctx.t('follows.confirmSwitch'), `follow_mode_confirm:${followId}`),
            Markup.button.callback(ctx.t('follows.confirmNo'), `follow_settings:${followId}`),
          ],
        ])
      );
      return;
    }

    // No synced products - switch immediately
    await followApi.switchMode(followId, newMode, ctx.session.token);

    const updated = await followApi.getFollowDetail(followId, ctx.session.token);
    const message = formatFollowDetail(updated, lang);
    await ctx.editMessageText(message, followDetailMenu(followId, updated.mode));
    logger.info(`User ${ctx.from.id} switched follow ${followId} to ${newMode}`);
  } catch (error) {
    logger.error('Error switching mode:', error);

    const errorMsg = error.response?.data?.error;

    if (error.response?.status === 402) {
      await ctx.editMessageText(followMessages.limitReached(lang), followsMenu(false, [], lang));
    } else if (error.response?.status === 404) {
      await ctx.editMessageText(followMessages.notFound(lang), followsMenu(false, [], lang));
    } else if (errorMsg?.toLowerCase().includes('circular')) {
      await ctx.editMessageText(followMessages.modeLimit(lang), followsMenu(false, [], lang));
    } else {
      await ctx.editMessageText(followMessages.switchError(lang), followsMenu(false, [], lang));
    }
  }
};

/**
 * Confirm switch to monitor mode (after warning about synced products deletion)
 */
export const handleConfirmSwitchToMonitor = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages, follows: followMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery(ctx.t('follows.switching'));

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired(lang));
      return;
    }

    // Execute the switch to monitor mode
    await followApi.switchMode(followId, 'monitor', ctx.session.token);

    const updated = await followApi.getFollowDetail(followId, ctx.session.token);
    const message = formatFollowDetail(updated, lang);
    await ctx.editMessageText(message, followDetailMenu(followId, updated.mode));
    logger.info(`User ${ctx.from.id} confirmed switch follow ${followId} to monitor`);
  } catch (error) {
    logger.error('Error confirming mode switch:', error);

    const errorMsg = error.response?.data?.error;

    if (error.response?.status === 404) {
      await ctx.editMessageText(followMessages.notFound(lang), followsMenu(false, [], lang));
    } else if (errorMsg?.toLowerCase().includes('circular')) {
      await ctx.editMessageText(followMessages.modeLimit(lang), followsMenu(false, [], lang));
    } else {
      await ctx.editMessageText(followMessages.switchError(lang), followsMenu(false, [], lang));
    }
  }
};

/**
 * Handle edit markup button click
 * P1-BOT-003 FIX: Use scene instead of inline handler to prevent race conditions
 * P2-9 FIX: Validate shop existence before entering scene
 */
export const handleEditMarkup = async (ctx) => {
  const lang = getLangSafe(ctx);
  const { general: generalMessages, follows: followMessages } = getLocalizedMessages(ctx);
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired(lang));
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
    await ctx.editMessageText(followMessages.switchError(lang));
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

  // Delete follow (pattern: follow_delete:123) - shows confirmation
  bot.action(/^follow_delete:(\d+)$/, handleDeleteFollow);

  // Confirm delete follow (pattern: confirm_delete_follow:123)
  bot.action(/^confirm_delete_follow:(\d+)$/, handleConfirmDeleteFollow);

  // Cancel delete follow (pattern: cancel_delete_follow:123)
  bot.action(/^cancel_delete_follow:(\d+)$/, handleCancelDeleteFollow);

  // Switch mode (pattern: follow_mode:123)
  bot.action(/^follow_mode:(\d+)$/, handleSwitchMode);

  // Confirm switch to monitor mode (pattern: follow_mode_confirm:123)
  bot.action(/^follow_mode_confirm:(\d+)$/, handleConfirmSwitchToMonitor);

  // Edit markup (pattern: follow_edit:123) - now enters scene
  bot.action(/^follow_edit:(\d+)$/, handleEditMarkup);

  logger.info('Follow handlers registered');
};
