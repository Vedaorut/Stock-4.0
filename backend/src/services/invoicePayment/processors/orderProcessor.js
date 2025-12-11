/**
 * Order Payment Processor
 *
 * Two-phase payment processing (INV-P1-1 FIX):
 *
 * PHASE 1 (Outside transaction):
 * - Order/Invoice lookup via pool (fast, no locks)
 * - Preliminary status checks (optimistic exit)
 * - Blockchain verification (slow external API)
 *
 * PHASE 2 (Atomic transaction with locks):
 * - Lock order (FOR UPDATE)
 * - Lock invoice (FOR UPDATE + advisory lock)
 * - Re-validate status (TOCTOU protection)
 * - Guard TX reuse
 * - Deduct stock atomically
 * - Update statuses
 *
 * PHASE 3 (Outside transaction):
 * - WebSocket broadcast
 * - Notifications
 *
 * CRITICAL: Money-handling code. Changes require thorough review.
 *
 * @module invoicePayment/processors/orderProcessor
 */

import { getClient, query } from '../../../config/database.js';
import { validateAndLockOrder } from '../validators/index.js';
import { ensureInvoiceActive, guardTxReuse } from '../utils/index.js';
import { markInvoicePaid } from '../utils/paymentRecords.js';
import { notifyOrderConfirmed } from '../notifications/index.js';
import { ORDER_STATES } from '../constants.js';
import { ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import * as blockchainVerificationService from '../../blockchainVerificationService.js';
import { broadcast } from '../../../utils/websocket.js';
import { alertStockDeductionFailed } from '../../../utils/alerts.js';
import { productQueries } from '../../../database/queries/index.js';

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
  // =========================================================================
  // PHASE 1: PRE-CHECKS & VERIFICATION (Outside transaction, no locks)
  // INV-P1-1 FIX: Move blockchain verification outside transaction
  // =========================================================================

  // 1.1. Preliminary order lookup (no lock, using pool)
  const orderResult = await query(
    `SELECT o.*, s.owner_id as shop_owner_id
     FROM orders o
     LEFT JOIN shops s ON o.shop_id = s.id
     WHERE o.id = $1`,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    throw new ValidationError('Order not found');
  }

  const preliminaryOrder = orderResult.rows[0];

  // 1.2. Preliminary idempotency check (fast exit)
  if (preliminaryOrder.status === ORDER_STATES.CONFIRMED) {
    return {
      ok: true,
      state: 'confirmed',
      idempotent: true,
      message: 'Order already confirmed',
    };
  }

  // 1.3. Authorization check (before expensive operations)
  const isOwner = actorUserId && preliminaryOrder.user_id === actorUserId;
  const isSeller = allowSeller && actorUserId && preliminaryOrder.shop_owner_id === actorUserId;
  if (actorUserId && !isOwner && !isSeller) {
    throw new ValidationError('Not authorized to process this payment');
  }

  // 1.4. Fetch invoice (no lock, using pool)
  const invoiceResult = await query(
    `SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  );

  if (invoiceResult.rows.length === 0) {
    throw new ValidationError('No invoice found for this order. Generate a new invoice.');
  }

  const preliminaryInvoice = invoiceResult.rows[0];

  // 1.5. Preliminary invoice status check (fast exit)
  if (preliminaryInvoice.status === 'paid') {
    return {
      ok: true,
      state: 'confirmed',
      idempotent: true,
      message: 'Invoice already paid',
    };
  }

  // 1.6. Preliminary expiration check
  if (new Date(preliminaryInvoice.expires_at) < new Date()) {
    return {
      ok: false,
      state: 'expired',
      code: 'INVOICE_EXPIRED',
      message: 'Payment window expired. Please create a new order.',
    };
  }

  // 1.7. Fetch payment record for verification
  const paymentResult = await query(
    `SELECT id, tx_hash, currency, recipient_address, expected_crypto_amount, status
     FROM payments
     WHERE order_id = $1 AND status IN ('pending', 'processing')
     ORDER BY created_at DESC
     LIMIT 1`,
    [orderId]
  );

  if (paymentResult.rows.length === 0) {
    return {
      ok: false,
      state: 'failed',
      code: 'NO_PAYMENT_RECORD',
      message: 'No pending payment found. Please initiate payment first.',
    };
  }

  const payment = paymentResult.rows[0];
  const verifyTxHash = txHash || payment.tx_hash;

  if (!verifyTxHash) {
    return {
      ok: false,
      state: 'failed',
      code: 'NO_TX_HASH',
      message: 'Transaction hash required for verification.',
    };
  }

  // 1.8. BLOCKCHAIN VERIFICATION (OUTSIDE TRANSACTION!)
  // INV-P1-1 FIX: This is the slow part - do it before acquiring locks
  logger.info(`[InvoicePayment] Phase 1: Starting blockchain verification for order ${orderId}`, {
    txHash: verifyTxHash,
    currency: payment.currency,
    expectedAmount: payment.expected_crypto_amount,
  });

  let verificationResult;
  try {
    verificationResult = await blockchainVerificationService.verifyPayment(
      verifyTxHash,
      payment.currency,
      payment.recipient_address,
      parseFloat(payment.expected_crypto_amount)
    );
  } catch (verifyError) {
    logger.error(`[InvoicePayment] Blockchain verification error for order ${orderId}`, {
      error: verifyError.message,
    });
    return {
      ok: false,
      state: 'failed',
      code: 'VERIFICATION_ERROR',
      message: `Blockchain verification failed: ${verifyError.message}`,
    };
  }

  // 1.9. Handle verification pending (not enough confirmations yet)
  if (!verificationResult.verified) {
    if (verificationResult.status === 'failed' && verificationResult.error) {
      return {
        ok: false,
        state: 'failed',
        code: 'VERIFICATION_FAILED',
        message: verificationResult.error,
        confirmations: verificationResult.confirmations,
      };
    }

    // Still pending (waiting for confirmations)
    return {
      ok: false,
      state: 'pending',
      code: 'AWAITING_CONFIRMATIONS',
      message: `Payment found but waiting for confirmations (${verificationResult.confirmations || 0} of required)`,
      confirmations: verificationResult.confirmations,
    };
  }

  logger.info(`[InvoicePayment] Phase 1: Blockchain verification successful for order ${orderId}`, {
    confirmations: verificationResult.confirmations,
    amount: verificationResult.amount,
  });

  // =========================================================================
  // PHASE 2: FINALIZATION (Atomic transaction with locks)
  // INV-P1-1 FIX: Short, fast transaction - no external API calls
  // =========================================================================

  logger.info(`[InvoicePayment] Phase 2: Starting transaction for order ${orderId}...`);
  const client = await getClient();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // INV-P2-1 FIX: Add lock_timeout for fail-fast behavior
    await client.query("SET LOCAL lock_timeout = '5s'");

    // 2.1. Lock and re-validate order
    const order = await validateAndLockOrder(client, orderId, actorUserId, { allowSeller });

    // 2.2. Re-check idempotency (TOCTOU protection)
    if (order.status === ORDER_STATES.CONFIRMED) {
      await client.query('ROLLBACK');
      return {
        ok: true,
        state: 'confirmed',
        idempotent: true,
        message: 'Order confirmed by concurrent process',
      };
    }

    // 2.3. Lock invoice (FOR UPDATE + advisory lock)
    const currentInvoiceResult = await client.query(
      `SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [orderId]
    );

    if (currentInvoiceResult.rows.length === 0) {
      throw new ValidationError('Invoice disappeared during processing');
    }

    const invoice = currentInvoiceResult.rows[0];

    // Advisory lock for additional safety
    await client.query('SELECT pg_advisory_xact_lock($1)', [invoice.id]);

    // 2.4. Re-validate invoice status (TOCTOU protection)
    const activity = await ensureInvoiceActive(invoice, client);

    if (!activity.active) {
      if (activity.reason === 'already_paid') {
        await client.query('ROLLBACK');
        return { ok: true, state: 'confirmed', idempotent: true, message: 'Invoice paid concurrently' };
      }

      await client.query('COMMIT');
      return {
        ok: false,
        state: 'expired',
        code: 'INVOICE_EXPIRED',
        message: 'Invoice expired during processing',
      };
    }

    // 2.5. Guard against TX reuse
    const guardedPayment = await guardTxReuse(client, verifyTxHash, { orderId });

    if (guardedPayment && guardedPayment.status === 'confirmed') {
      await markInvoicePaid(client, invoice.id, guardedPayment.tx_hash);
      await client.query('COMMIT');
      // Notification in Phase 3
      notifyOrderConfirmed(order.id).catch((err) => {
        logger.error('[InvoicePayment] Notification error:', err);
      });
      return { ok: true, state: 'confirmed', idempotent: true };
    }

    // 2.6. Update payment confirmations
    await client.query(
      `UPDATE payments
       SET blockchain_confirmations = $1, last_checked_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [verificationResult.confirmations || 0, payment.id]
    );

    // 2.7. Unreserve and deduct stock atomically (with FOR UPDATE)
    // Stock was reserved at order creation, now we convert reservation to actual deduction
    const itemsResult = await client.query(
      `SELECT oi.id as item_id, oi.product_id, oi.quantity, p.stock_quantity, p.reserved_quantity, p.is_preorder, p.name as product_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1
       FOR UPDATE OF p`,
      [orderId]
    );

    for (const item of itemsResult.rows) {
      if (!item.is_preorder) {
        // Step 1: Unreserve stock (release the reservation made at order creation)
        await productQueries.unreserveStock(item.product_id, item.quantity, client);

        logger.debug('[InvoicePayment] Stock unreserved for payment', {
          orderId,
          productId: item.product_id,
          quantity: item.quantity,
        });

        // Step 2: Deduct actual stock with WHERE clause to prevent race condition
        const deductResult = await client.query(
          `UPDATE products
           SET stock_quantity = stock_quantity - $1, updated_at = NOW()
           WHERE id = $2 AND stock_quantity >= $1
           RETURNING stock_quantity`,
          [item.quantity, item.product_id]
        );

        if (deductResult.rowCount === 0) {
          logger.error(
            `[InvoicePayment] Insufficient stock for product ${item.product_id}: requested=${item.quantity}`
          );
          await client.query('ROLLBACK');

          // Alert admin about stock issue (don't let alert failure affect user response)
          try {
            alertStockDeductionFailed(orderId, item.product_id, `Insufficient stock for quantity: ${item.quantity}`);
          } catch (alertError) {
            logger.error('[InvoicePayment] Failed to send stock alert:', alertError.message);
          }

          return {
            ok: false,
            state: 'failed',
            code: 'INSUFFICIENT_STOCK',
            message: `"${item.product_name}" is sold out. Your payment will be refunded.`,
            productId: item.product_id,
            requested: item.quantity,
          };
        }
      }
    }

    // 2.7.1. Mark items as stock_deducted (for proper stock return on cancellation)
    await client.query(
      `UPDATE order_items SET stock_deducted = true WHERE order_id = $1`,
      [orderId]
    );

    // 2.8. Update order status
    await client.query(
      `UPDATE orders
       SET status = 'confirmed',
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );

    // 2.9. Update payment status
    await client.query(
      `UPDATE payments
       SET status = 'confirmed',
           verification_status = 'confirmed',
           tx_hash = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [payment.id, verifyTxHash]
    );

    // 2.10. Mark invoice as paid
    await markInvoicePaid(client, invoice.id, verifyTxHash);

    await client.query('COMMIT');
    logger.info(`[InvoicePayment] Phase 2: Transaction committed for order ${orderId}`);

    // =========================================================================
    // PHASE 3: NOTIFICATIONS (Outside transaction)
    // =========================================================================

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

    // Handle lock_timeout error (PostgreSQL code 55P03)
    if (error.code === '55P03') {
      logger.warn(
        `[InvoicePayment] Lock contention for order ${orderId}. Failed to acquire lock within 5s.`
      );
      throw new ValidationError(`System is busy processing order ${orderId}. Please try again shortly.`);
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
