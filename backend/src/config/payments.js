/**
 * Payments Configuration
 *
 * Centralized config for payment-related settings.
 * All payment expiry, flags, and limits should be defined here.
 */

import logger from '../utils/logger.js';

// Parse environment with defaults
const parseIntEnv = (key, defaultVal) => {
  const val = process.env[key];
  if (!val) {return defaultVal;}
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
};

const parseBoolEnv = (key, defaultVal) => {
  const val = process.env[key];
  if (!val) {return defaultVal;}
  return val.toLowerCase() === 'true' || val === '1';
};

/**
 * Payment timing configuration
 */
export const INVOICE_EXPIRY_SECONDS = parseIntEnv('INVOICE_EXPIRY_SECONDS', 1800); // 30 minutes default
export const QUOTE_REFRESH_SECONDS = parseIntEnv('QUOTE_REFRESH_SECONDS', 300); // 5 minutes
export const LATE_PAYMENT_THRESHOLD_SECONDS = INVOICE_EXPIRY_SECONDS; // Same as expiry

// Pending order limits / abuse protection
export const MAX_PENDING_ORDERS_PER_USER = parseIntEnv('MAX_PENDING_ORDERS_PER_USER', 1);
export const CANCELLATION_COOLDOWN_THRESHOLD = parseIntEnv('CANCELLATION_COOLDOWN_THRESHOLD', 3);
export const CANCELLATION_COOLDOWN_MINUTES = parseIntEnv('CANCELLATION_COOLDOWN_MINUTES', 15);
export const CANCELLATION_WINDOW_SECONDS = parseIntEnv('CANCELLATION_WINDOW_SECONDS', 3600);

/**
 * Feature flags / kill switches
 *
 * PAYMENTS_ENABLED - Master switch for all payment processing
 * SUBSCRIPTIONS_ENABLED - Enable/disable subscription payments
 * ENFORCE_QUOTE_EXPIRY - If true, reject late payments; if false, mark for review
 * LATE_PAYMENTS_AUTO_REJECT - If true, auto-reject late payments instead of needs_review
 */
export const PAYMENTS_ENABLED = parseBoolEnv('PAYMENTS_ENABLED', true);
export const SUBSCRIPTIONS_ENABLED = parseBoolEnv('SUBSCRIPTIONS_ENABLED', true);
export const ENFORCE_QUOTE_EXPIRY = parseBoolEnv('ENFORCE_QUOTE_EXPIRY', true);
export const LATE_PAYMENTS_AUTO_REJECT = parseBoolEnv('LATE_PAYMENTS_AUTO_REJECT', false);

/**
 * Payment statuses for reference
 */
export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  NEEDS_REVIEW: 'needs_review',
};

export const VERIFICATION_STATUSES = {
  PENDING: 'pending',
  VERIFYING: 'verifying',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  EXPIRED: 'expired',
  LATE_CONFIRMED: 'late_confirmed',
};

/**
 * Late payment reasons
 */
export const LATE_PAYMENT_REASONS = {
  QUOTE_EXPIRED: 'quote_expired',
  RATE_CHANGED: 'rate_may_have_changed',
  CONFIRMED_LATE: 'confirmed_after_expiry',
};

/**
 * Log configuration on startup
 */
export function logPaymentsConfig() {
  logger.info('=== Payments Configuration ===');
  logger.info(`  INVOICE_EXPIRY_SECONDS: ${INVOICE_EXPIRY_SECONDS} (${INVOICE_EXPIRY_SECONDS / 60} minutes)`);
  logger.info(`  QUOTE_REFRESH_SECONDS: ${QUOTE_REFRESH_SECONDS}`);
  logger.info(`  MAX_PENDING_ORDERS_PER_USER: ${MAX_PENDING_ORDERS_PER_USER}`);
  logger.info(`  CANCELLATION_COOLDOWN_THRESHOLD: ${CANCELLATION_COOLDOWN_THRESHOLD}`);
  logger.info(`  CANCELLATION_COOLDOWN_MINUTES: ${CANCELLATION_COOLDOWN_MINUTES}`);
  logger.info(`  CANCELLATION_WINDOW_SECONDS: ${CANCELLATION_WINDOW_SECONDS}`);
  logger.info(`  PAYMENTS_ENABLED: ${PAYMENTS_ENABLED}`);
  logger.info(`  SUBSCRIPTIONS_ENABLED: ${SUBSCRIPTIONS_ENABLED}`);
  logger.info(`  ENFORCE_QUOTE_EXPIRY: ${ENFORCE_QUOTE_EXPIRY}`);
  logger.info(`  LATE_PAYMENTS_AUTO_REJECT: ${LATE_PAYMENTS_AUTO_REJECT}`);
  logger.info('==============================');
}

export default {
  INVOICE_EXPIRY_SECONDS,
  QUOTE_REFRESH_SECONDS,
  LATE_PAYMENT_THRESHOLD_SECONDS,
  MAX_PENDING_ORDERS_PER_USER,
  CANCELLATION_COOLDOWN_THRESHOLD,
  CANCELLATION_COOLDOWN_MINUTES,
  CANCELLATION_WINDOW_SECONDS,
  PAYMENTS_ENABLED,
  SUBSCRIPTIONS_ENABLED,
  ENFORCE_QUOTE_EXPIRY,
  LATE_PAYMENTS_AUTO_REJECT,
  PAYMENT_STATUSES,
  VERIFICATION_STATUSES,
  LATE_PAYMENT_REASONS,
  logPaymentsConfig,
};
