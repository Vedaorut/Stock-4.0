/**
 * Redis Session Middleware for Telegraf v4
 *
 * Provides persistent session storage using Redis
 * Sessions are stored with 24h TTL
 *
 * Security: Sensitive fields (token, user) are encrypted with AES-256-GCM
 * if SESSION_ENCRYPTION_KEY is configured. Old plaintext sessions
 * are automatically migrated to encrypted format on next access.
 */

import logger from '../utils/logger.js';
import { encryptSensitiveFields, decryptSensitiveFields } from '../utils/sessionCrypto.js';

/**
 * Create Redis session middleware
 * @param {Redis} redis - ioredis instance
 * @returns {Function} Telegraf middleware
 */
export function createRedisSession(redis) {
  return async (ctx, next) => {
    // Generate session key based on chat ID
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) {
      logger.warn('No chat/user ID found, skipping session');
      return next();
    }

    const sessionKey = `session:${chatId}`;

    // Load session from Redis
    try {
      const data = await redis.get(sessionKey);
      if (data) {
        const parsed = JSON.parse(data);
        // Decrypt sensitive fields (handles both encrypted and plaintext)
        ctx.session = decryptSensitiveFields(parsed);
      } else {
        ctx.session = {};
      }
    } catch (error) {
      logger.error(`Failed to load session for ${chatId}:`, error);
      ctx.session = {};
    }

    // Add explicit save method for handlers that need it
    ctx.session.save = async () => {
      try {
        // Encrypt sensitive fields before saving
        const encryptedSession = encryptSensitiveFields(ctx.session);
        const sessionData = JSON.stringify(encryptedSession);
        await redis.setex(sessionKey, 86400, sessionData);
        logger.debug(`Session manually saved for ${chatId}`, {
          hasShopId: !!ctx.session?.shopId,
          shopId: ctx.session?.shopId,
        });
      } catch (error) {
        logger.error(`Failed to manually save session for ${chatId}:`, error);
      }
    };

    // Store original session for comparison
    const originalSession = JSON.stringify(ctx.session);

    // Execute handler
    await next();

    // Save session back to Redis if changed
    try {
      const newSession = JSON.stringify(ctx.session);

      if (newSession !== originalSession) {
        // Encrypt sensitive fields before saving
        const encryptedSession = encryptSensitiveFields(ctx.session);
        const sessionData = JSON.stringify(encryptedSession);

        // Save with 24h TTL (86400 seconds)
        await redis.setex(sessionKey, 86400, sessionData);

        logger.debug(`Session saved for ${chatId}`, {
          hasShopId: !!ctx.session?.shopId,
          hasToken: !!ctx.session?.token,
          role: ctx.session?.role,
        });
      }
    } catch (error) {
      logger.error(`Failed to save session for ${chatId}:`, error);
    }
  };
}
