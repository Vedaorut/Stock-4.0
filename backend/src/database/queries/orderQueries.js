import { query } from '../../config/database.js';

/**
 * Order database queries
 */
export const orderQueries = {
  // Create new order (with optional transaction client)
  create: async (orderData, client = null) => {
    const { buyerId, productId, quantity, totalPrice, currency, deliveryAddress } = orderData;
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `INSERT INTO orders (buyer_id, product_id, quantity, total_price, currency, delivery_address, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [buyerId, productId, quantity, totalPrice, currency, deliveryAddress]
    );
    return result.rows[0];
  },

  // Find order by ID
  findById: async (id, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `SELECT o.*,
              p.name as product_name,
              s.id as shop_id,
              s.name as shop_name, s.owner_id,
              u.username as buyer_username, u.telegram_id as buyer_telegram_id
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN shops s ON p.shop_id = s.id
       LEFT JOIN users u ON o.buyer_id = u.id
       WHERE o.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // Find orders by buyer ID
  // P0-DB-3 FIX: Enforce MAX_LIMIT
  // Returns payment verification info for "My Orders" UI
  findByBuyerId: async (buyerId, limit = 50, offset = 0) => {
    const MAX_LIMIT = 1000;
    const safeLimit = Math.min(limit, MAX_LIMIT);

    const result = await query(
      `SELECT o.*,
              p.name as product_name,
              s.name as shop_name,
              pay.blockchain_confirmations,
              pay.verification_status as payment_verification_status
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN shops s ON p.shop_id = s.id
       LEFT JOIN payments pay ON pay.order_id = o.id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [buyerId, safeLimit, offset]
    );
    return result.rows;
  },

  // Find orders by owner ID
  findByOwnerId: async (ownerId, options = {}) => {
    const { limit = 50, offset = 0, statuses = [] } = options;

    const params = [ownerId];
    const conditions = ['s.owner_id = $1'];
    let paramIndex = 2;

    if (Array.isArray(statuses) && statuses.length > 0) {
      conditions.push(`o.status = ANY($${paramIndex}::text[])`);
      params.push(statuses);
      paramIndex += 1;
    }

    params.push(limit, offset);

    const result = await query(
      `SELECT o.*,
              p.name as product_name,
              s.name as shop_name,
              u.username as buyer_username,
              u.first_name as buyer_first_name,
              u.last_name as buyer_last_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
       JOIN users u ON o.buyer_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return result.rows;
  },

  // Find orders by shop ID with optional status filter
  findByShopId: async (shopId, options = {}) => {
    const { limit = 50, offset = 0, statuses = [] } = options;

    const params = [shopId];
    const conditions = ['p.shop_id = $1'];
    let paramIndex = 2;

    if (Array.isArray(statuses) && statuses.length > 0) {
      conditions.push(`o.status = ANY($${paramIndex}::text[])`);
      params.push(statuses);
      paramIndex += 1;
    }

    params.push(limit, offset);

    const result = await query(
      `SELECT o.*,
              p.name as product_name,
              s.name as shop_name,
              u.username as buyer_username,
              u.first_name as buyer_first_name,
              u.last_name as buyer_last_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
       JOIN users u ON o.buyer_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return result.rows;
  },

  // Update order status
  updateStatus: async (id, status, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `UPDATE orders
       SET status = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    return result.rows[0];
  },

  // Optimized query for invoice generation - replaces 4 queries with 1
  // Supports both single-item orders (via product_id) and multi-item orders (via order_items)
  getInvoiceData: async (orderId) => {
    const result = await query(
      `SELECT
         o.id,
         o.total_price,
         o.buyer_id,
         o.status,
         s.id as shop_id,
         s.name as shop_name,
         s.wallet_btc,
         s.wallet_eth,
         s.wallet_usdt,
         s.wallet_ltc
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products pi ON oi.product_id = pi.id
       JOIN shops s ON s.id = COALESCE(p.shop_id, pi.shop_id)
       WHERE o.id = $1
       LIMIT 1`,
      [orderId]
    );
    return result.rows[0];
  },

  // Set crypto payment details when buyer requests payment info
  setCryptoPayment: async (orderId, { cryptoAmount, cryptoCurrency, paymentAddress }) => {
    const result = await query(
      `UPDATE orders 
       SET crypto_amount = $2,
           crypto_currency = $3,
           payment_address = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [orderId, cryptoAmount, cryptoCurrency, paymentAddress]
    );
    return result.rows[0];
  },

  // Update order with payment hash
  updatePaymentHash: async (orderId, paymentHash) => {
    const result = await query(
      `UPDATE orders SET payment_hash = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [orderId, paymentHash]
    );
    return result.rows[0];
  },
};

export default orderQueries;
