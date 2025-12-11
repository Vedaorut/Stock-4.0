import { orderQueries, orderItemQueries, productQueries } from '../database/queries/index.js';
import logger from '../utils/logger.js';

/**
 * Order Service
 * Business logic for order operations
 */

/**
 * Create order with items in transaction
 *
 * @param {number} userId - Buyer user ID
 * @param {Object} validatedData - Validated product data from validateProductsForOrder
 * @param {string|null} deliveryAddress - Delivery address
 * @param {Object} client - Database client (transaction)
 * @returns {Object} - Created order
 */
export const createOrderWithItems = async (userId, validatedData, deliveryAddress, client) => {
  const { items, shopId, currency, totalPrice } = validatedData;

  logger.info('Creating order', {
    userId,
    shopId,
    itemCount: items.length,
    totalPrice,
    currency,
  });

  // Create order (product_id stores first item for backward compatibility)
  const order = await orderQueries.create(
    {
      buyerId: userId,
      productId: items[0].productId,
      quantity: items.reduce((sum, item) => sum + item.quantity, 0), // Total quantity
      totalPrice,
      currency,
      deliveryAddress,
      shopId,
    },
    client
  );

  logger.debug('Order created', { orderId: order.id });

  // Create order items records
  await orderItemQueries.createBatch(order.id, items, client);

  logger.debug('Order items created', { orderId: order.id, itemCount: items.length });

  // RESERVE stock for non-preorder items (prevents overselling)
  // Stock is unreserved on cancellation/expiration, or converted to deduction on payment
  for (const item of items) {
    if (!item.isPreorder) {
      const reserved = await productQueries.reserveStock(item.productId, item.quantity, client);
      if (!reserved) {
        // This shouldn't happen if validateProductsForOrder worked correctly,
        // but handle it for safety (concurrent order might have taken the stock)
        throw new Error(
          `Failed to reserve stock for product ${item.productId} (${item.productName}). ` +
          `Requested: ${item.quantity}. Please try again.`
        );
      }
      logger.debug('Stock reserved for item', {
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        newReserved: reserved.reserved_quantity,
      });
    }
  }

  logger.info('Order created successfully', {
    orderId: order.id,
    buyerId: userId,
    itemCount: items.length,
    totalPrice,
  });

  return order;
};

/**
 * Unreserve stock for pending order (stock was reserved but not deducted)
 * Called when pending order is cancelled or expires before payment
 *
 * @param {number} orderId - Order ID
 * @param {Object} client - Database client (transaction)
 */
export const unreserveStockForOrder = async (orderId, client) => {
  logger.info('Unreserving stock for order', { orderId });

  if (!client) {
    throw new Error('Database client is required to unreserve stock');
  }

  // Get order items with product info
  const items = await orderItemQueries.findByOrderIdWithStock(orderId, client);

  logger.debug('Found order items for unreserve', { orderId, itemCount: items.length });

  // Unreserve stock for non-preorder items that haven't been deducted yet
  for (const item of items) {
    if (!item.is_preorder && item.product_id && !item.stock_deducted) {
      // Check product still exists
      const productExists = await client.query(
        'SELECT id, reserved_quantity FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      if (productExists.rows.length === 0) {
        logger.warn('Product deleted, skipping unreserve', {
          orderId,
          productId: item.product_id,
          productName: item.product_name,
        });
        continue;
      }

      // Unreserve stock
      await productQueries.unreserveStock(item.product_id, item.ordered_quantity, client);

      logger.info('Stock unreserved for cancelled item', {
        orderId,
        productId: item.product_id,
        productName: item.product_name,
        quantityUnreserved: item.ordered_quantity,
      });
    }
  }

  logger.info('Stock unreserve completed', { orderId });
};

/**
 * Return stock for cancelled order
 *
 * @param {number} orderId - Order ID
 * @param {Object} client - Database client (transaction)
 */
export const returnStockForCancelledOrder = async (orderId, client) => {
  logger.info('Returning stock for cancelled order', { orderId });

  if (!client) {
    throw new Error('Database client is required to return stock');
  }

  // Get order items with product info
  const items = await orderItemQueries.findByOrderIdWithStock(orderId, client);

  logger.debug('Found order items', { orderId, itemCount: items.length });

  // Return stock for non-preorder items ONLY if stock was actually deducted
  for (const item of items) {
    // Only return stock if it was actually deducted (prevents double return on edge cases)
    if (!item.is_preorder && item.product_id && item.stock_deducted) {
      // Check product still exists before returning stock
      const productExists = await client.query(
        'SELECT id, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      if (productExists.rows.length === 0) {
        logger.warn('Product deleted, skipping stock return', {
          orderId,
          productId: item.product_id,
          productName: item.product_name,
        });
        continue;
      }

      // Return stock
      await productQueries.updateStock(
        item.product_id,
        item.ordered_quantity, // Positive value = add back
        client
      );

      // Mark as not deducted after return (prevents double return)
      await client.query(
        `UPDATE order_items SET stock_deducted = false WHERE id = $1`,
        [item.id]
      );

      logger.info('Stock returned for cancelled item', {
        orderId,
        productId: item.product_id,
        productName: item.product_name,
        quantityReturned: item.ordered_quantity,
        newStock: productExists.rows[0].stock_quantity + item.ordered_quantity,
      });
    } else if (!item.is_preorder && item.product_id && !item.stock_deducted) {
      logger.debug('Skipping stock return - stock was not deducted', {
        orderId,
        productId: item.product_id,
        productName: item.product_name,
      });
    }
  }

  logger.info('Stock return completed', { orderId });
};

/**
 * Update order status with stock logic
 *
 * @param {number} orderId - Order ID
 * @param {string} newStatus - New status
 * @param {string} currentStatus - Current status (for stock return logic)
 * @param {Object} client - Database client (transaction)
 */
export const updateOrderStatusWithStockLogic = async (orderId, newStatus, currentStatus, client) => {
  logger.info('Updating order status', { orderId, currentStatus, newStatus });

  // If caller didn't pass a client, wrap operations in their own transaction
  let managedClient = null;
  let transactionStarted = false;

  try {
    if (!client) {
      const { getClient } = await import('../config/database.js');
      managedClient = await getClient();
      client = managedClient;
      await client.query('BEGIN');
      transactionStarted = true;
    }

    // Lock the order row and re-check status to prevent race conditions
    // (e.g., two concurrent cancellations both returning stock)
    const currentOrderResult = await client.query(
      'SELECT status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (currentOrderResult.rows.length === 0) {
      throw new Error(`Order ${orderId} not found`);
    }

    const actualCurrentStatus = currentOrderResult.rows[0].status;

    // Check if status changed during processing (race condition detection)
    if (actualCurrentStatus !== currentStatus) {
      logger.warn('[OrderService] Status changed during processing - race condition prevented', {
        orderId,
        expected: currentStatus,
        actual: actualCurrentStatus,
        requestedNewStatus: newStatus,
      });
      throw new Error(`Order status changed from ${currentStatus} to ${actualCurrentStatus}`);
    }

    // Handle stock on cancellation based on current status
    if (newStatus === 'cancelled') {
      if (currentStatus === 'confirmed') {
        // Confirmed order = stock was deducted, need to return it
        logger.info('Cancelling confirmed order - returning deducted stock', { orderId });
        await returnStockForCancelledOrder(orderId, client);
      } else if (currentStatus === 'pending') {
        // Pending order = stock was only reserved, need to unreserve it
        logger.info('Cancelling pending order - unreserving stock', { orderId });
        await unreserveStockForOrder(orderId, client);
      } else {
        logger.info('Cancelling order with no stock action needed', {
          orderId,
          currentStatus,
        });
      }
    }

    // Handle stock on expiration (same as pending cancellation)
    if (newStatus === 'expired' && currentStatus === 'pending') {
      logger.info('Expiring pending order - unreserving stock', { orderId });
      await unreserveStockForOrder(orderId, client);
    }

    // Update order status
    await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
      newStatus,
      orderId,
    ]);

    if (transactionStarted) {
      await client.query('COMMIT');
      transactionStarted = false;
    }

    logger.info('Order status updated successfully', { orderId, newStatus });
  } catch (error) {
    if (transactionStarted && client) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (managedClient) {
      managedClient.release();
    }
  }
};

/**
 * Get order analytics for user (seller)
 *
 * @param {number} userId - User ID
 * @param {Date} fromDate - Start date
 * @param {Date} toDate - End date (exclusive upper bound)
 * @returns {Object} - Analytics data
 */
export const getOrderAnalytics = async (userId, fromDate, toDate) => {
  const { getClient } = await import('../config/database.js');
  const client = await getClient();

  try {
    // Add 1 day to toDate for exclusive upper bound
    const toDateExclusive = new Date(toDate);
    toDateExclusive.setDate(toDateExclusive.getDate() + 1);

    // Owner orders scoped via shop_id snapshot (fallback to product shop if needed)
    const summaryResult = await client.query(
      `WITH owner_orders AS (
         SELECT o.id, o.status
         FROM orders o
         LEFT JOIN products p ON o.product_id = p.id
         LEFT JOIN shops s ON s.id = o.shop_id
         LEFT JOIN shops ps ON ps.id = p.shop_id
         WHERE (s.owner_id = $1 OR ps.owner_id = $1)
           AND o.created_at >= $2
           AND o.created_at < $3
       ),
       order_totals AS (
         SELECT oo.id,
                oo.status,
                COALESCE(SUM(oi.price * oi.quantity), 0) AS item_total
         FROM owner_orders oo
         LEFT JOIN order_items oi ON oi.order_id = oo.id
         GROUP BY oo.id, oo.status
       )
       SELECT
         COUNT(*) as total_orders,
         SUM(CASE WHEN status IN ('confirmed', 'shipped', 'delivered') THEN 1 ELSE 0 END) as completed_orders,
         SUM(CASE WHEN status IN ('confirmed', 'shipped', 'delivered') THEN item_total ELSE 0 END) as total_revenue,
         AVG(CASE WHEN status IN ('confirmed', 'shipped', 'delivered') THEN item_total ELSE NULL END) as avg_order_value
       FROM order_totals`,
      [userId, fromDate, toDateExclusive]
    );

    // Get top products aggregated via order_items
    const topProductsResult = await client.query(
      `WITH owner_orders AS (
         SELECT o.id
         FROM orders o
         LEFT JOIN products p ON o.product_id = p.id
         LEFT JOIN shops s ON s.id = o.shop_id
         LEFT JOIN shops ps ON ps.id = p.shop_id
         WHERE (s.owner_id = $1 OR ps.owner_id = $1)
           AND o.created_at >= $2
           AND o.created_at < $3
           AND o.status IN ('confirmed', 'shipped', 'delivered')
       )
       SELECT
         COALESCE(p.name, oi.product_name) as name,
         SUM(oi.quantity) as quantity,
         SUM(oi.price * oi.quantity) as revenue
       FROM order_items oi
       JOIN owner_orders oo ON oo.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       GROUP BY COALESCE(p.name, oi.product_name)
       ORDER BY revenue DESC
       LIMIT 10`,
      [userId, fromDate, toDateExclusive]
    );

    const summary = summaryResult.rows[0];
    const topProducts = topProductsResult.rows;

    return {
      summary: {
        totalRevenue: parseFloat(summary.total_revenue || 0),
        totalOrders: parseInt(summary.total_orders || 0, 10),
        completedOrders: parseInt(summary.completed_orders || 0, 10),
        avgOrderValue: parseFloat(summary.avg_order_value || 0),
      },
      topProducts: topProducts.map((product) => ({
        id: product.id,
        name: product.name,
        quantity: parseInt(product.quantity, 10),
        revenue: parseFloat(product.revenue),
      })),
    };
  } finally {
    client.release();
  }
};

export default {
  createOrderWithItems,
  unreserveStockForOrder,
  returnStockForCancelledOrder,
  updateOrderStatusWithStockLogic,
  getOrderAnalytics,
};
