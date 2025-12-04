/**
 * Seller Tips System - smart tips and warnings for sellers
 */
import { t } from '../i18n/index.js';

// Tips keys for rotation
const TIP_KEYS = ['follow', 'resell', 'ai', 'stats', 'workers'];

// Contextual tips based on missing features
const CONTEXTUAL_TIP_KEYS = ['addEth', 'addBtc', 'addUsdt', 'addWorker'];

/**
 * Get next tip (avoiding the last shown one)
 */
function getNextTipKey(lastTipKey, availableKeys = TIP_KEYS) {
  // If few tips or lastTipKey not set, choose random
  if (availableKeys.length <= 1 || !lastTipKey) {
    return availableKeys[Math.floor(Math.random() * availableKeys.length)];
  }

  // Filter out last shown tip
  const filtered = availableKeys.filter((key) => key !== lastTipKey);

  // Choose random from remaining
  return filtered[Math.floor(Math.random() * filtered.length)];
}

/**
 * Get contextual tips based on what's missing
 * @param {Object} shopHealth - Shop health data with wallets and tier info
 * @returns {string[]} - Array of applicable contextual tip keys
 */
function getContextualTipKeys(shopHealth) {
  const tips = [];

  // Check missing wallets (only if at least one wallet exists - not critical)
  if (shopHealth.hasWallets && shopHealth.wallets) {
    if (!shopHealth.wallets.ETH) tips.push('addEth');
    if (!shopHealth.wallets.BTC) tips.push('addBtc');
    if (!shopHealth.wallets.USDT) tips.push('addUsdt');
  }

  // Check workers (only for PRO/MAX tiers)
  if (['pro', 'max'].includes(shopHealth.tier) && !shopHealth.hasWorkers) {
    tips.push('addWorker');
  }

  return tips;
}

/**
 * Get tip/warning for shop based on its state
 * @param {Object} ctx - Telegraf context
 * @param {Object} shopHealth - Shop state { hasWallets, wallets, productsCount, tier, hasWorkers }
 * @returns {string|null} - Text to show or null
 */
function getTipForShop(ctx, shopHealth) {
  const lang = ctx.lang || 'ru';

  // Priority 1: Critical warnings (with warning emoji)

  // Check wallets - CRITICAL
  if (!shopHealth.hasWallets) {
    return t('warnings.noWalletsCritical', {}, lang);
  }

  // Check products
  if (shopHealth.productsCount === 0) {
    return t('warnings.noProducts', {}, lang);
  }

  // Priority 2: Contextual tips based on missing features (30% chance)
  const contextualKeys = getContextualTipKeys(shopHealth);
  if (contextualKeys.length > 0 && Math.random() < 0.3) {
    const lastTipKey = ctx.session?.lastTipShown || null;
    const nextTipKey = getNextTipKey(lastTipKey, contextualKeys);

    if (ctx.session) {
      ctx.session.lastTipShown = nextTipKey;
      ctx.session.lastTipTimestamp = Date.now();
    }

    return t(`tips.${nextTipKey}`, {}, lang);
  }

  // Priority 3: General useful tips (rotation)
  const lastTipKey = ctx.session?.lastTipShown || null;
  const nextTipKey = getNextTipKey(lastTipKey, TIP_KEYS);

  // Save shown tip key in session
  if (ctx.session) {
    ctx.session.lastTipShown = nextTipKey;
    ctx.session.lastTipTimestamp = Date.now();
  }

  return t(`tips.${nextTipKey}`, {}, lang);
}

export { getTipForShop, getNextTipKey, getContextualTipKeys, TIP_KEYS, CONTEXTUAL_TIP_KEYS };
