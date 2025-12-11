import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Auto-cancel unpaid orders after 20 minutes and free reserved stock
 * IMPORTANT: Only cancels orders WITHOUT a submitted payment (tx_hash)
 */
async function cancelUnpaidOrders() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find orders pending for > 20 minutes that have NO payment with tx_hash
    // Orders with submitted tx_hash should NOT be cancelled - they're awaiting blockchain confirmation
    const result = await client.query(
      `SELECT o.id
       FROM orders o
       WHERE o.status = 'pending'
       AND o.created_at < NOW() - INTERVAL '20 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM payments pay
         WHERE pay.order_id = o.id
         AND pay.tx_hash IS NOT NULL
       )`
    );

    const orderIds = result.rows.map(o => o.id);

    if (orderIds.length === 0) {
      logger.info('No unpaid orders to cancel');
      await client.query('COMMIT');
      return;
    }

    logger.info(`Found ${orderIds.length} unpaid orders to cancel`);

    // Batch cancel orders with atomic check
    const cancelResult = await client.query(
      `UPDATE orders
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = ANY($1)
         AND status = 'pending'
         AND NOT EXISTS (
           SELECT 1 FROM payments pay
           WHERE pay.order_id = orders.id
           AND pay.tx_hash IS NOT NULL
         )
       RETURNING id`,
      [orderIds]
    );

    const cancelledIds = cancelResult.rows.map(r => r.id);
    const skippedCount = orderIds.length - cancelledIds.length;

    if (cancelledIds.length > 0) {
      // Batch unreserve stock for cancelled orders using order_items (supports multi-item orders)
      // Only unreserve for non-preorder products where stock wasn't already deducted
      await client.query(
        `UPDATE products p
         SET reserved_quantity = GREATEST(0, p.reserved_quantity - sub.total_qty),
             updated_at = NOW()
         FROM (
           SELECT oi.product_id, SUM(oi.quantity) as total_qty
           FROM order_items oi
           JOIN products prod ON oi.product_id = prod.id
           WHERE oi.order_id = ANY($1)
             AND prod.is_preorder = false
             AND oi.stock_deducted = false
           GROUP BY oi.product_id
         ) sub
         WHERE p.id = sub.product_id`,
        [cancelledIds]
      );

      logger.info(`Auto-cancelled ${cancelledIds.length} unpaid orders`, { cancelledIds });
    }

    if (skippedCount > 0) {
      logger.info(`Skipped ${skippedCount} orders (paid or status changed)`);
    }

    await client.query('COMMIT');
    logger.info(`Successfully processed ${orderIds.length} unpaid orders`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in cancelUnpaidOrders:', error);
  } finally {
    client.release();
  }
}

/**
 * Expire unfulfilled orders after 7 days without fulfillment
 * Only expires 'pending' orders - confirmed orders are kept in history!
 * FIX: Removed 'confirmed' from list - paid orders should never be expired
 */
async function expireOldOrders() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE status = 'pending'
         AND created_at < NOW() - INTERVAL '7 days'
       RETURNING id, status`,
      ['expired']
    );

    if (result.rowCount > 0) {
      const orderIds = result.rows.map((r) => r.id);

      // Unreserve stock for expired orders using order_items (supports multi-item orders)
      // Only unreserve for non-preorder products where stock wasn't already deducted
      await client.query(
        `UPDATE products p
         SET reserved_quantity = GREATEST(0, p.reserved_quantity - sub.total_qty),
             updated_at = NOW()
         FROM (
           SELECT oi.product_id, SUM(oi.quantity) as total_qty
           FROM order_items oi
           JOIN products prod ON oi.product_id = prod.id
           WHERE oi.order_id = ANY($1)
             AND prod.is_preorder = false
             AND oi.stock_deducted = false
           GROUP BY oi.product_id
         ) sub
         WHERE p.id = sub.product_id`,
        [orderIds]
      );

      logger.info(`[expireOldOrders] Expired ${result.rowCount} old orders and unreserved stock`, {
        orderIds,
        totalExpired: result.rowCount,
      });
    }

    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[expireOldOrders] Error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Cleanup intervals
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes for unpaid orders
const EXPIRATION_INTERVAL = 60 * 60 * 1000; // 1 hour for old orders

export function startOrderCleanup() {
  logger.info('Starting order cleanup service');
  logger.info('  - Unpaid orders cleanup: runs every 5 minutes');
  logger.info('  - Order expiration: runs every 1 hour');

  // Cancel unpaid orders - run immediately on startup
  cancelUnpaidOrders();
  setInterval(cancelUnpaidOrders, CLEANUP_INTERVAL);

  // Expire old orders - run immediately on startup
  expireOldOrders();
  setInterval(expireOldOrders, EXPIRATION_INTERVAL);
}

export { expireOldOrders, cancelUnpaidOrders };
export default { startOrderCleanup, expireOldOrders, cancelUnpaidOrders };
