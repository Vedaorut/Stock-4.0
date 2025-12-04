import { sellerMenuNoShop } from '../keyboards/seller.js';
import { shopApi } from './api.js';
import logger from './logger.js';

/**
 * Validate shop before entering scene
 *
 * This middleware prevents crashes inside scenes by validating:
 * 1. shopId exists in session
 * 2. token exists in session
 * 3. shop EXISTS in database (critical!)
 * 4. shop belongs to user (ownership validation)
 *
 * If validation fails, it:
 * - Shows user-friendly error message
 * - Clears invalid shopId from session
 * - Returns to appropriate menu
 * - Returns false to prevent scene entry
 *
 * Usage:
 * ```javascript
 * bot.action('seller:add_product', async (ctx) => {
 *   await ctx.answerCbQuery();
 *
 *   const isValid = await validateShopBeforeScene(ctx, 'addProduct');
 *   if (!isValid) return;
 *
 *   await ctx.scene.enter('addProduct');
 * });
 * ```
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} sceneName - Scene name for logging
 * @returns {Promise<boolean>} - true if valid, false if invalid
 */
export const validateShopBeforeScene = async (ctx, sceneName) => {
  // 1. Check shopId exists in session
  if (!ctx.session.shopId) {
    logger.warn(`[validateShop] No shopId for scene ${sceneName}`);
    await ctx.reply(ctx.t('errors.shopRequired'), sellerMenuNoShop);
    return false;
  }

  // 2. Check token exists in session
  if (!ctx.session.token) {
    logger.warn(`[validateShop] No token for scene ${sceneName}`);
    await ctx.reply(ctx.t('errors.authRequired'));
    return false;
  }

  // 3. VALIDATE shop EXISTS in database and belongs to user
  try {
    const shop = await shopApi.getShop(ctx.session.shopId, ctx.session.token);

    if (!shop) {
      logger.warn(`[validateShop] Shop ${ctx.session.shopId} not found for scene ${sceneName}`);
      ctx.session.shopId = null; // Clear invalid shopId
      await ctx.reply(ctx.t('general.shopNotFound'), sellerMenuNoShop);
      return false;
    }

    // Update session with fresh shop data
    ctx.session.shopName = shop.name;
    ctx.session.shopTier = shop.tier || 'pro';

    logger.info(`[validateShop] ✅ Shop ${shop.id} validated for scene ${sceneName}`);
    return true; // ✅ Valid
  } catch (error) {
    // Handle specific HTTP errors
    if (error.response?.status === 404) {
      logger.warn(`[validateShop] Shop ${ctx.session.shopId} returned 404 for scene ${sceneName}`);
      ctx.session.shopId = null; // Clear invalid shopId
      await ctx.reply(ctx.t('general.shopNotFound'), sellerMenuNoShop);
      return false;
    }

    if (error.response?.status === 403) {
      logger.warn(
        `[validateShop] Access denied to shop ${ctx.session.shopId} for scene ${sceneName}`
      );
      ctx.session.shopId = null; // Clear invalid shopId
      await ctx.reply(
        ctx.t('errors.shopAccessDenied'),
        sellerMenuNoShop
      );
      return false;
    }

    if (error.response?.status === 401) {
      logger.warn(
        `[validateShop] Unauthorized for shop ${ctx.session.shopId} for scene ${sceneName}`
      );
      ctx.session.token = null; // Clear invalid token
      await ctx.reply(ctx.t('errors.sessionExpired'));
      return false;
    }

    // Handle network errors gracefully
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      logger.error(`[validateShop] Network error for scene ${sceneName}:`, error.message);
      try {
        await ctx.answerCbQuery(ctx.t('errors.serverUnavailable'), { show_alert: true });
      } catch {
        // Ignore answerCbQuery errors
      }
      return false;
    }

    // Re-throw other errors (500, etc.)
    logger.error(`[validateShop] Error validating shop for scene ${sceneName}:`, error);
    throw error;
  }
};
