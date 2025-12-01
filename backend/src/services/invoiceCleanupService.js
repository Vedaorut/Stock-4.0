import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Clean up expired invoices (older than 24 hours)
 * Releases addresses for reuse and updates order statuses
 */
export async function cleanupExpiredInvoices() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find expired invoices
    const { rows: expiredInvoices } = await client.query(`
      SELECT id, order_id, subscription_id, address, chain
      FROM invoices
      WHERE status = 'pending'
      AND expires_at < NOW()
      AND created_at < NOW() - INTERVAL '24 hours'
    `);

    if (expiredInvoices.length === 0) {
      logger.info('[Invoice Cleanup] No expired invoices found');
      await client.query('COMMIT');
      return { cleaned: 0 };
    }

    logger.info(`[Invoice Cleanup] Found ${expiredInvoices.length} expired invoices`);

    // Update invoice status to 'expired'
    const invoiceIds = expiredInvoices.map((inv) => inv.id);
    await client.query(
      `
      UPDATE invoices
      SET status = 'expired', updated_at = NOW()
      WHERE id = ANY($1)
    `,
      [invoiceIds]
    );

    // Cancel associated orders (if any) - but NOT orders with submitted payment (tx_hash)
    const orderIds = expiredInvoices.filter((inv) => inv.order_id).map((inv) => inv.order_id);
    let cancelledOrderIds = [];

    if (orderIds.length > 0) {
      // Only cancel orders that have NO payment with tx_hash submitted
      // Orders with tx_hash are awaiting blockchain confirmation and should NOT be cancelled
      const cancelResult = await client.query(
        `
        UPDATE orders o
        SET status = 'cancelled', updated_at = NOW()
        WHERE o.id = ANY($1)
        AND o.status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM payments pay
          WHERE pay.order_id = o.id
          AND pay.tx_hash IS NOT NULL
        )
        RETURNING o.id
      `,
        [orderIds]
      );

      // Release reserved stock only for actually cancelled orders
      cancelledOrderIds = cancelResult.rows.map((r) => r.id);
      if (cancelledOrderIds.length > 0) {
        await client.query(
          `
          UPDATE products p
          SET reserved_quantity = reserved_quantity - oi.quantity
          FROM order_items oi
          WHERE oi.product_id = p.id
          AND oi.order_id = ANY($1)
        `,
          [cancelledOrderIds]
        );
      }
    }

    await client.query('COMMIT');

    logger.info(`[Invoice Cleanup] Cleaned ${expiredInvoices.length} expired invoices`, {
      orders_cancelled: cancelledOrderIds.length,
      orders_skipped_with_payment: orderIds.length - cancelledOrderIds.length,
    });

    return {
      cleaned: expiredInvoices.length,
      orders_cancelled: cancelledOrderIds.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[Invoice Cleanup] Error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Start periodic cleanup (runs every hour)
 */
export function startInvoiceCleanup() {
  // Run immediately on start
  cleanupExpiredInvoices().catch((err) =>
    logger.error('[Invoice Cleanup] Initial run failed:', err)
  );

  // Run every hour
  setInterval(
    async () => {
      try {
        await cleanupExpiredInvoices();
      } catch (error) {
        logger.error('[Invoice Cleanup] Periodic run failed:', error);
      }
    },
    60 * 60 * 1000
  ); // 1 hour

  logger.info('[Invoice Cleanup] Service started (runs every hour)');
}

export default {
  cleanupExpiredInvoices,
  startInvoiceCleanup,
};
