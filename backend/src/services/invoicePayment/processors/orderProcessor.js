/**
 * Order Payment Processor
 *
 * Orchestrates the order payment flow:
 * 1. Validate and lock order
 * 2. Check idempotency (already confirmed)
 * 3. Fetch and lock invoice
 * 4. Validate invoice activity
 * 5. Guard against TX reuse
 * 6. Verify payment on blockchain
 * 7. Confirm order if verified
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
import * as blockchainVerificationService from '../../blockchainVerificationService.js';
import { broadcast } from '../../../utils/websocket.js';

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

    // 6. Get payment record for blockchain verification
    const paymentResult = await client.query(
      `SELECT id, tx_hash, currency, recipient_address, expected_crypto_amount, status
       FROM payments
       WHERE order_id = $1 AND status IN ('pending', 'processing')
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [orderId]
    );

    if (paymentResult.rows.length === 0) {
      await client.query('COMMIT');
      return {
        ok: false,
        state: 'failed',
        code: 'NO_PAYMENT_RECORD',
        message: 'No pending payment found. Please initiate payment first.',
      };
    }

    const payment = paymentResult.rows[0];

    // Use txHash from parameter or from payment record
    const verifyTxHash = txHash || payment.tx_hash;

    if (!verifyTxHash) {
      await client.query('COMMIT');
      return {
        ok: false,
        state: 'failed',
        code: 'NO_TX_HASH',
        message: 'Transaction hash required for verification.',
      };
    }

    // 7. Verify payment on blockchain
    logger.info(`[InvoicePayment] Order ${orderId} - Starting blockchain verification`, {
      txHash: verifyTxHash,
      currency: payment.currency,
      expectedAmount: payment.expected_crypto_amount,
    });

    const verificationResult = await blockchainVerificationService.verifyPayment(
      verifyTxHash,
      payment.currency,
      payment.recipient_address,
      parseFloat(payment.expected_crypto_amount)
    );

    // Update payment confirmations
    await client.query(
      `UPDATE payments
       SET blockchain_confirmations = $1, last_checked_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [verificationResult.confirmations || 0, payment.id]
    );

    // 8. Handle verification result
    if (!verificationResult.verified) {
      // Not verified yet - check if failed or just pending
      if (verificationResult.status === 'failed' && verificationResult.error) {
        await client.query(
          `UPDATE payments
           SET verification_status = 'failed', verification_error = $2, updated_at = NOW()
           WHERE id = $1`,
          [payment.id, verificationResult.error]
        );
        await client.query('COMMIT');

        return {
          ok: false,
          state: 'failed',
          code: 'VERIFICATION_FAILED',
          message: verificationResult.error,
          confirmations: verificationResult.confirmations,
        };
      }

      // Still pending (waiting for confirmations)
      await client.query('COMMIT');
      return {
        ok: false,
        state: 'pending',
        code: 'AWAITING_CONFIRMATIONS',
        message: `Payment found but waiting for confirmations (${verificationResult.confirmations || 0} of required)`,
        confirmations: verificationResult.confirmations,
      };
    }

    // 9. Payment verified - confirm order
    logger.info(`[InvoicePayment] Order ${orderId} - Blockchain verification successful`, {
      confirmations: verificationResult.confirmations,
      amount: verificationResult.amount,
    });

    // Deduct stock for all items
    const itemsResult = await client.query(
      `SELECT oi.product_id, oi.quantity, p.stock_quantity, p.is_preorder
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1
       FOR UPDATE OF p`,
      [orderId]
    );

    for (const item of itemsResult.rows) {
      if (!item.is_preorder) {
        if (item.stock_quantity < item.quantity) {
          logger.warn(`[InvoicePayment] Insufficient stock for product ${item.product_id}`);
        }

        await client.query(
          `UPDATE products
           SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW()
           WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }
    }

    // Update order status
    await client.query(
      `UPDATE orders
       SET status = 'confirmed',
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );

    // Update payment status
    await client.query(
      `UPDATE payments
       SET status = 'confirmed',
           verification_status = 'confirmed',
           tx_hash = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [payment.id, verifyTxHash]
    );

    // Mark invoice as paid
    await markInvoicePaid(client, invoice.id, verifyTxHash);

    await client.query('COMMIT');

    // Emit WebSocket event for real-time UI updates
    broadcast('order_status', {
      orderId: order.id,
      status: 'confirmed',
      shopId: order.shop_id,
    });

    // Notify about confirmed order (async, outside transaction)
    notifyOrderConfirmed(order.id).catch((err) => {
      logger.error('[InvoicePayment] Notification error:', err);
    });

    return {
      ok: true,
      state: 'confirmed',
      message: 'Payment verified and order confirmed',
      confirmations: verificationResult.confirmations,
      amount: verificationResult.amount,
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
