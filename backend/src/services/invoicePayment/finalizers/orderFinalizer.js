/**
 * Order Payment Finalizer
 *
 * Handles the finalization of order payments after blockchain verification.
 * This is a CRITICAL money-handling module - changes require careful review.
 *
 * Responsibilities:
 * - Check invoice expiry before confirmation
 * - Lock products to prevent overselling (FOR UPDATE)
 * - Validate stock availability (legacy single-item + order_items)
 * - Handle PRODUCT_UNAVAILABLE and STOCK_INSUFFICIENT scenarios
 * - Deduct stock for non-preorder items
 * - Update order status to PAID
 * - Mark invoice as paid
 * - Update payment status
 *
 * @module invoicePayment/finalizers/orderFinalizer
 */

import { orderItemQueries, productQueries, paymentQueries } from '../../../database/queries/index.js';
import { markInvoicePaid } from '../utils/paymentRecords.js';
import { INVOICE_STATES } from '../../../constants/invoice.js';
import { ORDER_STATES } from '../constants.js';

/**
 * Finalizes an order payment after successful blockchain verification.
 *
 * This function performs the following steps atomically within the provided transaction:
 * 1. Validates invoice hasn't expired
 * 2. Locks products to prevent concurrent stock modifications
 * 3. Validates stock availability for all order items
 * 4. Deducts stock for non-preorder items
 * 5. Updates order status to PAID
 * 6. Marks invoice as paid
 * 7. Updates payment record status
 *
 * @param {Object} client - PostgreSQL client (must be in active transaction)
 * @param {Object} options - Finalization options
 * @param {Object} options.order - Order record with id, product_id, quantity
 * @param {Object} options.invoice - Invoice record with id, expires_at
 * @param {Object} options.verification - Blockchain verification result
 * @param {string} options.verification.txHash - Transaction hash
 * @param {number} options.verification.confirmations - Number of confirmations
 * @param {Object|null} options.payment - Payment record (may be null)
 * @returns {Promise<Object>} Result object with ok, state, and optional error details
 *
 * @example
 * const result = await finalizeOrderPayment(client, {
 *   order: { id: 1, product_id: 100, quantity: 2 },
 *   invoice: { id: 10, expires_at: '2024-01-01T12:00:00Z' },
 *   verification: { txHash: '0x...', confirmations: 6 },
 *   payment: { id: 5, status: 'pending' }
 * });
 *
 * if (result.ok) {
 *   console.log('Order confirmed');
 * } else {
 *   console.log(`Failed: ${result.code} - ${result.message}`);
 * }
 */
export async function finalizeOrderPayment(client, { order, invoice, verification, payment }) {
  // =========================================================================
  // STEP 1: Check invoice expiry just before confirmation
  // =========================================================================
  const now = new Date();
  const expiresAt = new Date(invoice.expires_at);

  if (expiresAt < now) {
    await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
      ORDER_STATES.CANCELLED,
      order.id,
    ]);
    await client.query('UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2', [
      INVOICE_STATES.EXPIRED,
      invoice.id,
    ]);

    return {
      ok: false,
      state: 'expired',
      code: 'INVOICE_EXPIRED',
      message: 'Payment window expired. Please create a new order.',
    };
  }

  // =========================================================================
  // STEP 2: Lock products to avoid overselling
  // =========================================================================
  const orderItems = await orderItemQueries.findByOrderIdWithStock(order.id, client);
  const productIds = orderItems.map((item) => item.product_id).filter(Boolean);

  if (productIds.length > 0) {
    await client.query(
      `SELECT id FROM products WHERE id = ANY($1::int[]) FOR UPDATE`,
      [productIds]
    );
  }

  // =========================================================================
  // STEP 3: Validate stock and product existence
  // =========================================================================
  if (orderItems.length === 0) {
    // Legacy single-item order fallback
    const checkResult = await client.query(
      `SELECT p.stock_quantity, p.is_preorder, p.name as product_name,
              s.id as shop_id, s.name as shop_name
         FROM products p
         LEFT JOIN shops s ON p.shop_id = s.id
        WHERE p.id = $1 FOR UPDATE`,
      [order.product_id]
    );

    if (checkResult.rows.length === 0 || !checkResult.rows[0].shop_id) {
      await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
        ORDER_STATES.CANCELLED,
        order.id,
      ]);

      return {
        ok: false,
        state: 'cancelled',
        code: 'PRODUCT_UNAVAILABLE',
        message: 'This product is no longer available. Order cancelled.',
      };
    }

    const productInfo = checkResult.rows[0];
    if (!productInfo.is_preorder && productInfo.stock_quantity < order.quantity) {
      await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
        ORDER_STATES.CANCELLED,
        order.id,
      ]);

      return {
        ok: false,
        state: 'cancelled',
        code: 'STOCK_INSUFFICIENT',
        message: 'Sorry, this product is sold out. Your payment will be refunded.',
      };
    }
  } else {
    // Multi-item order validation
    for (const item of orderItems) {
      if (!item.product_id || !item.shop_id) {
        await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
          ORDER_STATES.CANCELLED,
          order.id,
        ]);

        return {
          ok: false,
          state: 'cancelled',
          code: 'PRODUCT_UNAVAILABLE',
          message: 'One or more products are no longer available. Order cancelled.',
        };
      }

      if (!item.is_preorder && item.stock_quantity < item.ordered_quantity) {
        await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
          ORDER_STATES.CANCELLED,
          order.id,
        ]);

        return {
          ok: false,
          state: 'cancelled',
          code: 'STOCK_INSUFFICIENT',
          message: `"${item.product_name}" is sold out. Your payment will be refunded.`,
        };
      }
    }
  }

  // =========================================================================
  // STEP 4: Deduct stock and confirm order
  // =========================================================================
  if (orderItems.length === 0) {
    // Legacy single-item: check if preorder before deducting
    const preorderCheck = await client.query('SELECT is_preorder FROM products WHERE id = $1', [
      order.product_id,
    ]);
    if (preorderCheck.rows.length > 0 && !preorderCheck.rows[0].is_preorder) {
      // Release reservation before deducting stock
      await productQueries.unreserveStock(order.product_id, order.quantity, client);
      await productQueries.updateStock(order.product_id, -order.quantity, client);
    }
  } else {
    // Multi-item: deduct stock for each non-preorder item
    for (const item of orderItems) {
      if (!item.is_preorder) {
        // Release reservation before deducting stock
        await productQueries.unreserveStock(item.product_id, item.ordered_quantity, client);
        await productQueries.updateStock(item.product_id, -item.ordered_quantity, client);
      }
    }

    // Mark only non-preorder items as stock_deducted for accurate cancellation handling
    const deductedItemIds = orderItems
      .filter((item) => !item.is_preorder && item.id)
      .map((item) => item.id);

    if (deductedItemIds.length > 0) {
      await client.query(
        `UPDATE order_items SET stock_deducted = true WHERE id = ANY($1::int[])`,
        [deductedItemIds]
      );
    }
  }

  // =========================================================================
  // STEP 5: Update order status to PAID
  // =========================================================================
  await client.query('UPDATE orders SET status = $1, updated_at = NOW(), paid_at = NOW() WHERE id = $2', [
    ORDER_STATES.PAID,
    order.id,
  ]);

  // =========================================================================
  // STEP 6: Mark invoice as paid
  // =========================================================================
  await markInvoicePaid(client, invoice.id, verification.txHash);

  // =========================================================================
  // STEP 7: Update payment status
  // =========================================================================
  if (payment?.id && payment.status !== 'confirmed') {
    await paymentQueries.updateStatus(payment.id, 'confirmed', verification.confirmations, client);
  }

  return {
    ok: true,
    state: 'paid',
  };
}
