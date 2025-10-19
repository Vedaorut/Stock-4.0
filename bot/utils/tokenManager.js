/**
 * JWT Token Manager
 *
 * Manages user tokens in bot sessions
 * Tokens are stored in-memory in bot sessions (not persistent)
 */

/**
 * Store token in session
 * @param {object} ctx - Telegraf context
 * @param {string} token - JWT token
 */
export function setToken(ctx, token) {
  if (!ctx.session) {
    ctx.session = {};
  }
  ctx.session.token = token;
}

/**
 * Get token from session
 * @param {object} ctx - Telegraf context
 * @returns {string|null} JWT token or null
 */
export function getToken(ctx) {
  return ctx.session?.token || null;
}

/**
 * Remove token from session
 * @param {object} ctx - Telegraf context
 */
export function clearToken(ctx) {
  if (ctx.session) {
    delete ctx.session.token;
  }
}

/**
 * Check if user is authenticated
 * @param {object} ctx - Telegraf context
 * @returns {boolean} True if token exists
 */
export function isAuthenticated(ctx) {
  return !!getToken(ctx);
}

/**
 * Middleware to require authentication
 * @param {object} ctx - Telegraf context
 * @param {function} next - Next middleware
 */
export async function requireAuth(ctx, next) {
  if (!isAuthenticated(ctx)) {
    await ctx.reply('Вы не авторизованы. Используйте /start для входа.');
    return;
  }
  return next();
}
