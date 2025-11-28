/**
 * Payment Records - utilities for creating and updating payment records
 *
 * @module invoicePayment/utils/paymentRecords
 */

import { paymentQueries } from '../../../database/queries/index.js';
import { INVOICE_STATES } from '../../../constants/invoice.js';

/**
 * Creates a payment record and optionally updates its status with confirmations.
 *
 * @param {Object} client - PostgreSQL client (transaction)
 * @param {Object} options - Payment options
 * @param {Object} options.invoice - Invoice record
 * @param {string} options.invoice.currency - Payment currency
 * @param {Object} options.verification - Verification result
 * @param {string} options.verification.txHash - Transaction hash
 * @param {number} options.verification.amount - Payment amount
 * @param {string} options.verification.status - Payment status
 * @param {number} [options.verification.confirmations] - Number of blockchain confirmations
 * @param {number|null} [options.orderId=null] - Associated order ID
 * @param {number|null} [options.subscriptionId=null] - Associated subscription ID
 * @returns {Promise<Object>} Created payment record
 *
 * @example
 * const payment = await attachPaymentRecord(client, {
 *   invoice,
 *   verification: { txHash: '0x...', amount: 100, status: 'confirmed' },
 *   subscriptionId: 123
 * });
 */
export async function attachPaymentRecord(client, { invoice, verification, orderId = null, subscriptionId = null }) {
  const payment = await paymentQueries.create(
    {
      orderId,
      subscriptionId,
      txHash: verification.txHash,
      amount: verification.amount,
      currency: invoice.currency,
      status: verification.status,
    },
    client
  );

  if (verification.confirmations !== undefined) {
    await paymentQueries.updateStatus(payment.id, verification.status, verification.confirmations, client);
  }

  return payment;
}

/**
 * Marks an invoice as paid, updating status, tx_hash, and timestamps.
 *
 * @param {Object} client - PostgreSQL client (transaction)
 * @param {number} invoiceId - Invoice ID to mark as paid
 * @param {string|null} txHash - Transaction hash (optional, uses existing if null)
 * @returns {Promise<void>}
 *
 * @example
 * await markInvoicePaid(client, invoice.id, verification.txHash);
 */
export async function markInvoicePaid(client, invoiceId, txHash) {
  await client.query(
    `UPDATE invoices
       SET status = $1,
           tx_hash = COALESCE($3, tx_hash),
           paid_at = NOW(),
           updated_at = NOW()
     WHERE id = $2`,
    [INVOICE_STATES.PAID, invoiceId, txHash]
  );
}
