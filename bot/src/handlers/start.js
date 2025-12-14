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
    answerCbQuery: async () => { },
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
 * Supports:
 * - Legacy: shop_123 (invite link to shop by ID)
 * - New: CoolGadgets_x7k (invite link to shop by invite code)
 */
const parseDeepLink = (text) => {
  if (!text) return null;

  const args = text.split(' ');
  const payload = args[1]; // "shop_123" or "CoolGadgets_x7k" or undefined

  if (!payload) return null;

  // Legacy format: shop_123 (starts with "shop_" followed by digits only)
  const legacyMatch = payload.match(/^shop_(\d+)$/);
  if (legacyMatch) {
    const shopId = parseInt(legacyMatch[1], 10);
    if (!isNaN(shopId) && shopId > 0) {
      return { type: 'shop_invite', shopId, inviteCode: null };
    }
  }

  // Create shop deep link from WebApp
  if (payload === 'create_shop') {
    return { type: 'create_shop' };
  }

  // New format: any valid invite code (alphanumeric with underscore/hyphen, 3-50 chars)
  const inviteCodePattern = /^[a-zA-Z0-9_-]{3,50}$/;
  if (inviteCodePattern.test(payload)) {
    return { type: 'shop_invite', shopId: null, inviteCode: payload };
  }

  return null;
};

/**
 * Handle shop invite deep link - subscribe user to shop
 * Supports both legacy (shopId) and new (inviteCode) formats
 * After successful subscription, redirect to buyer menu
 */
const handleShopInvite = async (ctx, deepLink) => {
  const lang = ctx.lang || ctx.session?.language || 'ru';
  const { shopId: legacyShopId, inviteCode } = deepLink;

  try {
    // Resolve shop: either by ID (legacy) or by invite code (new)
    let shop = null;
    let shopId = legacyShopId;

    if (inviteCode) {
      // New format: lookup by invite code first
      try {
        shop = await shopApi.getShopByInviteCode(inviteCode, ctx.session.token);
        if (shop?.id) {
          shopId = shop.id;
        }
      } catch (lookupError) {
        if (lookupError.response?.status === 404) {
          logger.warn(`Shop not found for invite code: ${inviteCode}`);
          await ctx.reply(t('inviteLink.shopNotFound', {}, lang));
          return false;
        }
        throw lookupError;
      }
    }

    if (!shopId) {
      logger.warn(`Could not resolve shop from deep link`, { inviteCode, legacyShopId });
      await ctx.reply(t('inviteLink.shopNotFound', {}, lang));
      return false;
    }

    // Subscribe to shop via API
    await api.post(`/shops/${shopId}/subscribe`, {}, {
      headers: { Authorization: `Bearer ${ctx.session.token}` },
    });

    // Try to get shop name for better UX (if not already fetched)
    let shopName = shop?.name || `#${shopId}`;
    if (!shop) {
      try {
        shop = await shopApi.getShop(shopId, ctx.session.token);
        if (shop?.name) {
          shopName = shop.name;
        }
      } catch {
        // Use ID if shop name fetch fails
      }
    }

    await ctx.reply(t('inviteLink.subscribed', { shopName }, lang));
    logger.info(`User ${ctx.from.id} subscribed to shop ${shopId} via invite link`, { inviteCode });

    // Set buyer role and redirect to buyer menu
    ctx.session.role = 'buyer';
    try {
      await authApi.updateRole('buyer', ctx.session.token);
    } catch (roleError) {
      logger.error('Failed to save buyer role after invite:', roleError);
    }

    // Redirect to buyer menu so they see their subscriptions
    const fakeCtx = createFakeCallbackContext(ctx);
    await handleBuyerRole(fakeCtx, { skipRoleUpdate: true });
    return true; // Signal that we handled the flow
  } catch (error) {
    // Handle subscription errors with user feedback
    const errorMessage = error.response?.data?.error || error.message || '';
    const displayId = inviteCode || `#${legacyShopId}`;

    if (error.response?.status === 409) {
      // Already subscribed - show friendly message and redirect to buyer
      logger.debug(`User ${ctx.from.id} already subscribed to shop`, { inviteCode, legacyShopId });
      let shopName = displayId;
      try {
        const shop = legacyShopId
          ? await shopApi.getShop(legacyShopId, ctx.session.token)
          : await shopApi.getShopByInviteCode(inviteCode, ctx.session.token);
        shopName = shop?.name || displayId;
      } catch {
        // Use display ID if shop name fetch fails
      }
      await ctx.reply(t('inviteLink.alreadySubscribed', { shopName }, lang));

      // Still redirect to buyer menu
      ctx.session.role = 'buyer';
      try {
        await authApi.updateRole('buyer', ctx.session.token);
      } catch (roleError) {
        logger.error('Failed to save buyer role:', roleError);
      }
      const fakeCtx = createFakeCallbackContext(ctx);
      await handleBuyerRole(fakeCtx, { skipRoleUpdate: true });
      return true;
    } else if (error.response?.status === 400 && errorMessage.includes('own shop')) {
      // Cannot subscribe to own shop - redirect to seller menu
      logger.info(`User ${ctx.from.id} tried to subscribe to their own shop`, { inviteCode, legacyShopId });
      await ctx.reply(t('inviteLink.ownShop', {}, lang));

      // Need to get shopId if we only have inviteCode
      let resolvedShopId = legacyShopId;
      if (!resolvedShopId && inviteCode) {
        try {
          const shop = await shopApi.getShopByInviteCode(inviteCode, ctx.session.token);
          resolvedShopId = shop?.id;
        } catch {
          // Fallback
        }
      }

      // Redirect to seller menu since it's their shop
      ctx.session.role = 'seller';
      if (resolvedShopId) {
        ctx.session.shopId = resolvedShopId;
      }
      try {
        await authApi.updateRole('seller', ctx.session.token);
      } catch (roleError) {
        logger.error('Failed to save seller role:', roleError);
      }
      const fakeCtx = createFakeCallbackContext(ctx);
      await handleSellerRole(fakeCtx, { skipRoleUpdate: true });
      return true;
    } else if (error.response?.status === 404) {
      logger.warn(`Shop not found for invite link`, { inviteCode, legacyShopId });
      await ctx.reply(t('inviteLink.shopNotFound', {}, lang));
    } else {
      logger.warn('Shop subscribe via invite link failed:', error.message);
      await ctx.reply(t('inviteLink.error', {}, lang));
    }
    return false;
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

    // P0 FIX: DO NOT delete ctx.session.__scenes - it breaks scene transitions
    // ctx.scene.leave() above already handles cleanup properly
    // Deleting it manually causes race condition when leave() is followed by enter()

    // Clear conversation history on /start
    delete ctx.session.aiConversation;
    delete ctx.session.pendingAI;

    // === Handle pending deep link (shop invite) FIRST ===
    // For invite links: subscribe first, show LK, then ask language later
    if (ctx.session.pendingDeepLink && ctx.session.token) {
      const pendingDeepLink = ctx.session.pendingDeepLink;
      delete ctx.session.pendingDeepLink;

      if (pendingDeepLink.type === 'shop_invite') {
        // Mark that user needs language selection after seeing LK
        if (!ctx.session.language) {
          ctx.session.pendingLanguageSelection = true;
        }
        // Pass entire deepLink object (supports both shopId and inviteCode)
        const handled = await handleShopInvite(ctx, pendingDeepLink);
        if (handled) {
          // handleShopInvite redirected to buyer menu, stop here
          return;
        }
      }

      // Handle create_shop deep link from WebApp
      if (pendingDeepLink.type === 'create_shop') {
        logger.info(`User ${ctx.from.id} starting shop creation from WebApp deep link`);
        ctx.session.role = 'seller';
        await ctx.scene.enter('chooseTier');
        return;
      }
    }

    // === PRIORITY 0: Check if language is set (first-time user without invite) ===
    // Skip if user came via invite (they'll see language selection after LK)
    // FIX: Check if language is already in session (from DB sync or previous selection)
    // If language exists in session, consider it confirmed (don't ask again)
    const hasLanguageInSession = !!ctx.session.language;
    const isLanguageConfirmed = ctx.session.isLanguageConfirmed || hasLanguageInSession;

    if (!isLanguageConfirmed && !ctx.session.pendingLanguageSelection) {
      // Auto-detect language from Telegram for initial display
      const detectedLang = ctx.from?.language_code?.startsWith('ru') ? 'ru' : 'en';
      logger.info(`User ${ctx.from.id} has no confirmed language, showing language selection (detected: ${detectedLang})`);
      ctx.session.pendingLanguageSelection = true; // Prevent re-showing on refresh
      await smartMessage.send(ctx, {
        text: t('settings.selectLanguageWelcome', {}, detectedLang),
        keyboard: languageMenu(detectedLang),
      });
      return;
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
    const savedRole = ctx.session.role;

    if (savedRole === 'buyer') {
      logger.info(`User ${ctx.from.id} has saved buyer role`);
      ctx.session.role = 'buyer';

      // PERF: Role already saved in DB from previous session, skip update
      const fakeCtx = createFakeCallbackContext(ctx);
      await handleBuyerRole(fakeCtx, { skipRoleUpdate: true });
      return;
    } else if (savedRole === 'seller') {
      // Seller role in session but no shop found above
      // This can happen if user selected seller, then canceled shop creation
      // Reset role and fall through to role selection
      logger.warn(`User ${ctx.from.id} has seller role in session but no shop, resetting`);
      ctx.session.role = null;
      // Fall through to PRIORITY 3 (role selection)
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
    const lang = ctx.lang || ctx.session?.language || 'ru';
    await smartMessage.send(ctx, {
      text: ctx.t('start.welcome'),
      keyboard: mainMenu(showWorkspace, lang),
    });
  } catch (error) {
    logger.error('Error in /start handler:', error);
    throw error;
  }
};
