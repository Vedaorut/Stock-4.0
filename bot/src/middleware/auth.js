import { authApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import { t, getLang } from '../i18n/index.js';

/**
 * Authentication middleware
 * Automatically registers/logs in user via Backend API
 */
const authMiddleware = async (ctx, next) => {
  try {
    // Skip for non-user updates
    if (!ctx.from) {
      return next();
    }

    ctx.session = ctx.session || {};

    // Check if user already authenticated in session
    // IMPORTANT: Both token AND user must be truthy (not null/undefined)
    // Also check that token is not too old (refresh if older than 6 days)
    if (ctx.session.token && ctx.session.user) {
      // Old sessions may be missing tokenCreatedAt — backfill without forcing re-auth
      if (!ctx.session.tokenCreatedAt) {
        ctx.session.tokenCreatedAt = new Date().toISOString();
        logger.info(`Backfilled tokenCreatedAt for user ${ctx.from.id}`);
        return next();
      }

      const tokenAge = Date.now() - new Date(ctx.session.tokenCreatedAt).getTime();
      const sixDays = 6 * 24 * 60 * 60 * 1000;
      if (tokenAge < sixDays) {
        return next(); // Token is valid and fresh
      }
      logger.info(
        `Token age ${Math.floor(tokenAge / (24 * 60 * 60 * 1000))} days, refreshing for user ${ctx.from.id}`
      );
    }

    // Force re-auth if token is null but user exists (corrupted session state)
    // Or if tokenCreatedAt is missing (old session format)
    if (ctx.session?.user && (!ctx.session?.token || !ctx.session?.tokenCreatedAt)) {
      logger.info(`Forcing re-auth for user ${ctx.from.id} (token was null or no creation time)`);
    }

    // Extract user data from Telegram
    // Fallback for firstName: Telegram requires first_name, but just in case
    const userData = {
      username: ctx.from.username || null,
      firstName: ctx.from.first_name || ctx.from.username || 'User',
      lastName: ctx.from.last_name || null,
      languageCode: ctx.from.language_code,
    };

    // Authenticate with backend
    const authData = await authApi.authenticate(ctx.from.id, userData);

    if (!authData?.token || !authData?.user) {
      throw new Error('Invalid authentication response from backend');
    }

    // Store in session (preserve existing shopId/role if they exist)
    const existingShopId = ctx.session.shopId;
    const existingShopName = ctx.session.shopName;
    const existingRole = ctx.session.role;

    ctx.session.token = authData.token;
    ctx.session.user = authData.user;
    ctx.session.tokenCreatedAt = new Date().toISOString(); // Track token creation time
    ctx.session.role = existingRole || null;
    ctx.session.shopId = existingShopId || null; // Preserve if exists
    ctx.session.shopName = existingShopName || null;

    logger.info(`User authenticated: ${ctx.from.id} (@${ctx.from.username})`);

    return next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    ctx.session.authError = error.message;

    // Surface a clear message without mutating token/user to null
    if (ctx.reply) {
      const lang = getLang(ctx);
      await ctx.reply(t('errors.authenticationFailed', {}, lang));
    }
    return;
  }
};

export default authMiddleware;
