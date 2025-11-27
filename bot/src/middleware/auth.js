import { authApi } from '../utils/api.js';
import logger from '../utils/logger.js';

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

    // Check if user already authenticated in session
    // IMPORTANT: Both token AND user must be truthy (not null/undefined)
    if (ctx.session?.token && ctx.session?.user) {
      return next();
    }

    // Force re-auth if token is null but user exists (corrupted session state)
    if (ctx.session?.user && !ctx.session?.token) {
      logger.info(`Forcing re-auth for user ${ctx.from.id} (token was null)`);
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
    ctx.session = ctx.session || {};
    const existingShopId = ctx.session.shopId;
    const existingShopName = ctx.session.shopName;
    const existingRole = ctx.session.role;

    ctx.session.token = authData.token;
    ctx.session.user = authData.user;
    ctx.session.role = existingRole || null;
    ctx.session.shopId = existingShopId || null; // Preserve if exists
    ctx.session.shopName = existingShopName || null;

    logger.info(`User authenticated: ${ctx.from.id} (@${ctx.from.username})`);

    return next();
  } catch (error) {
    logger.error('Auth middleware error:', error);

    // Create basic session even if auth failed (preserve existing data)
    ctx.session = ctx.session || {};
    const existingShopId = ctx.session.shopId;
    const existingShopName = ctx.session.shopName;
    const existingRole = ctx.session.role;

    ctx.session.user = {
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    };
    ctx.session.token = null; // No token, will retry on next request
    ctx.session.shopId = existingShopId || null; // Preserve if exists
    ctx.session.shopName = existingShopName || null;
    ctx.session.role = existingRole || null;

    logger.warn(`Auth failed for user ${ctx.from.id}, created basic session`);

    // Continue without auth (will fail on protected routes)
    return next();
  }
};

export default authMiddleware;
