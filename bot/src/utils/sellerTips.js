/**
 * Seller Tips System - smart tips and warnings for sellers
 */
import { t } from '../i18n/index.js';

// Tips keys for rotation
const TIP_KEYS = ['follow', 'resell', 'ai', 'stats', 'workers'];

/**
 * Get next tip (avoiding the last shown one)
 */
function getNextTipKey(lastTipKey) {
  // If few tips or lastTipKey not set, choose random
  if (TIP_KEYS.length <= 1 || !lastTipKey) {
    return TIP_KEYS[Math.floor(Math.random() * TIP_KEYS.length)];
  }

  // Filter out last shown tip
  const availableTips = TIP_KEYS.filter((key) => key !== lastTipKey);

  // Choose random from remaining
  return availableTips[Math.floor(Math.random() * availableTips.length)];
}

/**
 * Get tip/warning for shop based on its state
 * @param {Object} ctx - Telegraf context
 * @param {Object} shopHealth - Shop state { hasWallets, productsCount, tier }
 * @returns {string|null} - Text to show or null
 */
function getTipForShop(ctx, shopHealth) {
  const lang = ctx.lang || 'ru';

  // Priority 1: Critical warnings

  // Check wallets
  if (!shopHealth.hasWallets) {
    return t('warnings.noWallets', {}, lang);
  }

  // Check products
  if (shopHealth.productsCount === 0) {
    return t('warnings.noProducts', {}, lang);
  }

  // Priority 2: Useful tips (rotation)
  const lastTipKey = ctx.session.lastTipShown || null;
  const nextTipKey = getNextTipKey(lastTipKey);

  // Save shown tip key in session
  ctx.session.lastTipShown = nextTipKey;
  ctx.session.lastTipTimestamp = Date.now();

  return t(`tips.${nextTipKey}`, {}, lang);
}

export { getTipForShop, getNextTipKey, TIP_KEYS };
