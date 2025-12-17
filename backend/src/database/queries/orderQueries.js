import { query } from '../../config/database.js';

/**
 * Order database queries
 */
export const orderQueries = {
  // Create new order (with optional transaction client)
  create: async (orderData, client = null) => {
    const { buyerId, productId, quantity, totalPrice, currency, deliveryAddress, shopId } = orderData;
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `INSERT INTO orders (buyer_id, product_id, quantity, total_price, currency, delivery_address, status, shop_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [buyerId, productId, quantity, totalPrice, currency, deliveryAddress, shopId]
    );
    return result.rows[0];
  },

  // Find order by ID
  findById: async (id, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `SELECT o.*,
              COALESCE(p.name, (SELECT oi.product_name FROM order_items oi WHERE oi.order_id = o.id LIMIT 1)) as product_name,
              s.id as shop_id,
              s.name as shop_name,
              s.owner_id,
              u.username as buyer_username, u.telegram_id as buyer_telegram_id,
              u.language as buyer_language,
              seller.telegram_id as seller_telegram_id,
              seller.username as seller_username,
              seller.language as seller_language
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN shops s ON o.shop_id = s.id
       LEFT JOIN users u ON o.buyer_id = u.id
       LEFT JOIN users seller ON s.owner_id = seller.id
       WHERE o.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // Find orders by buyer ID
  // P0-DB-3 FIX: Enforce MAX_LIMIT
  // Returns payment verification info for "My Orders" UI
  findByBuyerId: async (buyerId, options = {}) => {
    const { limit = 50, offset = 0, statuses } = options;
    const MAX_LIMIT = 1000;
    const safeLimit = Math.min(limit, MAX_LIMIT);

    // Default: show only active/completed orders, exclude cancelled
    // DB constraint: pending, confirmed, shipped, delivered, cancelled
    const defaultStatuses = ['pending', 'confirmed', 'shipped', 'delivered'];
    const statusFilter = statuses && statuses.length > 0 ? statuses : defaultStatuses;

    const result = await query(
      `SELECT o.*,
              COALESCE(p.name, (SELECT oi.product_name FROM order_items oi WHERE oi.order_id = o.id LIMIT 1)) as product_name,
              s.name as shop_name,
              pay.blockchain_confirmations,
              pay.verification_status as payment_verification_status
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN shops s ON o.shop_id = s.id
       LEFT JOIN payments pay ON pay.order_id = o.id
       WHERE o.buyer_id = $1
         AND o.status = ANY($2::text[])
       ORDER BY o.created_at DESC
       LIMIT $3 OFFSET $4`,
      [buyerId, statusFilter, safeLimit, offset]
    );
    return result.rows;
  },

  // Find orders by owner ID
  // BE-P0-001 FIX: Enforce MAX_LIMIT to prevent DoS
  findByOwnerId: async (ownerId, options = {}) => {
    const MAX_LIMIT = 1000;
    const { limit = 50, offset = 0, statuses = [] } = options;
    const safeLimit = Math.min(limit, MAX_LIMIT);

    const params = [ownerId];
    const conditions = ['(s.owner_id = $1 OR ps.owner_id = $1)'];
    let paramIndex = 2;

    if (Array.isArray(statuses) && statuses.length > 0) {
      conditions.push(`o.status = ANY($${paramIndex}::text[])`);
      params.push(statuses);
      paramIndex += 1;
    }

    params.push(safeLimit, offset);

    const result = await query(
      `SELECT o.*,
              COALESCE(p.name, (SELECT oi.product_name FROM order_items oi WHERE oi.order_id = o.id LIMIT 1)) as product_name,
              s.name as shop_name,
              u.username as buyer_username,
              u.first_name as buyer_first_name,
              u.last_name as buyer_last_name
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN shops s ON o.shop_id = s.id
       LEFT JOIN shops ps ON p.shop_id = ps.id
       LEFT JOIN users u ON o.buyer_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return result.rows;
  },

  // Find orders by multiple shop IDs with optional status filter
  // Used for worker orders aggregation (replaces N+1 query pattern)
  findByShopIds: async (shopIds, options = {}) => {
    if (!Array.isArray(shopIds) || shopIds.length === 0) {
      return [];
    }

    const { limit = 50, offset = 0, statuses = [] } = options;

    const params = [shopIds];
    const conditions = ['o.shop_id = ANY($1)'];
    let paramIndex = 2;

    if (Array.isArray(statuses) && statuses.length > 0) {
      conditions.push(`o.status = ANY($${paramIndex}::text[])`);
      params.push(statuses);
      paramIndex += 1;
    }

    params.push(limit, offset);

    const result = await query(
      `SELECT o.*,
              COALESCE(p.name, (SELECT oi.product_name FROM order_items oi WHERE oi.order_id = o.id LIMIT 1)) as product_name,
              s.name as shop_name,
              u.username as buyer_username,
              u.first_name as buyer_first_name,
              u.last_name as buyer_last_name
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       JOIN shops s ON o.shop_id = s.id
       LEFT JOIN users u ON o.buyer_id = u.id
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
    const conditions = ['o.shop_id = $1'];
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
       LEFT JOIN products p ON o.product_id = p.id
       JOIN shops s ON o.shop_id = s.id
       LEFT JOIN users u ON o.buyer_id = u.id
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
       LEFT JOIN shops s ON s.id = o.shop_id
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products pi ON oi.product_id = pi.id
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

  // Update notification status after sending payment notifications
  updateNotificationStatus: async (orderId, notificationStatus) => {
    const result = await query(
      `UPDATE orders
       SET notification_status = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [orderId, JSON.stringify(notificationStatus)]
    );
    return result.rows[0];
  },

  // Count orders by shop ID with optional status filter
  countByShopId: async (shopId, statuses = null) => {
    const params = [shopId];
    let statusFilter = '';

    if (Array.isArray(statuses) && statuses.length > 0) {
      statusFilter = ` AND o.status = ANY($2::text[])`;
      params.push(statuses);
    }

    const result = await query(
      `SELECT COUNT(*) as total 
       FROM orders o
       WHERE o.shop_id = $1${statusFilter}`,
      params
    );

    return parseInt(result.rows[0]?.total || 0, 10);
  },
};

export default orderQueries;
