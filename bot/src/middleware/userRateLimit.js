import logger from '../utils/logger.js';
import { t, getLang } from '../i18n/index.js';

/**
 * P1-BOT-014: User Rate Limiting Middleware
 *
 * Prevents spam by limiting users to 10 commands/minute
 *
 * Features:
 * - In-memory rate limiting (per user)
 * - Sliding window (60 seconds)
 * - Configurable threshold
 * - Warning messages to users
 *
 * Usage:
 *   bot.use(userRateLimitMiddleware)
 */

const RATE_LIMIT_WINDOW = 60 * 1000; // 60 seconds
const MAX_COMMANDS_PER_WINDOW = 10;
const MAX_USERS_IN_CACHE = 10000; // Prevent memory exhaustion under DDoS

// In-memory storage: { userId: [timestamp1, timestamp2, ...] }
const userCommandHistory = new Map();

// Cleanup old entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [userId, timestamps] of userCommandHistory.entries()) {
      // Remove timestamps older than window
      const validTimestamps = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW);
      if (validTimestamps.length === 0) {
        userCommandHistory.delete(userId);
      } else {
        userCommandHistory.set(userId, validTimestamps);
      }
    }
  },
  5 * 60 * 1000
);

export const userRateLimitMiddleware = async (ctx, next) => {
  const userId = ctx.from?.id;

  if (!userId) {
    return next(); // Skip if no user ID
  }

  // Skip rate limiting for certain update types
  const skipTypes = ['callback_query']; // Don't rate limit button clicks
  if (skipTypes.includes(ctx.updateType)) {
    return next();
  }

  const now = Date.now();

  // Get user's command history
  let timestamps = userCommandHistory.get(userId) || [];

  // Remove timestamps outside the window
  timestamps = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW);

  // Check if user exceeded limit
  if (timestamps.length >= MAX_COMMANDS_PER_WINDOW) {
    const oldestTimestamp = Math.min(...timestamps);
    const resetIn = Math.ceil((oldestTimestamp + RATE_LIMIT_WINDOW - now) / 1000);

    logger.warn('User rate limit exceeded', {
      userId,
      username: ctx.from.username,
      commandCount: timestamps.length,
      resetIn,
    });

    const lang = getLang(ctx);
    await ctx
      .reply(
        t('rateLimit.exceeded', { max: MAX_COMMANDS_PER_WINDOW, resetIn }, lang),
        { reply_to_message_id: ctx.message?.message_id }
      )
      .catch(() => {});

    return; // Block further execution
  }

  // Add current timestamp
  timestamps.push(now);

  // Evict oldest entries if cache is full (prevent memory exhaustion)
  if (userCommandHistory.size >= MAX_USERS_IN_CACHE && !userCommandHistory.has(userId)) {
    // Delete first 10% of entries (oldest due to Map insertion order)
    const toDelete = Math.ceil(MAX_USERS_IN_CACHE * 0.1);
    let deleted = 0;
    for (const key of userCommandHistory.keys()) {
      if (deleted >= toDelete) break;
      userCommandHistory.delete(key);
      deleted++;
    }
    logger.warn('Rate limiter cache eviction triggered', {
      evicted: deleted,
      cacheSize: userCommandHistory.size,
    });
  }

  userCommandHistory.set(userId, timestamps);

  // Continue to next middleware
  return next();
};

export default userRateLimitMiddleware;
