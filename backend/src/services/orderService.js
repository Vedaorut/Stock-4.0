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
    },
    client
  );

  logger.debug('Order created', { orderId: order.id });

  // Create order items records
  await orderItemQueries.createBatch(order.id, items, client);

  logger.debug('Order items created', { orderId: order.id, itemCount: items.length });

  // NOTE: Stock reservation happens on payment confirmation, not order creation
  // This is first-come-first-served on payment

  logger.info('Order created successfully', {
    orderId: order.id,
    buyerId: userId,
    itemCount: items.length,
    totalPrice,
  });

  return order;
};

/**
 * Return stock for cancelled order
 *
 * @param {number} orderId - Order ID
 * @param {Object} client - Database client (transaction)
 */
export const returnStockForCancelledOrder = async (orderId, client) => {
  logger.info('Returning stock for cancelled order', { orderId });

  // Get order items with product info
  const items = await orderItemQueries.findByOrderIdWithStock(orderId, client);

  logger.debug('Found order items', { orderId, itemCount: items.length });

  // Return stock for non-preorder items
  // TODO: Add stock_deducted field to order_items table to track if stock was actually deducted.
  // Currently we only return stock for confirmed orders (checked in updateOrderStatusWithStockLogic),
  // but ideally we should check item.stock_deducted === true before returning.
  for (const item of items) {
    if (!item.is_preorder && item.product_id) {
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

      logger.info('Stock returned for cancelled item', {
        orderId,
        productId: item.product_id,
        productName: item.product_name,
        quantityReturned: item.ordered_quantity,
        newStock: productExists.rows[0].stock_quantity + item.ordered_quantity,
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

  // If cancelling confirmed order → return stock
  if (newStatus === 'cancelled' && currentStatus === 'confirmed') {
    logger.info('Cancelling confirmed order - returning stock', { orderId });
    await returnStockForCancelledOrder(orderId, client);
  } else if (newStatus === 'cancelled') {
    logger.info('Cancelling non-confirmed order - no stock to return', {
      orderId,
      currentStatus,
    });
  }

  // Update order status
  await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
    newStatus,
    orderId,
  ]);

  logger.info('Order status updated successfully', { orderId, newStatus });
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

    // Get summary statistics
    const summaryResult = await client.query(
      `SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN o.status IN ('confirmed', 'shipped', 'delivered') THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN o.status IN ('confirmed', 'shipped', 'delivered') THEN o.total_price ELSE 0 END) as total_revenue,
        AVG(CASE WHEN o.status IN ('confirmed', 'shipped', 'delivered') THEN o.total_price ELSE NULL END) as avg_order_value
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN shops s ON p.shop_id = s.id
      WHERE s.owner_id = $1
        AND o.created_at >= $2
        AND o.created_at < $3`,
      [userId, fromDate, toDateExclusive]
    );

    // Get top products
    const topProductsResult = await client.query(
      `SELECT
        p.id,
        p.name,
        COUNT(o.id) as quantity,
        SUM(o.total_price) as revenue
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN shops s ON p.shop_id = s.id
      WHERE s.owner_id = $1
        AND o.created_at >= $2
        AND o.created_at < $3
        AND o.status IN ('confirmed', 'shipped', 'delivered')
      GROUP BY p.id, p.name
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
  returnStockForCancelledOrder,
  updateOrderStatusWithStockLogic,
  getOrderAnalytics,
};
