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
        method: req.method
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No Telegram data'
      });
    }

    // Parse initData
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      logger.warn('Missing hash in initData', {
        ip: req.ip,
        path: req.path
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid Telegram data'
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

    // Compare hashes (constant-time comparison to prevent timing attacks)
    if (calculatedHash !== hash) {
      logger.warn('Invalid Telegram initData signature', {
        ip: req.ip,
        path: req.path,
        expectedHash: calculatedHash.substring(0, 8) + '...',
        providedHash: hash.substring(0, 8) + '...'
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid Telegram signature'
      });
    }

    // Check auth_date to prevent replay attacks (recommended)
    const authDate = parseInt(params.get('auth_date'));
    const currentTime = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours

    if (currentTime - authDate > maxAge) {
      logger.warn('Expired Telegram initData', {
        ip: req.ip,
        path: req.path,
        authDate,
        currentTime,
        age: currentTime - authDate
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Telegram data expired'
      });
    }

    // Extract user info from initData
    const userParam = params.get('user');
    if (userParam) {
      try {
        req.telegramUser = JSON.parse(userParam);
        logger.debug('Telegram user validated', {
          userId: req.telegramUser.id,
          username: req.telegramUser.username
        });
      } catch (parseError) {
        logger.error('Failed to parse user data from initData', {
          error: parseError.message
        });
      }
    }

    next();

  } catch (error) {
    logger.error('Telegram initData validation error', {
      error: error.message,
      stack: error.stack,
      path: req.path
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Optional Telegram validation for development
 *
 * In development: Skip validation if no initData header (allows testing without Telegram)
 * In production: Always require valid initData
 *
 * Usage: Apply to routes that are accessed from both WebApp and other clients
 */
export const optionalTelegramAuth = (req, res, next) => {
  // In development/test, skip validation if no initData header
  const env = process.env.NODE_ENV || 'development';
  if ((env === 'development' || env === 'test') && !req.headers['x-telegram-init-data']) {
    logger.debug('Skipping Telegram validation in development/test', {
      path: req.path,
      method: req.method,
      env
    });
    return next();
  }

  // In production or if initData is present, always validate
  return verifyTelegramInitData(req, res, next);
};

export default {
  verifyTelegramInitData,
  optionalTelegramAuth
};
