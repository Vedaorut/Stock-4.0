import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';
import { RATE_LIMITS, ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Create Redis store for rate limiting
 * Uses atomic INCR with EXPIRE for accurate counting across restarts
 * @param {string} prefix - Key prefix for this limiter
 * @returns {RedisStore|undefined} Redis store or undefined for in-memory fallback
 */
const createRedisStore = (prefix) => {
  // Skip Redis in test mode
  if (process.env.NODE_ENV === 'test') {
    return undefined;
  }

  try {
    const client = getRedisClient();

    return new RedisStore({
      // Use ioredis client's sendCommand method
      sendCommand: (...args) => client.call(...args),
      // Prefix for rate limit keys
      prefix: `rl:${prefix}:`,
    });
  } catch (err) {
    logger.error('[RateLimiter] Failed to create Redis store, falling back to in-memory:', {
      error: err.message,
    });
    return undefined;
  }
};

/**
 * Create rate limiter middleware with Redis persistence
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} maxRequests - Maximum requests per window
 * @param {string} message - Error message when limit exceeded
 * @param {Object} options - Additional options
 * @param {string} options.prefix - Redis key prefix (default: 'api')
 * @param {Function} options.keyGenerator - Custom key generator function
 * @returns {Function} Express middleware
 */
const createRateLimiter = (windowMs, maxRequests, message, options = {}) => {
  const { prefix = 'api', keyGenerator } = options;

  // BUG-AUTH-003: Rate limiter intentionally disabled in test mode
  // This is EXPECTED BEHAVIOR to allow integration tests to run without hitting rate limits
  // SECURITY: Production environments always enforce rate limiting
  if (
    (process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') ||
    process.env.NODE_ENV === 'test'
  ) {
    return (_req, _res, next) => next();
  }

  const store = createRedisStore(prefix);

  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      success: false,
      error: message || ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    store, // Redis store for persistence (undefined = in-memory fallback)
    keyGenerator: keyGenerator || ((req) => req.ip), // Default key by IP
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        prefix,
      });

      res.status(429).json({
        success: false,
        error: message || ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
        retryAfter: req.rateLimit?.resetTime,
      });
    },
  });
};

/**
 * Rate limiter for authentication endpoints
 */
export const authLimiter = createRateLimiter(
  RATE_LIMITS.AUTH.WINDOW_MS,
  RATE_LIMITS.AUTH.MAX_REQUESTS,
  'Too many authentication attempts, please try again later',
  { prefix: 'auth' }
);

/**
 * Rate limiter for general API endpoints
 */
export const apiLimiter = createRateLimiter(
  RATE_LIMITS.API.WINDOW_MS,
  RATE_LIMITS.API.MAX_REQUESTS,
  'Too many requests, please try again later',
  { prefix: 'api' }
);

/**
 * Rate limiter for payment endpoints (stricter to prevent spam)
 */
export const paymentLimiter = createRateLimiter(
  RATE_LIMITS.PAYMENT.WINDOW_MS,
  RATE_LIMITS.PAYMENT.MAX_REQUESTS,
  'Too many payment requests, please slow down',
  { prefix: 'payment' }
);

/**
 * Strict rate limiter for payment verification (P1-SEC-004)
 * Prevents abuse of payment verification endpoint
 */
export const strictPaymentLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  3, // Max 3 payment verification requests per minute
  'Too many payment verification attempts. Please wait before trying again.',
  { prefix: 'payment-verify' }
);

/**
 * Rate limiter for webhook endpoints
 */
export const webhookLimiter = createRateLimiter(
  RATE_LIMITS.WEBHOOK.WINDOW_MS,
  RATE_LIMITS.WEBHOOK.MAX_REQUESTS,
  'Too many webhook requests',
  { prefix: 'webhook' }
);

/**
 * Rate limiter for shop creation (prevent DoS via mass shop creation)
 */
export const shopCreationLimiter = createRateLimiter(
  RATE_LIMITS.SHOP_CREATION.WINDOW_MS,
  RATE_LIMITS.SHOP_CREATION.MAX_REQUESTS,
  'Too many shop creation requests. Please try again in an hour.',
  {
    prefix: 'shop-create',
    keyGenerator: (req) => {
      if (!req.user?.id) {
        logger.warn('[RateLimiter] shop-create: Missing user ID, falling back to IP', {
          ip: req.ip,
          path: req.path,
          method: req.method,
        });
        return req.ip;
      }
      return req.user.id.toString();
    }
  }
);

/**
 * Rate limiter for product creation (prevent DoS via mass product creation)
 */
export const productCreationLimiter = createRateLimiter(
  RATE_LIMITS.PRODUCT_CREATION.WINDOW_MS,
  RATE_LIMITS.PRODUCT_CREATION.MAX_REQUESTS,
  'Too many product creation requests. Please try again in an hour.',
  { prefix: 'product-create' }
);

/**
 * Rate limiter for subscription creation (prevent DoS via subscription spam)
 */
export const subscriptionCreationLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  5, // Max 5 subscription creation requests per hour
  'Too many subscription requests. Please try again in an hour.',
  { prefix: 'subscription-create' }
);

/**
 * Rate limiter for AI endpoints (expensive operations)
 */
export const aiRequestLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10, // Max 10 AI requests per hour
  'Too many AI requests. Please try again in an hour.',
  { prefix: 'ai' }
);

/**
 * Rate limiter for order payment endpoints
 * 10 requests per minute per user
 * Protects: GET /:id/payment-info, POST /:id/submit-payment, GET /:id/payment-status
 */
export const orderPaymentLimiter = (() => {
  if (
    (process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') ||
    process.env.NODE_ENV === 'test'
  ) {
    return (_req, _res, next) => next();
  }

  const store = createRedisStore('order-payment');

  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute per user
    message: {
      success: false,
      error: 'Too many payment requests. Please try again in a minute.',
    },
    keyGenerator: (req) => req.user?.id || req.ip,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    handler: (req, res) => {
      logger.warn('Order payment rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
      });

      res.status(429).json({
        success: false,
        error: 'Too many payment requests. Please try again in a minute.',
        retryAfter: req.rateLimit?.resetTime,
      });
    },
  });
})();

/**
 * Rate limiter for worker management endpoints
 * 20 requests per 5 minutes per user
 */
export const workerLimiter = (() => {
  if (
    (process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') ||
    process.env.NODE_ENV === 'test'
  ) {
    return (_req, _res, next) => next();
  }

  const store = createRedisStore('worker');

  return rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20,
    message: {
      success: false,
      error: 'Too many worker management requests. Please try again later.',
    },
    keyGenerator: (req) => req.user?.id || req.ip,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    handler: (req, res) => {
      logger.warn('Worker rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
      });

      res.status(429).json({
        success: false,
        error: 'Too many worker management requests. Please try again later.',
        retryAfter: req.rateLimit?.resetTime,
      });
    },
  });
})();

/**
 * Custom rate limiter factory
 * @param {Object} options - Rate limiter options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {string} options.message - Error message
 * @param {string} options.prefix - Redis key prefix
 * @param {Function} options.keyGenerator - Custom key generator
 * @returns {Function} Express middleware
 */
export const customLimiter = (options = {}) => {
  const {
    windowMs = RATE_LIMITS.API.WINDOW_MS,
    max = RATE_LIMITS.API.MAX_REQUESTS,
    message = ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
    prefix = 'custom',
    keyGenerator,
  } = options;

  return createRateLimiter(windowMs, max, message, { prefix, keyGenerator });
};

export default {
  authLimiter,
  apiLimiter,
  paymentLimiter,
  strictPaymentLimiter,
  webhookLimiter,
  shopCreationLimiter,
  productCreationLimiter,
  subscriptionCreationLimiter,
  aiRequestLimiter,
  orderPaymentLimiter,
  workerLimiter,
  customLimiter,
};
