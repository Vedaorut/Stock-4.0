import crypto from 'crypto';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Verify Telegram WebApp initData signature
 *
 * Algorithm (from https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * 1. Parse initData query string
 * 2. Extract hash parameter
 * 3. Create data-check-string from remaining params (sorted alphabetically)
 * 4. Compute HMAC-SHA256 using secret_key = HMAC-SHA256("WebAppData", bot_token)
 * 5. Calculate hash = HMAC-SHA256(data_check_string, secret_key)
 * 6. Compare computed hash with provided hash
 */
export const verifyTelegramInitData = (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'];

    if (!initData) {
      logger.warn('Missing Telegram initData', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No Telegram data',
      });
    }

    // Parse initData
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      logger.warn('Missing hash in initData', {
        ip: req.ip,
        path: req.path,
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid Telegram data',
      });
    }

    // Remove hash from params for validation
    params.delete('hash');

    // Sort params alphabetically and create data-check-string
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Create secret key: HMAC-SHA256("WebAppData", bot_token)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.telegram.botToken)
      .digest();

    // Calculate hash: HMAC-SHA256(data_check_string, secret_key)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // DEBUG: Log validation details
    logger.info('Telegram validation debug', {
      botTokenPrefix: config.telegram.botToken?.substring(0, 10) + '...',
      dataCheckStringLength: dataCheckString.length,
      dataCheckStringPreview: dataCheckString.substring(0, 100),
      calculatedHash: calculatedHash.substring(0, 16) + '...',
      providedHash: hash.substring(0, 16) + '...',
    });

    // Compare hashes using constant-time comparison to prevent timing attacks
    // CRITICAL: Must use crypto.timingSafeEqual() instead of === operator
    const hashBuffer = Buffer.from(hash, 'hex');
    const calculatedHashBuffer = Buffer.from(calculatedHash, 'hex');

    if (
      hashBuffer.length !== calculatedHashBuffer.length ||
      !crypto.timingSafeEqual(hashBuffer, calculatedHashBuffer)
    ) {
      logger.warn('Invalid Telegram initData signature', {
        ip: req.ip,
        path: req.path,
        expectedHash: calculatedHash.substring(0, 16) + '...',
        providedHash: hash.substring(0, 16) + '...',
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid Telegram signature',
      });
    }

    // Check auth_date to prevent replay attacks (recommended)
    const authDate = parseInt(params.get('auth_date'));
    const currentTime = Math.floor(Date.now() / 1000);
    const maxAge = 15 * 60; // 15 minutes (security: shorter window reduces replay attack risk)
    const maxClockSkew = 60; // 60 seconds tolerance for clock skew

    // B2 FIX: Protect against future timestamps (clock skew attack)
    if (authDate > currentTime + maxClockSkew) {
      logger.warn('Telegram initData from future detected (possible clock skew attack)', {
        ip: req.ip,
        path: req.path,
        authDate,
        currentTime,
        skew: authDate - currentTime,
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid Telegram timestamp',
      });
    }

    if (currentTime - authDate > maxAge) {
      logger.warn('Expired Telegram initData', {
        ip: req.ip,
        path: req.path,
        authDate,
        currentTime,
        age: currentTime - authDate,
        maxAge,
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Telegram data expired',
      });
    }

    // Extract user info from initData
    const userParam = params.get('user');
    if (userParam) {
      try {
        req.telegramUser = JSON.parse(userParam);
        logger.debug('Telegram user validated', {
          userId: req.telegramUser.id,
          username: req.telegramUser.username,
        });
      } catch (parseError) {
        logger.error('Failed to parse user data from initData', {
          error: parseError.message,
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Telegram initData validation error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Optional Telegram validation
 *
 * Skip validation if:
 * 1. JWT token already verified (req.user exists from verifyToken middleware)
 * 2. In development/test mode without initData header
 *
 * This allows bot-to-backend communication using JWT tokens
 * while still validating WebApp requests with initData
 *
 * Usage: Apply to routes that are accessed from both WebApp and Bot
 */
export const optionalTelegramAuth = (req, res, next) => {
  // If JWT token already verified (req.user set by verifyToken), skip initData validation
  // This allows bot requests with valid JWT to work in all environments
  if (req.user && req.user.id) {
    logger.debug('Skipping Telegram validation - JWT already verified', {
      path: req.path,
      method: req.method,
      userId: req.user.id,
    });
    return next();
  }

  // In development/test, skip validation if no initData header
  const env = process.env.NODE_ENV || 'development';
  if ((env === 'development' || env === 'test') && !req.headers['x-telegram-init-data']) {
    logger.debug('Skipping Telegram validation in development/test', {
      path: req.path,
      method: req.method,
      env,
    });
    return next();
  }

  // In production or if initData is present, always validate
  return verifyTelegramInitData(req, res, next);
};

export default {
  verifyTelegramInitData,
  optionalTelegramAuth,
};
