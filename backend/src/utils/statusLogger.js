/**
 * Status Transition Logger
 * Logs all payment and order status changes for audit trail
 */

import logger from './logger.js';

/**
 * Log payment status transition
 * @param {object} params - Transition parameters
 * @param {number} params.paymentId - Payment ID
 * @param {number} params.orderId - Order ID
 * @param {string} params.statusFrom - Previous status
 * @param {string} params.statusTo - New status
 * @param {string} params.reason - Reason for transition
 * @param {string|null} params.requestId - Correlation ID for tracing
 * @param {object} params.extra - Additional context
 */
export function logPaymentStatusChange({
  paymentId,
  orderId,
  statusFrom,
  statusTo,
  reason,
  requestId = null,
  extra = {},
}) {
  logger.info('[StatusTransition] Payment status changed', {
    type: 'payment_status_change',
    paymentId,
    orderId,
    statusFrom,
    statusTo,
    reason,
    requestId,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}

/**
 * Log order status transition
 * @param {object} params - Transition parameters
 * @param {number} params.orderId - Order ID
 * @param {string} params.statusFrom - Previous status
 * @param {string} params.statusTo - New status
 * @param {string} params.reason - Reason for transition
 * @param {string|null} params.requestId - Correlation ID for tracing
 * @param {object} params.extra - Additional context
 */
export function logOrderStatusChange({
  orderId,
  statusFrom,
  statusTo,
  reason,
  requestId = null,
  extra = {},
}) {
  logger.info('[StatusTransition] Order status changed', {
    type: 'order_status_change',
    orderId,
    statusFrom,
    statusTo,
    reason,
    requestId,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}

export default { logPaymentStatusChange, logOrderStatusChange };
