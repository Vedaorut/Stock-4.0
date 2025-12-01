import { query } from '../config/database.js';
import { productQueries } from '../database/queries/index.js';
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

    // Cancel each order and unreserve stock
    for (const order of orders) {
      try {
        // Unreserve stock
        await productQueries.unreserveStock(order.product_id, order.quantity);

        // Cancel order
        await query(
          `UPDATE orders
           SET status = 'cancelled',
               updated_at = NOW()
           WHERE id = $1`,
          [order.id]
        );

        logger.info(`Auto-cancelled order #${order.id} (${order.product_name})`);
      } catch (err) {
        logger.error(`Failed to cancel order #${order.id}:`, err);
      }
    }

    logger.info(`Successfully cancelled ${orders.length} unpaid orders`);
  } catch (error) {
    logger.error('Error in cancelUnpaidOrders:', error);
  }
}

/**
 * Expire unfulfilled orders after 7 days without fulfillment
 * Sets orders with status 'pending' or 'confirmed' to 'expired'
 */
async function expireOldOrders() {
  try {
    const result = await query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE status = ANY($2)
         AND created_at < NOW() - INTERVAL '7 days'
       RETURNING id, status`,
      ['expired', ['pending', 'confirmed']]
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
