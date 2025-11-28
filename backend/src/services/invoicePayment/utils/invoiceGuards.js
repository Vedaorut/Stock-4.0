/**
 * Invoice Guards - validation and protection utilities
 *
 * @module invoicePayment/utils/invoiceGuards
 */

import { INVOICE_STATES } from '../../../constants/invoice.js';
import { ValidationError } from '../../../utils/errors.js';

/**
 * Ensures an invoice is active (not paid and not expired).
 * If expired, marks the invoice as EXPIRED in the database.
 *
 * @param {Object} invoice - The invoice record from database
 * @param {number} invoice.id - Invoice ID
 * @param {string} invoice.status - Current invoice status
 * @param {string|Date} invoice.expires_at - Invoice expiration timestamp
 * @param {Object} client - PostgreSQL client (transaction)
 * @returns {Promise<{active: boolean, reason?: string}>} Activity status
 *
 * @example
 * const activity = await ensureInvoiceActive(invoice, client);
 * if (!activity.active) {
 *   if (activity.reason === 'already_paid') { ... }
 *   if (activity.reason === 'expired') { ... }
 * }
 */
export async function ensureInvoiceActive(invoice, client) {
  const now = new Date();
  const expiresAt = new Date(invoice.expires_at);

  if (invoice.status === INVOICE_STATES.PAID) {
    return { active: false, reason: 'already_paid' };
  }

  if (expiresAt < now) {
    await client.query(
      `UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2`,
      [INVOICE_STATES.EXPIRED, invoice.id]
    );

    return { active: false, reason: 'expired' };
  }

  return { active: true };
}

/**
 * Guards against transaction hash reuse across different orders/subscriptions.
 * Allows reuse only if the tx_hash belongs to the same order or subscription.
 *
 * @param {Object} client - PostgreSQL client (transaction)
 * @param {string|null} txHash - Transaction hash to check
 * @param {Object} options - Context options
 * @param {number|null} [options.orderId=null] - Order ID if checking for order payment
 * @param {number|null} [options.subscriptionId=null] - Subscription ID if checking for subscription payment
 * @returns {Promise<Object|null>} Existing payment record if found, null otherwise
 * @throws {ValidationError} If tx_hash was already used for a different payment
 *
 * @example
 * const existingPayment = await guardTxReuse(client, txHash, { orderId: 123 });
 * if (existingPayment) {
 *   // Handle idempotent case
 * }
 */
export async function guardTxReuse(client, txHash, { orderId = null, subscriptionId = null }) {
  if (!txHash) {
    return null;
  }

  const existing = await client.query('SELECT * FROM payments WHERE tx_hash = $1 FOR UPDATE', [
    txHash,
  ]);

  if (existing.rows.length === 0) {
    return null;
  }

  const payment = existing.rows[0];

  const sameOrder = orderId && payment.order_id === orderId;
  const sameSubscription = subscriptionId && payment.subscription_id === subscriptionId;

  if (!sameOrder && !sameSubscription) {
    throw new ValidationError('This transaction was already used for another payment');
  }

  return payment;
}
