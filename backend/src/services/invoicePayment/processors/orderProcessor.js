/**
 * Order Payment Processor
 *
 * Orchestrates the order payment flow:
 * 1. Validate and lock order
 * 2. Check idempotency (already confirmed)
 * 3. Fetch and lock invoice
 * 4. Validate invoice activity
 * 5. Guard against TX reuse
 * 6. Return unsupported (CrystalPay removed for orders)
 *
 * CRITICAL: Money-handling code. Changes require thorough review.
 *
 * @module invoicePayment/processors/orderProcessor
 */

import { getClient } from '../../../config/database.js';
import { validateAndLockOrder } from '../validators/index.js';
import { ensureInvoiceActive, guardTxReuse } from '../utils/index.js';
import { markInvoicePaid } from '../utils/paymentRecords.js';
import { notifyOrderConfirmed } from '../notifications/index.js';
import { ORDER_STATES } from '../constants.js';
import { ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';

/**
 * Process crypto payment for an order using invoice as single source of truth.
 *
 * @param {Object} params - Payment parameters
 * @param {number} params.orderId - Order ID to process payment for
 * @param {string} [params.txHash] - Transaction hash (if available)
 * @param {string} [params.paymentLink] - Payment link (unused, kept for API compat)
 * @param {number} [params.actorUserId] - User performing the action
 * @param {boolean} [params.allowSeller=false] - Allow seller to confirm payment
 * @returns {Promise<Object>} Payment result with ok, state, and optional message
 */
export async function processOrderPayment({
  orderId,
  txHash,
  paymentLink: _paymentLink,
  actorUserId,
  allowSeller = false,
}) {
  const client = await getClient();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // 1. Validate and lock order
    const order = await validateAndLockOrder(client, orderId, actorUserId, { allowSeller });

    // 2. Idempotency check - already confirmed
    if (order.status === ORDER_STATES.CONFIRMED) {
      await client.query('COMMIT');
      return {
        ok: true,
        state: 'confirmed',
        idempotent: true,
        message: 'Order already confirmed',
      };
    }

    // 3. Fetch and lock invoice
    const invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [orderId]
    );

    if (invoiceResult.rows.length === 0) {
      throw new ValidationError('No invoice found for this order. Generate a new invoice.');
    }

    const invoice = invoiceResult.rows[0];

    // Lock using advisory lock for additional safety
    await client.query('SELECT pg_advisory_xact_lock($1)', [invoice.id]);

    // 4. Validate invoice is active
    const activity = await ensureInvoiceActive(invoice, client);

    if (!activity.active) {
      if (activity.reason === 'already_paid') {
        await client.query('COMMIT');
        return { ok: true, state: 'confirmed', idempotent: true, message: 'Invoice already paid' };
      }

      await client.query('COMMIT');
      return {
        ok: false,
        state: 'expired',
        code: 'INVOICE_EXPIRED',
        message: 'Payment window expired. Please create a new order.',
      };
    }

    // 5. Guard against TX reuse
    const guardedPayment = txHash ? await guardTxReuse(client, txHash, { orderId }) : null;

    if (guardedPayment && guardedPayment.status === 'confirmed') {
      await markInvoicePaid(client, invoice.id, guardedPayment.tx_hash);
      await client.query('COMMIT');
      await notifyOrderConfirmed(order.id);
      return { ok: true, state: 'confirmed', idempotent: true };
    }

    // 6. CrystalPay not supported for orders - return error
    logger.error(`[InvoicePayment] Order ${orderId} - CrystalPay invoice processing removed`);
    await client.query('COMMIT');

    return {
      ok: false,
      state: 'failed',
      code: 'UNSUPPORTED_PAYMENT_METHOD',
      message: 'CrystalPay payment gateway not supported for orders. Use direct blockchain payments.',
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('[InvoicePayment] Rollback error', { error: rollbackError.message });
    }

    logger.error('[InvoicePayment] Order payment processing failed', {
      orderId,
      error: error.message,
    });

    throw error;
  } finally {
    client.release();
  }
}
