/**
 * Telegram Alerting Service
 *
 * Sends critical alerts to admin Telegram chat.
 * Used for payment failures, high error rates, system issues.
 */

import logger from './logger.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_ID;

// Throttle alerts to prevent spam (max 1 per type per 5 minutes)
const alertThrottle = new Map();
const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Alert levels with emoji prefixes
 */
const ALERT_LEVELS = {
  critical: { emoji: '🚨', prefix: 'CRITICAL' },
  error: { emoji: '❌', prefix: 'ERROR' },
  warning: { emoji: '⚠️', prefix: 'WARNING' },
  info: { emoji: 'ℹ️', prefix: 'INFO' },
};

/**
 * Send alert to admin Telegram chat
 * @param {string} level - Alert level (critical, error, warning, info)
 * @param {string} title - Short alert title
 * @param {object} details - Additional details object
 * @param {string} throttleKey - Optional key for throttling (prevents spam)
 */
export async function sendAlert(level, title, details = {}, throttleKey = null) {
  // Skip if not configured
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      logger.error('[Alerts] CRITICAL: Telegram alerting not configured (ADMIN_TELEGRAM_ID missing) - alerts are silently dropped!', {
        level,
        title,
      });
    } else {
      logger.warn('[Alerts] Telegram alerting not configured (ADMIN_TELEGRAM_ID missing)');
    }
    return false;
  }

  // Throttle check
  if (throttleKey) {
    const lastSent = alertThrottle.get(throttleKey);
    if (lastSent && Date.now() - lastSent < THROTTLE_MS) {
      logger.debug(`[Alerts] Throttled alert: ${throttleKey}`);
      return false;
    }
    alertThrottle.set(throttleKey, Date.now());
  }

  const levelConfig = ALERT_LEVELS[level] || ALERT_LEVELS.info;

  // Format message
  let message = `${levelConfig.emoji} <b>[${levelConfig.prefix}] ${title}</b>\n\n`;

  if (Object.keys(details).length > 0) {
    message += Object.entries(details)
      .map(([key, value]) => `<b>${key}:</b> ${escapeHtml(String(value))}`)
      .join('\n');
  }

  message += `\n\n<i>${new Date().toISOString()}</i>`;

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      logger.error('[Alerts] Failed to send Telegram alert:', data.description);
      return false;
    }

    logger.info(`[Alerts] Sent ${level} alert: ${title}`);
    return true;
  } catch (error) {
    logger.error('[Alerts] Error sending Telegram alert:', error.message);
    return false;
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Convenience methods
export const alertCritical = (title, details, throttleKey) => sendAlert('critical', title, details, throttleKey);
export const alertError = (title, details, throttleKey) => sendAlert('error', title, details, throttleKey);
export const alertWarning = (title, details, throttleKey) => sendAlert('warning', title, details, throttleKey);
export const alertInfo = (title, details, throttleKey) => sendAlert('info', title, details, throttleKey);

/**
 * Pre-defined alert functions for common scenarios
 */

// Payment verification failed after blockchain confirmed
export function alertPaymentVerificationFailed(orderId, paymentId, reason) {
  return alertCritical('Payment Verification Failed', {
    'Order ID': orderId,
    'Payment ID': paymentId,
    'Reason': reason,
    'Action': 'Manual review required',
  }, `payment_fail_${orderId}`);
}

// CrystalPay webhook missed
export function alertWebhookMissed(invoiceId, crystalpayId) {
  return alertWarning('CrystalPay Webhook Missed', {
    'Invoice ID': invoiceId,
    'CrystalPay ID': crystalpayId,
    'Action': 'Fallback verification triggered',
  }, `webhook_missed_${invoiceId}`);
}

// Database pool exhaustion warning
export function alertDatabasePoolHigh(utilization, waiting) {
  return alertWarning('Database Pool High Utilization', {
    'Utilization': `${utilization}%`,
    'Waiting Requests': waiting,
    'Action': 'Consider scaling database connections',
  }, 'db_pool_high');
}

// Subscription activation failed after payment
export function alertSubscriptionActivationFailed(subscriptionId, invoiceId, error) {
  return alertCritical('Subscription Activation Failed', {
    'Subscription ID': subscriptionId,
    'Invoice ID': invoiceId,
    'Error': error,
    'Action': 'Manual activation required',
  }, `sub_fail_${subscriptionId}`);
}

// Stock deduction failed
export function alertStockDeductionFailed(orderId, productId, error) {
  return alertError('Stock Deduction Failed', {
    'Order ID': orderId,
    'Product ID': productId,
    'Error': error,
    'Action': 'Check inventory and retry',
  }, `stock_fail_${orderId}`);
}

// Late payment received (invoice expired but payment came)
export function alertLatePaymentReceived(orderId, paymentId, invoiceAgeSeconds) {
  return alertWarning('Late Payment Received', {
    'Order ID': orderId,
    'Payment ID': paymentId,
    'Invoice Age': `${Math.round(invoiceAgeSeconds / 60)} minutes`,
    'Action': 'Review and decide: confirm with current rate or refund',
  }, `late_payment_${orderId}`);
}

/**
 * Alert when payment confirmed on-chain but order not transitioned
 */
export function alertConfirmedButNotPaid(orderId, paymentId, orderStatus) {
  return alertError('Confirmed On-Chain But Order Not Paid', {
    'Order ID': orderId,
    'Payment ID': paymentId,
    'Order Status': orderStatus,
    'Action': 'Check order state and fix manually',
  }, `confirmed_not_paid_${orderId}`);
}

/**
 * Helper to mask wallet addresses for safe logging
 */
function maskAddress(address) {
  if (!address || address.length < 10) {return '***';}
  return address.substring(0, 6) + '...' + address.substring(address.length - 4);
}

/**
 * Alert when webhook processing fails
 */
export function alertWebhookProcessingFailed(webhookType, error, payload) {
  // Mask sensitive data
  const safePayload = { ...payload };
  if (safePayload.address) {
    safePayload.address = maskAddress(safePayload.address);
  }

  return alertError('Webhook Processing Failed', {
    'Webhook Type': webhookType,
    'Error': error,
    'Payload': JSON.stringify(safePayload).substring(0, 200),
  }, `webhook_fail_${webhookType}`);
}

/**
 * Alert when Telegram notification fails after payment
 */
export function alertNotificationFailed(orderId, failedTargets, errors) {
  return alertError('Payment Notification Failed', {
    'Order ID': orderId,
    'Failed Targets': failedTargets.join(', '),
    'Errors': errors.join('; ').substring(0, 200),
    'Action': 'Buyer/seller may not have received payment confirmation',
  }, `notify_fail_${orderId}`);
}

export default {
  sendAlert,
  alertCritical,
  alertError,
  alertWarning,
  alertInfo,
  alertPaymentVerificationFailed,
  alertWebhookMissed,
  alertDatabasePoolHigh,
  alertSubscriptionActivationFailed,
  alertStockDeductionFailed,
  alertLatePaymentReceived,
  alertConfirmedButNotPaid,
  alertWebhookProcessingFailed,
  alertNotificationFailed,
};
