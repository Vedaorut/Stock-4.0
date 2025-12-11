import { query } from '../../config/database.js';

/**
 * Order Items database queries (for multi-item orders)
 */
export const orderItemQueries = {
  // Create multiple order items in batch (transaction-safe)
  createBatch: async (orderId, items, client = null) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Items must be a non-empty array');
    }

    const queryFn = client ? client.query.bind(client) : query;

    // Build VALUES clause for batch insert
    // Each item: (order_id, product_id, product_name, quantity, price, currency)
    const values = [];
    const params = [];
    let paramIndex = 1;

    items.forEach((item) => {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`
      );
      params.push(
        orderId,
        item.productId,
        item.productName,
        item.quantity,
        item.price,
        item.currency
      );
      paramIndex += 6;
    });

    const result = await queryFn(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, currency)
       VALUES ${values.join(', ')}
       RETURNING *`,
      params
    );

    return result.rows;
  },

  // Find all items for an order
  findByOrderId: async (orderId) => {
    const result = await query(
      `SELECT oi.*, p.name as current_product_name, p.is_active as product_is_active
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [orderId]
    );
    return result.rows;
  },

  // Get order items with shop information
  findByOrderIdWithShop: async (orderId) => {
    const result = await query(
      `SELECT oi.*, p.shop_id, s.name as shop_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN shops s ON p.shop_id = s.id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [orderId]
    );
    return result.rows;
  },

  // Get order items with product stock info (for payment verification and stock return)
  findByOrderIdWithStock: async (orderId, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;

    const result = await queryFn(
      `SELECT
         oi.id,
         oi.product_id,
         oi.quantity as ordered_quantity,
         oi.price as price_at_purchase,
         oi.stock_deducted,
         p.name as product_name,
         p.stock_quantity,
         p.is_preorder,
         p.is_active,
         s.id as shop_id,
         s.name as shop_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN shops s ON p.shop_id = s.id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [orderId]
    );

    return result.rows;
  },
};

export default orderItemQueries;
