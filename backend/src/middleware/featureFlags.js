/**
 * Feature Flags Middleware
 *
 * Checks if features are enabled before allowing requests to proceed.
 * Returns 503 Service Unavailable with retry-after header when disabled.
 */

import {
  PAYMENTS_ENABLED,
  SUBSCRIPTIONS_ENABLED,
} from '../config/payments.js';
import logger from '../utils/logger.js';

const RETRY_AFTER_SECONDS = 300; // 5 minutes

/**
 * Check if payments are enabled
 * Use on payment-related routes
 */
export const requirePaymentsEnabled = (req, res, next) => {
  if (!PAYMENTS_ENABLED) {
    logger.warn('[FeatureFlags] Payments disabled, rejecting request', {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
    });

    res.set('Retry-After', RETRY_AFTER_SECONDS);
    return res.status(503).json({
      success: false,
      error: 'Payment processing is temporarily unavailable',
      code: 'PAYMENTS_DISABLED',
      retryAfter: RETRY_AFTER_SECONDS,
    });
  }
  next();
};

/**
 * Check if subscriptions are enabled
 * Use on subscription-related routes
 */
export const requireSubscriptionsEnabled = (req, res, next) => {
  if (!SUBSCRIPTIONS_ENABLED) {
    logger.warn('[FeatureFlags] Subscriptions disabled, rejecting request', {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
    });

    res.set('Retry-After', RETRY_AFTER_SECONDS);
    return res.status(503).json({
      success: false,
      error: 'Subscription processing is temporarily unavailable',
      code: 'SUBSCRIPTIONS_DISABLED',
      retryAfter: RETRY_AFTER_SECONDS,
    });
  }
  next();
};

/**
 * Endpoint to check feature flags status (for WebApp/Bot polling)
 */
export const getFeatureStatus = (req, res) => {
  res.json({
    success: true,
    data: {
      paymentsEnabled: PAYMENTS_ENABLED,
      subscriptionsEnabled: SUBSCRIPTIONS_ENABLED,
      timestamp: new Date().toISOString(),
    },
  });
};

export default {
  requirePaymentsEnabled,
  requireSubscriptionsEnabled,
  getFeatureStatus,
};
