import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import { RATE_LIMITS, ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Create rate limiter middleware
 */
const createRateLimiter = (windowMs, maxRequests, message) => {
  // FIX: Require explicit flag to disable rate limiting, and never in production
  if (process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      success: false,
      error: message || ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
      });

      res.status(429).json({
        success: false,
        error: message || ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
        retryAfter: req.rateLimit.resetTime,
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
  'Too many authentication attempts, please try again later'
);

/**
 * Rate limiter for general API endpoints
 */
export const apiLimiter = createRateLimiter(
  RATE_LIMITS.API.WINDOW_MS,
  RATE_LIMITS.API.MAX_REQUESTS,
  'Too many requests, please try again later'
);

/**
 * Rate limiter for payment endpoints (stricter to prevent spam)
 */
export const paymentLimiter = createRateLimiter(
  RATE_LIMITS.PAYMENT.WINDOW_MS,
  RATE_LIMITS.PAYMENT.MAX_REQUESTS,
  'Too many payment requests, please slow down'
);

/**
 * Strict rate limiter for payment verification (P1-SEC-004)
 * Prevents abuse of payment verification endpoint
 */
export const strictPaymentLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  3, // Max 3 payment verification requests per minute
  'Too many payment verification attempts. Please wait before trying again.'
);

/**
 * Rate limiter for webhook endpoints
 */
export const webhookLimiter = createRateLimiter(
  RATE_LIMITS.WEBHOOK.WINDOW_MS,
  RATE_LIMITS.WEBHOOK.MAX_REQUESTS,
  'Too many webhook requests'
);

/**
 * Rate limiter for shop creation (prevent DoS via mass shop creation)
 */
export const shopCreationLimiter = createRateLimiter(
  RATE_LIMITS.SHOP_CREATION.WINDOW_MS,
  RATE_LIMITS.SHOP_CREATION.MAX_REQUESTS,
  'Too many shop creation requests. Please try again in an hour.'
);

/**
 * Rate limiter for product creation (prevent DoS via mass product creation)
 */
export const productCreationLimiter = createRateLimiter(
  RATE_LIMITS.PRODUCT_CREATION.WINDOW_MS,
  RATE_LIMITS.PRODUCT_CREATION.MAX_REQUESTS,
  'Too many product creation requests. Please try again in an hour.'
);

/**
 * Rate limiter for subscription creation (prevent DoS via subscription spam)
 */
export const subscriptionCreationLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  5, // Max 5 subscription creation requests per hour
  'Too many subscription requests. Please try again in an hour.'
);

/**
 * Rate limiter for AI endpoints (expensive operations)
 */
export const aiRequestLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10, // Max 10 AI requests per hour
  'Too many AI requests. Please try again in an hour.'
);

/**
 * Rate limiter for order payment endpoints
 * 10 requests per minute per user
 * Protects: GET /:id/payment-info, POST /:id/submit-payment, GET /:id/payment-status
 */
export const orderPaymentLimiter = (() => {
  if (process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') {
    return (_req, _res, next) => next();
  }

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
        retryAfter: req.rateLimit.resetTime,
      });
    },
  });
})();

/**
 * Rate limiter for worker management endpoints
 * 20 requests per 5 minutes per user
 */
export const workerLimiter = (() => {
  if (process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') {
    return (_req, _res, next) => next();
  }

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
        retryAfter: req.rateLimit.resetTime,
      });
    },
  });
})();

/**
 * Custom rate limiter factory
 */
export const customLimiter = (options = {}) => {
  const {
    windowMs = RATE_LIMITS.API.WINDOW_MS,
    max = RATE_LIMITS.API.MAX_REQUESTS,
    message = ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
  } = options;

  return createRateLimiter(windowMs, max, message);
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
