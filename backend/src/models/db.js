import { query, getClient } from '../config/database.js';

/**
 * User database queries
 */
export const userQueries = {
  // Find user by Telegram ID
  findByTelegramId: async (telegramId) => {
    const result = await query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0];
  },

  // Find user by ID
  findById: async (id) => {
    const result = await query(
      'SELECT id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  // Create new user
  create: async (userData) => {
    const { telegramId, username, firstName, lastName } = userData;
    const result = await query(
      `INSERT INTO users (telegram_id, username, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [telegramId, username, firstName, lastName]
    );
    return result.rows[0];
  },

  // Update user
  update: async (id, userData) => {
    const { username, firstName, lastName } = userData;
    const result = await query(
      `UPDATE users
       SET username = COALESCE($2, username),
           first_name = COALESCE($3, first_name),
           last_name = COALESCE($4, last_name),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, username, firstName, lastName]
    );
    return result.rows[0];
  },

  // Update user role
  updateRole: async (userId, role) => {
    const result = await query(
      `UPDATE users
       SET selected_role = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at`,
      [userId, role]
    );
    return result.rows[0];
  }
};

/**
 * Shop database queries
 */
export const shopQueries = {
  // Create new shop
  create: async (shopData) => {
    const { ownerId, name, description, logo } = shopData;
    const result = await query(
      `INSERT INTO shops (owner_id, name, description, logo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ownerId, name, description, logo]
    );
    return result.rows[0];
  },

  // Find shop by ID
  findById: async (id) => {
    const result = await query(
      `SELECT s.*, u.username as seller_username, u.first_name as seller_first_name
       FROM shops s
       JOIN users u ON s.owner_id = u.id
       WHERE s.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // Find shops by owner ID
  findByOwnerId: async (ownerId) => {
    const result = await query(
      'SELECT * FROM shops WHERE owner_id = $1 ORDER BY created_at DESC',
      [ownerId]
    );
    return result.rows;
  },

  // Search active shops by name with optional subscription context
  searchByName: async (name, limit = 10, userId = null) => {
    const params = [`%${name}%`, limit];
    let paramIndex = params.length + 1;

    let queryText = `
      SELECT
        s.*,
        u.username as seller_username,
        u.first_name as seller_first_name,
        u.last_name as seller_last_name,
        ${userId ? `EXISTS(
          SELECT 1 FROM subscriptions sub
          WHERE sub.shop_id = s.id AND sub.user_id = $${paramIndex}
        )` : 'false'} as is_subscribed
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      WHERE s.is_active = true
        AND s.name ILIKE $1
      ORDER BY s.created_at DESC
      LIMIT $2
    `;

    if (userId) {
      params.push(userId);
    }

    const result = await query(queryText, params);
    return result.rows;
  },

  // Update shop
  update: async (id, shopData) => {
    const { name, description, logo, isActive } = shopData;
    const result = await query(
      `UPDATE shops
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           logo = COALESCE($4, logo),
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name, description, logo, isActive]
    );
    return result.rows[0];
  },

  // Delete shop
  delete: async (id) => {
    const result = await query(
      'DELETE FROM shops WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  },

  // List all active shops
  listActive: async (limit = 50, offset = 0) => {
    const result = await query(
      `SELECT s.*, u.username as seller_username
       FROM shops s
       JOIN users u ON s.owner_id = u.id
       WHERE s.is_active = true
       ORDER BY s.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },

  // Update shop wallets
  updateWallets: async (id, walletData) => {
    const { wallet_btc, wallet_eth, wallet_usdt, wallet_ton } = walletData;
    const result = await query(
      `UPDATE shops
       SET wallet_btc = COALESCE($2, wallet_btc),
           wallet_eth = COALESCE($3, wallet_eth),
           wallet_usdt = COALESCE($4, wallet_usdt),
           wallet_ton = COALESCE($5, wallet_ton),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, wallet_btc, wallet_eth, wallet_usdt, wallet_ton]
    );
    return result.rows[0];
  }
};

/**
 * Product database queries
 */
export const productQueries = {
  // Create new product
  create: async (productData) => {
    const { shopId, name, description, price, currency, stockQuantity } = productData;
    const result = await query(
      `INSERT INTO products (shop_id, name, description, price, currency, stock_quantity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [shopId, name, description, price, currency, stockQuantity || 0]
    );
    return result.rows[0];
  },

  // Find product by ID
  findById: async (id) => {
    const result = await query(
      `SELECT p.*, s.name as shop_name, s.owner_id
       FROM products p
       JOIN shops s ON p.shop_id = s.id
       WHERE p.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // List products with filters
  list: async (filters = {}) => {
    const { shopId, isActive, limit = 50, offset = 0 } = filters;

    let queryText = `
      SELECT p.*, s.name as shop_name
      FROM products p
      JOIN shops s ON p.shop_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (shopId) {
      queryText += ` AND p.shop_id = $${paramCount}`;
      params.push(shopId);
      paramCount++;
    }


    if (isActive !== undefined) {
      queryText += ` AND p.is_active = $${paramCount}`;
      params.push(isActive);
      paramCount++;
    }

    queryText += ` ORDER BY p.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await query(queryText, params);
    return result.rows;
  },

  // Update product
  update: async (id, productData) => {
    const { name, description, price, stockQuantity, isActive } = productData;
    const result = await query(
      `UPDATE products
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           price = COALESCE($4, price),
           stock_quantity = COALESCE($5, stock_quantity),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name, description, price, stockQuantity, isActive]
    );
    return result.rows[0];
  },

  // Delete product
  delete: async (id) => {
    const result = await query(
      'DELETE FROM products WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  },

  // Update stock (with optional transaction client)
  updateStock: async (id, quantity, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `UPDATE products
       SET stock_quantity = stock_quantity + $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, quantity]
    );
    return result.rows[0];
  },

  // Bulk delete products by shop ID
  bulkDeleteByShopId: async (shopId) => {
    const result = await query(
      'DELETE FROM products WHERE shop_id = $1 RETURNING *',
      [shopId]
    );
    return result.rows;
  },

  // Bulk delete products by IDs (with ownership check via shopId)
  bulkDeleteByIds: async (productIds, shopId) => {
    const result = await query(
      `DELETE FROM products
       WHERE id = ANY($1) AND shop_id = $2
       RETURNING *`,
      [productIds, shopId]
    );
    return result.rows;
  }
};

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
  findById: async (id) => {
    const result = await query(
      `SELECT o.*,
              p.name as product_name,
              s.name as shop_name, s.owner_id,
              u.username as buyer_username, u.telegram_id as buyer_telegram_id
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
       JOIN users u ON o.buyer_id = u.id
       WHERE o.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // Find orders by buyer ID
  findByBuyerId: async (buyerId, limit = 50, offset = 0) => {
    const result = await query(
      `SELECT o.*, p.name as product_name, s.name as shop_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [buyerId, limit, offset]
    );
    return result.rows;
  },

  // Find orders by owner ID
  findByOwnerId: async (ownerId, limit = 50, offset = 0) => {
    const result = await query(
      `SELECT o.*,
              p.name as product_name,
              s.name as shop_name,
              u.username as buyer_username
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
       JOIN users u ON o.buyer_id = u.id
       WHERE s.owner_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [ownerId, limit, offset]
    );
    return result.rows;
  },

  // Update order status
  updateStatus: async (id, status) => {
    const result = await query(
      `UPDATE orders
       SET status = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    return result.rows[0];
  },

  // Update payment address
  updatePaymentAddress: async (id, paymentAddress) => {
    const result = await query(
      `UPDATE orders
       SET payment_address = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, paymentAddress]
    );
    return result.rows[0];
  }
};

/**
 * Payment database queries
 */
export const paymentQueries = {
  // Create payment record
  create: async (paymentData) => {
    const { orderId, txHash, amount, currency, status } = paymentData;
    const result = await query(
      `INSERT INTO payments (order_id, tx_hash, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [orderId, txHash, amount, currency, status]
    );
    return result.rows[0];
  },

  // Find payment by transaction hash
  findByTxHash: async (txHash) => {
    const result = await query(
      'SELECT * FROM payments WHERE tx_hash = $1',
      [txHash]
    );
    return result.rows[0];
  },

  // Find payments by order ID
  findByOrderId: async (orderId) => {
    const result = await query(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
      [orderId]
    );
    return result.rows;
  },

  // Update payment status
  updateStatus: async (id, status, confirmations = null) => {
    const result = await query(
      `UPDATE payments
       SET status = $2,
           confirmations = COALESCE($3, confirmations),
           verified_at = CASE WHEN $2 = 'confirmed' THEN NOW() ELSE verified_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, confirmations]
    );
    return result.rows[0];
  }
};

/**
 * Subscription database queries
 */
export const subscriptionQueries = {
  // Create subscription
  create: async (userId, shopId) => {
    try {
      const result = await query(
        `INSERT INTO subscriptions (user_id, shop_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, shop_id) DO NOTHING
         RETURNING *`,
        [userId, shopId]
      );
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        throw new Error('Already subscribed to this shop');
      }
      throw error;
    }
  },

  // Find subscriptions by user ID
  findByUserId: async (userId, limit = 50, offset = 0) => {
    const result = await query(
      `SELECT s.*, sh.name as shop_name, sh.description as shop_description,
              u.username as shop_owner_username
       FROM subscriptions s
       JOIN shops sh ON s.shop_id = sh.id
       JOIN users u ON sh.owner_id = u.id
       WHERE s.user_id = $1 AND sh.is_active = true
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  },

  // Find subscriptions by shop ID
  findByShopId: async (shopId, limit = 50, offset = 0) => {
    const result = await query(
      `SELECT s.*, u.username, u.first_name, u.last_name
       FROM subscriptions s
       JOIN users u ON s.user_id = u.id
       WHERE s.shop_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [shopId, limit, offset]
    );
    return result.rows;
  },

  // Check if subscription exists
  exists: async (userId, shopId) => {
    const result = await query(
      'SELECT EXISTS(SELECT 1 FROM subscriptions WHERE user_id = $1 AND shop_id = $2)',
      [userId, shopId]
    );
    return result.rows[0].exists;
  },

  // Delete subscription
  delete: async (userId, shopId) => {
    const result = await query(
      'DELETE FROM subscriptions WHERE user_id = $1 AND shop_id = $2 RETURNING *',
      [userId, shopId]
    );
    return result.rows[0];
  },

  // Count subscribers for a shop
  countByShopId: async (shopId) => {
    const result = await query(
      'SELECT COUNT(*) as count FROM subscriptions WHERE shop_id = $1',
      [shopId]
    );
    return parseInt(result.rows[0].count, 10);
  }
};

export default {
  userQueries,
  shopQueries,
  productQueries,
  orderQueries,
  paymentQueries,
  subscriptionQueries
};
