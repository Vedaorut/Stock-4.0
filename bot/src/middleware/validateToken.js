import { authApi } from '../utils/api.js';
import logger from '../utils/logger.js';

/**
 * Middleware to validate JWT token before making API calls
 *
 * Features:
 * - Checks if token exists in session
 * - Validates token expiry (JWT expiry is 7 days)
 * - Auto-regenerates token if expired
 * - Blocks request if token invalid
 *
 * Usage:
 *   bot.action('some_action', validateToken, async (ctx) => { ... })
 *   scene.action('some_action', validateToken, async (ctx) => { ... })
 */

const TOKEN_EXPIRY_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Check if token is expired based on session timestamp
 */
const isTokenExpired = (ctx) => {
  if (!ctx.session.tokenCreatedAt) {
    return true; // Unknown creation time = assume expired
  }

  const createdAt = new Date(ctx.session.tokenCreatedAt);
  const now = new Date();
  const ageInMs = now - createdAt;
  const ageInDays = ageInMs / MS_PER_DAY;

  return ageInDays >= TOKEN_EXPIRY_DAYS;
};

/**
 * Regenerate token using current user data
 */
const regenerateToken = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const userData = {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name || '',
    };

    logger.info('Regenerating expired token', {
      userId: telegramId,
      oldTokenAge: ctx.session.tokenCreatedAt
        ? Math.floor((Date.now() - new Date(ctx.session.tokenCreatedAt)) / MS_PER_DAY)
        : 'unknown',
    });

    const authData = await authApi.authenticate(telegramId, userData);

    // Update session with new token
    ctx.session.token = authData.token;
    ctx.session.userId = authData.user.id;
    ctx.session.tokenCreatedAt = new Date().toISOString();
    // P1-8 FIX: Update user object in session after regeneration
    ctx.session.user = authData.user;

    logger.info('Token regenerated successfully', { userId: telegramId });

    return true;
  } catch (error) {
    logger.error('Failed to regenerate token', {
      userId: ctx.from.id,
      error: error.message,
    });
    return false;
  }
};

/**
 * Validate token middleware
 */
export const validateToken = async (ctx, next) => {
  // Skip validation for certain actions that don't need backend API
  const skipActions = ['cancel_scene', 'seller:menu', 'buyer:menu'];
  const action = ctx.callbackQuery?.data;

  if (action && skipActions.includes(action)) {
    return next();
  }

  // Check if token exists
  if (!ctx.session.token) {
    logger.warn('No token in session', { userId: ctx.from.id });

    // Try to authenticate
    const regenerated = await regenerateToken(ctx);
    if (!regenerated) {
      await ctx.answerCbQuery?.(ctx.t('errors.authRequired'));
      await ctx.reply(ctx.t('errors.sessionExpired'));
      return; // Block further execution
    }
  }

  // Check if token is expired
  if (isTokenExpired(ctx)) {
    logger.info('Token expired, regenerating', { userId: ctx.from.id });

    const regenerated = await regenerateToken(ctx);
    if (!regenerated) {
      await ctx.answerCbQuery?.(ctx.t('errors.authRequired'));
      await ctx.reply(ctx.t('errors.sessionExpired'));
      return; // Block further execution
    }
  }

  // Token is valid, proceed
  return next();
};

export default validateToken;
