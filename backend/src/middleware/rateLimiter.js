import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import { RATE_LIMITS, ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Create rate limiter middleware
 */
const createRateLimiter = (windowMs, maxRequests, message) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      success: false,
      error: message || ERROR_MESSAGES.RATE_LIMIT_EXCEEDED
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userId: req.user?.id
      });

      res.status(429).json({
        success: false,
        error: message || ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
        retryAfter: req.rateLimit.resetTime
      });
    }
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
 * Rate limiter for webhook endpoints
 */
export const webhookLimiter = createRateLimiter(
  RATE_LIMITS.WEBHOOK.WINDOW_MS,
  RATE_LIMITS.WEBHOOK.MAX_REQUESTS,
  'Too many webhook requests'
);

/**
 * Custom rate limiter factory
 */
export const customLimiter = (options = {}) => {
  const {
    windowMs = RATE_LIMITS.API.WINDOW_MS,
    max = RATE_LIMITS.API.MAX_REQUESTS,
    message = ERROR_MESSAGES.RATE_LIMIT_EXCEEDED
  } = options;

  return createRateLimiter(windowMs, max, message);
};

export default {
  authLimiter,
  apiLimiter,
  paymentLimiter,
  webhookLimiter,
  customLimiter
};
