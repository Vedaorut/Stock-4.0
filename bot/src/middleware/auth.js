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
    if (ctx.session?.token && ctx.session?.user) {
      return next();
    }

    // Extract user data from Telegram
    const userData = {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      languageCode: ctx.from.language_code
    };

    // Authenticate with backend
    const authData = await authApi.authenticate(ctx.from.id, userData);

    // Store in session
    ctx.session = ctx.session || {};
    ctx.session.token = authData.data.token;
    ctx.session.user = authData.data.user;
    ctx.session.role = null;
    ctx.session.shopId = null; // Will be set after shop is created

    logger.info(`User authenticated: ${ctx.from.id} (@${ctx.from.username})`);

    return next();
  } catch (error) {
    logger.error('Auth middleware error:', error);

    // Create basic session even if auth failed
    ctx.session = ctx.session || {};
    ctx.session.user = {
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name
    };
    ctx.session.token = null; // No token, will retry on next request

    logger.warn(`Auth failed for user ${ctx.from.id}, created basic session`);

    // Continue without auth (will fail on protected routes)
    return next();
  }
};

export default authMiddleware;
