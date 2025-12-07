import { query } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Auto-cancel unpaid orders after 20 minutes and free reserved stock
 * IMPORTANT: Only cancels orders WITHOUT a submitted payment (tx_hash)
 */
async function cancelUnpaidOrders() {
  try {
    // Find orders pending for > 20 minutes that have NO payment with tx_hash
    // Orders with submitted tx_hash should NOT be cancelled - they're awaiting blockchain confirmation
    const result = await query(
      `SELECT o.id, o.product_id, o.quantity, p.name as product_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.status = 'pending'
       AND o.created_at < NOW() - INTERVAL '20 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM payments pay
         WHERE pay.order_id = o.id
         AND pay.tx_hash IS NOT NULL
       )`
    );

    const orders = result.rows;

    if (orders.length === 0) {
      logger.info('No unpaid orders to cancel');
      return;
    }

    logger.info(`Found ${orders.length} unpaid orders to cancel`);

    // OPTIMIZATION: Batch cancel orders instead of N+1 loop
    // Atomic batch update - only cancels orders that are still pending and have no tx_hash
    const orderIds = orders.map(o => o.id);

    // Batch cancel orders with atomic check
    const cancelResult = await query(
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
      // Batch unreserve stock for cancelled orders
      // Uses subquery to aggregate quantities per product
      await query(
        `UPDATE products p
         SET reserved_quantity = GREATEST(0, p.reserved_quantity - sub.total_qty),
             updated_at = NOW()
         FROM (
           SELECT product_id, SUM(quantity) as total_qty
           FROM orders
           WHERE id = ANY($1)
           GROUP BY product_id
         ) sub
         WHERE p.id = sub.product_id`,
        [cancelledIds]
      );

      logger.info(`Auto-cancelled ${cancelledIds.length} unpaid orders`, { cancelledIds });
    }

    if (skippedCount > 0) {
      logger.info(`Skipped ${skippedCount} orders (paid or status changed)`);
    }

    logger.info(`Successfully processed ${orders.length} unpaid orders`);
  } catch (error) {
    logger.error('Error in cancelUnpaidOrders:', error);
  }
}

/**
 * Expire unfulfilled orders after 7 days without fulfillment
 * Only expires 'pending' orders - confirmed orders are kept in history!
 * FIX: Removed 'confirmed' from list - paid orders should never be expired
 */
async function expireOldOrders() {
  try {
    const result = await query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE status = 'pending'
         AND created_at < NOW() - INTERVAL '7 days'
       RETURNING id, status`,
      ['expired']
    );

    if (result.rowCount > 0) {
      const orderIds = result.rows.map((r) => r.id);
      logger.info(`[expireOldOrders] Expired ${result.rowCount} old orders`, {
        orderIds,
        totalExpired: result.rowCount,
      });
    }

    return result.rows;
  } catch (error) {
    logger.error('[expireOldOrders] Error:', error);
    throw error;
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
