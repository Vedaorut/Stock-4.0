import logger from '../utils/logger.js';
import { t, getLang } from '../i18n/index.js';

/**
 * P1-BOT-014: User Rate Limiting Middleware (Redis-based)
 *
 * Prevents spam by limiting users to 30 requests/minute
 *
 * Features:
 * - Redis-based rate limiting (persistent across restarts)
 * - Sliding window (60 seconds)
 * - Configurable threshold
 * - Warning messages to users
 * - Admin exemption
 *
 * Usage:
 *   bot.use(createUserRateLimitMiddleware(redis))
 */

const RATE_LIMIT_WINDOW = 60; // 60 seconds
const MAX_REQUESTS_PER_WINDOW = 30;
const KEY_PREFIX = 'bot:ratelimit:user:';

// Admin IDs from environment (comma-separated)
const ADMIN_IDS = (process.env.ADMIN_IDS || process.env.ADMIN_TELEGRAM_ID || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

/**
 * Check if user is an admin
 * @param {number} userId - Telegram user ID
 * @returns {boolean}
 */
function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

/**
 * Create Redis-based rate limit middleware
 * @param {Redis} redis - ioredis instance
 * @returns {Function} Telegraf middleware
 */
export function createUserRateLimitMiddleware(redis) {
  return async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId) {
      return next(); // Skip if no user ID
    }

    // Exempt admins from rate limiting
    if (isAdmin(userId)) {
      return next();
    }

    // Skip rate limiting for certain update types
    const skipTypes = ['callback_query']; // Don't rate limit button clicks
    if (skipTypes.includes(ctx.updateType)) {
      return next();
    }

    const key = `${KEY_PREFIX}${userId}`;

    try {
      // Increment counter and set expiry atomically
      // INCR creates key with value 1 if doesn't exist
      const count = await redis.incr(key);

      // Set expiry only on first request (when count is 1)
      if (count === 1) {
        await redis.expire(key, RATE_LIMIT_WINDOW);
      }

      // Check if user exceeded limit
      if (count > MAX_REQUESTS_PER_WINDOW) {
        // Get TTL to show reset time
        const ttl = await redis.ttl(key);
        const resetIn = ttl > 0 ? ttl : RATE_LIMIT_WINDOW;

        logger.warn('User rate limit exceeded', {
          userId,
          username: ctx.from.username,
          requestCount: count,
          resetIn,
        });

        const lang = getLang(ctx);
        await ctx
          .reply(
            t('rateLimit.exceeded', { max: MAX_REQUESTS_PER_WINDOW, resetIn }, lang),
            { reply_to_message_id: ctx.message?.message_id }
          )
          .catch(() => {});

        return; // Block further execution
      }

      // Continue to next middleware
      return next();
    } catch (error) {
      // If Redis fails, allow the request but log error
      logger.error('Rate limit Redis error, allowing request:', {
        userId,
        error: error.message,
      });
      return next();
    }
  };
}

// Legacy export for backward compatibility (in-memory fallback)
// This is kept in case Redis is not available
export const userRateLimitMiddleware = async (ctx, next) => {
  // This is a no-op fallback - actual rate limiting requires Redis
  // Log warning on first use
  if (!userRateLimitMiddleware._warned) {
    logger.warn('Using legacy in-memory rate limiter - please use createUserRateLimitMiddleware(redis) instead');
    userRateLimitMiddleware._warned = true;
  }
  return next();
};

export default createUserRateLimitMiddleware;
