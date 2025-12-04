import { mainMenu, languageMenu } from '../keyboards/main.js';
import { shopApi, authApi, api } from '../utils/api.js';
import { handleSellerRole } from './seller/index.js';
import { handleBuyerRole } from './buyer/index.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { t } from '../i18n/index.js';

/**
 * Helper to create fake callback context for role handlers
 * CRITICAL: Don't use Object.assign with getters - spread operator preserves them
 */
function createFakeCallbackContext(ctx) {
  return {
    ...ctx,
    answerCbQuery: async () => {},
    editMessageText: async (text, extra) => {
      return await ctx.reply(text, extra);
    },
    // H14 FIX: Copy essential Telegraf.js methods with optional chaining
    reply: ctx.reply?.bind(ctx),
    replyWithHTML: ctx.replyWithHTML?.bind(ctx),
    replyWithMarkdown: ctx.replyWithMarkdown?.bind(ctx),
    deleteMessage: ctx.deleteMessage?.bind(ctx),
    telegram: ctx.telegram,
    // Explicitly copy getters (important for Telegraf.js)
    from: ctx.from,
    message: ctx.message,
    chat: ctx.chat,
    session: ctx.session,
  };
}

/**
 * /start command handler
 */
/**
 * Parse deep link payload from /start command
 * Supports: shop_123 (invite link to shop)
 */
const parseDeepLink = (text) => {
  if (!text) return null;

  const args = text.split(' ');
  const payload = args[1]; // "shop_123" or undefined

  if (payload && payload.startsWith('shop_')) {
    const shopId = parseInt(payload.replace('shop_', ''), 10);
    if (!isNaN(shopId) && shopId > 0) {
      return { type: 'shop_invite', shopId };
    }
  }

  return null;
};

/**
 * Handle shop invite deep link - subscribe user to shop
 */
const handleShopInvite = async (ctx, shopId) => {
  const lang = ctx.lang || ctx.session?.user?.language || 'ru';

  try {
    // Subscribe to shop via API
    await api.post(`/shops/${shopId}/subscribe`, {}, {
      headers: { Authorization: `Bearer ${ctx.session.token}` },
    });

    // Try to get shop name for better UX
    let shopName = `#${shopId}`;
    try {
      const shop = await shopApi.getShop(shopId, ctx.session.token);
      if (shop?.name) {
        shopName = shop.name;
      }
    } catch {
      // Use ID if shop name fetch fails
    }

    await ctx.reply(t('inviteLink.subscribed', { shopName }, lang));
    logger.info(`User ${ctx.from.id} subscribed to shop ${shopId} via invite link`);
  } catch (error) {
    // Silently ignore errors (already subscribed, shop doesn't exist, etc.)
    if (error.response?.status === 409) {
      // Already subscribed - not an error
      logger.debug(`User ${ctx.from.id} already subscribed to shop ${shopId}`);
    } else if (error.response?.status === 404) {
      logger.warn(`Shop ${shopId} not found for invite link`);
    } else {
      logger.warn('Shop subscribe via invite link failed:', error.message);
    }
  }
};

export const handleStart = async (ctx) => {
  try {
    logger.info(`/start command from user ${ctx.from.id}`);

    // Parse deep link payload (e.g., shop_123)
    const deepLink = parseDeepLink(ctx.message?.text);
    if (deepLink) {
      logger.info(`Deep link detected: ${deepLink.type}`, { payload: deepLink });
      ctx.session.pendingDeepLink = deepLink;
    }

    // CRITICAL: Leave any active scene
    if (ctx.scene && ctx.scene.current) {
      logger.info(`User ${ctx.from.id} forced to leave scene ${ctx.scene.current} via /start`);
      await ctx.scene.leave();
    }

    // Force clear __scenes from Redis session
    // ctx.scene.leave() doesn't always remove __scenes on errors
    if (ctx.session && ctx.session.__scenes) {
      delete ctx.session.__scenes;
      logger.info(`Cleared __scenes from session for user ${ctx.from.id}`);
    }

    // Clear conversation history on /start
    delete ctx.session.aiConversation;
    delete ctx.session.pendingAI;

    // === PRIORITY 0: Check if language is set (first-time user) ===
    if (!ctx.session.user?.language) {
      logger.info(`User ${ctx.from.id} has no language set, showing language selection`);
      await smartMessage.send(ctx, {
        text: t('settings.selectLanguage', {}, 'en'),
        keyboard: languageMenu('en'),
      });
      return;
    }

    // === Handle pending deep link (shop invite) ===
    // Process after language is set and user has token
    if (ctx.session.pendingDeepLink && ctx.session.token) {
      const pendingDeepLink = ctx.session.pendingDeepLink;
      delete ctx.session.pendingDeepLink;

      if (pendingDeepLink.type === 'shop_invite') {
        await handleShopInvite(ctx, pendingDeepLink.shopId);
      }
    }

    // === PRIORITY 1: Check if user has shop (seller priority) ===
    if (ctx.session.token) {
      try {
        const shops = await shopApi.getMyShop(ctx.session.token);

        if (shops && Array.isArray(shops) && shops.length > 0) {
          logger.info(`User ${ctx.from.id} has shop, auto-selecting seller role`);
          const primaryShop = shops[0];
          ctx.session.shopId = primaryShop.id;
          ctx.session.shopName = primaryShop.name || ctx.session.shopName;
          ctx.session.shopTier = primaryShop.tier || ctx.session.shopTier;
          ctx.session.role = 'seller';

          // Persist seller role in session user
          if (ctx.session.user) {
            ctx.session.user.selectedRole = 'seller';
          }

          // Save seller role to database
          try {
            await authApi.updateRole('seller', ctx.session.token);
            logger.info(`User ${ctx.from.id} role saved to DB: seller`);
          } catch (error) {
            logger.error('Failed to save seller role to DB:', error);
            // Continue anyway - role is set in session
          }

          // Redirect to seller dashboard
          // PERF: Pass skipRoleUpdate since we already called updateRole above
          const fakeCtx = createFakeCallbackContext(ctx);
          await handleSellerRole(fakeCtx, { skipRoleUpdate: true });
          return;
        }
      } catch (error) {
        logger.debug('No shop found (expected for buyers):', error.message);
        // Continue to check saved role
      }
    }

    // === PRIORITY 2: Check saved role (buyer fallback) ===
    const savedRole = ctx.session.user?.selectedRole;

    if (savedRole === 'buyer') {
      logger.info(`User ${ctx.from.id} has saved buyer role`);
      ctx.session.role = 'buyer';

      // PERF: Role already saved in DB from previous session, skip update
      const fakeCtx = createFakeCallbackContext(ctx);
      await handleBuyerRole(fakeCtx, { skipRoleUpdate: true });
      return;
    } else if (savedRole === 'seller') {
      // Seller without shop - should not happen, but handle gracefully
      logger.warn(`User ${ctx.from.id} has seller role but no shop`);
      ctx.session.role = 'seller';

      // PERF: Role already saved in DB from previous session, skip update
      const fakeCtx = createFakeCallbackContext(ctx);
      await handleSellerRole(fakeCtx, { skipRoleUpdate: true });
      return;
    }

    // === PRIORITY 3: New user - show role selection ===
    logger.info('New user, showing role selection menu');
    ctx.session.role = null;

    // Check if user has workspace access
    let showWorkspace = false;
    if (ctx.session.token) {
      try {
        const workerShops = await shopApi.getWorkerShops(ctx.session.token);
        showWorkspace = workerShops && workerShops.length > 0;
        logger.info(`User ${ctx.from.id} has workspace access: ${showWorkspace}`);
      } catch (error) {
        // Expected for new users or users without worker access
        logger.debug('Workspace check gracefully failed (expected for non-workers)', {
          userId: ctx.from.id,
          status: error.response?.status,
        });
        // Continue without workspace button
      }
    }

    // Send welcome message using smartMessage (edit if exists, else send new)
    const lang = ctx.lang || ctx.session?.user?.language || 'ru';
    await smartMessage.send(ctx, {
      text: ctx.t('start.welcome'),
      keyboard: mainMenu(showWorkspace, lang),
    });
  } catch (error) {
    logger.error('Error in /start handler:', error);
    throw error;
  }
};
