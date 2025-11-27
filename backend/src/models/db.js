import { query } from '../config/database.js';
import { workerQueries } from './workerQueries.js';
import { processedWebhookQueries } from './processedWebhookQueries.js';
import logger from '../utils/logger.js';

/**
 * User database queries
 */
export const userQueries = {
  // Find user by Telegram ID
  findByTelegramId: async (telegramId) => {
    const result = await query(
      'SELECT id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0];
  },

  // Find user by username (case-insensitive)
  findByUsername: async (username) => {
    if (!username) {
      return null;
    }

    const result = await query(
      `SELECT id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username]
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
  // BACKWARD COMPATIBLE: accepts both camelCase and snake_case
  create: async (userData) => {
    const telegramId = userData.telegram_id || userData.telegramId;
    const username = userData.username;
    const firstName = userData.first_name || userData.firstName;
    const lastName = userData.last_name || userData.lastName;

    const result = await query(
      `INSERT INTO users (telegram_id, username, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at`,
      [telegramId, username, firstName, lastName]
    );
    return result.rows[0];
  },

  // Update user
  // BACKWARD COMPATIBLE: accepts both camelCase and snake_case
  update: async (id, userData) => {
    const username = userData.username;
    const firstName = userData.first_name || userData.firstName;
    const lastName = userData.last_name || userData.lastName;

    const result = await query(
      `UPDATE users
       SET username = COALESCE($2, username),
           first_name = COALESCE($3, first_name),
           last_name = COALESCE($4, last_name),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at`,
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
  },
};

/**
 * Shop database queries
 */
export const shopQueries = {
  // Check if shop name is already taken (case-insensitive)
  isNameTaken: async (name, excludeShopId = null) => {
    let queryText = 'SELECT EXISTS(SELECT 1 FROM shops WHERE LOWER(name) = LOWER($1)';
    const params = [name];

    if (excludeShopId) {
      queryText += ' AND id != $2';
      params.push(excludeShopId);
    }

    queryText += ')';

    const result = await query(queryText, params);
    return result.rows[0].exists;
  },

  // Create new shop
  create: async (shopData) => {
    const { ownerId, name, description, logo, tier = 'basic' } = shopData;
    const result = await query(
      `INSERT INTO shops (owner_id, name, description, logo, tier)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, owner_id, name, description, logo, tier, is_active, subscription_status, next_payment_due, grace_period_until, registration_paid, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, created_at, updated_at`,
      [ownerId, name, description, logo, tier]
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
  // Only return active shops (is_active = true)
  // Inactive shops (expired subscription) should not be shown
  findByOwnerId: async (ownerId) => {
    const result = await query(
      'SELECT id, owner_id, name, description, logo, tier, is_active, subscription_status, next_payment_due, grace_period_until, registration_paid, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, created_at, updated_at FROM shops WHERE owner_id = $1 AND is_active = true ORDER BY created_at DESC',
      [ownerId]
    );
    return result.rows;
  },

  // Search active shops by name with optional subscription context
  searchByName: async (name, limit = 10, userId = null) => {
    const params = [`%${name}%`, limit];
    const paramIndex = params.length + 1;

    const queryText = `
      SELECT
        s.*,
        u.username as seller_username,
        u.first_name as seller_first_name,
        u.last_name as seller_last_name,
        ${
          userId
            ? `EXISTS(
          SELECT 1 FROM subscriptions sub
          WHERE sub.shop_id = s.id AND sub.user_id = $${paramIndex}
        )`
            : 'false'
        } as is_subscribed
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      WHERE s.is_active = true
        AND (s.name ILIKE $1 OR u.username ILIKE $1)
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
       RETURNING id, owner_id, name, description, logo, tier, is_active, subscription_status, next_payment_due, grace_period_until, registration_paid, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, created_at, updated_at`,
      [id, name, description, logo, isActive]
    );
    return result.rows[0];
  },

  // Delete shop
  delete: async (id) => {
    const result = await query('DELETE FROM shops WHERE id = $1 RETURNING id, owner_id, name', [
      id,
    ]);
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
    const allowedFields = ['wallet_btc', 'wallet_eth', 'wallet_usdt', 'wallet_ltc'];
    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(walletData, field)) {
        setClauses.push(`${field} = $${paramIndex}`);
        params.push(walletData[field]);
        paramIndex += 1;
      }
    });

    if (setClauses.length === 0) {
      // Nothing to update, return current record for consistency
      const existing = await query(
        `SELECT id, owner_id, name, description, logo, tier, is_active, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, created_at, updated_at
         FROM shops
         WHERE id = $1`,
        [id]
      );
      return existing.rows[0] || null;
    }

    setClauses.push('updated_at = NOW()');

    const result = await query(
      `UPDATE shops
       SET ${setClauses.join(', ')}
       WHERE id = $1
       RETURNING id, owner_id, name, description, logo, tier, is_active, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, created_at, updated_at`,
      params
    );
    return result.rows[0];
  },
};

/**
 * Product database queries
 */
export const productQueries = {
  // Create new product
  create: async (productData) => {
    const { shopId, name, description, price, currency, stockQuantity, isPreorder } = productData;
    const result = await query(
      `INSERT INTO products (shop_id, name, description, price, currency, stock_quantity, reserved_quantity, is_preorder)
       VALUES ($1, $2, $3, $4, $5, $6, 0, COALESCE($7, false))
       RETURNING id, shop_id, name, description, price, currency, stock_quantity, reserved_quantity, is_active, is_preorder, created_at, updated_at`,
      [shopId, name, description, price, currency, stockQuantity || 0, isPreorder]
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
    const {
      name,
      description,
      price,
      stockQuantity,
      isActive,
      discountPercentage,
      discountExpiresAt,
      originalPrice,
      isPreorder,
    } = productData;

    // Преобразовать undefined → null для корректной работы SQL
    const params = [
      id,
      name ?? null,
      description ?? null,
      price ?? null,
      stockQuantity ?? null,
      isActive ?? null,
      discountPercentage ?? null,
      originalPrice ?? null,
      discountExpiresAt ?? null,
      isPreorder ?? null,
    ];

    const result = await query(
      `UPDATE products
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           price = COALESCE(
             $4::NUMERIC,
             CASE
               WHEN $7::INTEGER = 0 AND original_price IS NOT NULL THEN original_price
               ELSE price
             END
           ),
           stock_quantity = COALESCE($5::INTEGER, stock_quantity),
           is_active = COALESCE($6::BOOLEAN, is_active),
           original_price = CASE
             WHEN $7::INTEGER = 0 THEN NULL
             WHEN $8::NUMERIC IS NOT NULL THEN $8
             ELSE original_price
           END,
           discount_percentage = COALESCE($7::INTEGER, discount_percentage),
           discount_expires_at = CASE
             WHEN $7::INTEGER = 0 THEN NULL
             WHEN $9::TIMESTAMP IS NOT NULL THEN $9
             ELSE discount_expires_at
           END,
           is_preorder = COALESCE($10::BOOLEAN, is_preorder),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, shop_id, name, description, price, currency, stock_quantity, original_price, discount_percentage, discount_expires_at, is_active, is_preorder, created_at, updated_at`,
      params
    );
    return result.rows[0];
  },

  // Delete product
  delete: async (id) => {
    const result = await query('DELETE FROM products WHERE id = $1 RETURNING id, shop_id, name', [
      id,
    ]);
    return result.rows[0];
  },

  // Count products by shop ID
  countByShopId: async (shopId) => {
    const result = await query('SELECT COUNT(*) AS count FROM products WHERE shop_id = $1', [
      shopId,
    ]);
    return parseInt(result.rows[0].count, 10) || 0;
  },

  // Update stock (with optional transaction client)
  updateStock: async (id, quantity, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `UPDATE products
       SET stock_quantity = stock_quantity + $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, shop_id, name, stock_quantity, reserved_quantity, is_active, updated_at`,
      [id, quantity]
    );
    return result.rows[0];
  },

  // Reserve stock (increase reserved_quantity)
  reserveStock: async (id, quantity, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `UPDATE products
       SET reserved_quantity = reserved_quantity + $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, stock_quantity, reserved_quantity`,
      [id, quantity]
    );
    return result.rows[0];
  },

  // Unreserve stock (decrease reserved_quantity)
  unreserveStock: async (id, quantity, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `UPDATE products
       SET reserved_quantity = GREATEST(reserved_quantity - $2, 0),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, stock_quantity, reserved_quantity`,
      [id, quantity]
    );
    return result.rows[0];
  },

  // Bulk delete products by shop ID
  bulkDeleteByShopId: async (shopId) => {
    const result = await query(
      'DELETE FROM products WHERE shop_id = $1 RETURNING id, shop_id, name',
      [shopId]
    );
    return result.rows;
  },

  // Bulk delete products by IDs (with ownership check via shopId)
  bulkDeleteByIds: async (productIds, shopId) => {
    const result = await query(
      `DELETE FROM products
       WHERE id = ANY($1) AND shop_id = $2
       RETURNING id, shop_id, name`,
      [productIds, shopId]
    );
    return result.rows;
  },

  // Apply bulk discount to all active products in a shop
  // Optional client parameter for transaction support with row-level locks
  applyBulkDiscount: async (shopId, discountData, client = null) => {
    const { percentage, type, duration, excludedProductIds = [] } = discountData;

    try {
      // Calculate discount_expires_at if type is "timer"
      let expiresAt = null;
      if (type === 'timer' && duration) {
        const now = new Date();
        expiresAt = new Date(now.getTime() + duration); // duration in milliseconds
      }

      // Build WHERE clause with excluded products
      let whereClause = 'shop_id = $3 AND is_active = true';
      const params = [percentage, expiresAt, shopId];

      if (excludedProductIds.length > 0) {
        // Add NOT IN clause for excluded products
        const placeholders = excludedProductIds.map((_, i) => `$${4 + i}`).join(', ');
        whereClause += ` AND id NOT IN (${placeholders})`;
        params.push(...excludedProductIds);
      }

      // Use client.query if transaction client provided, otherwise use pool query
      const queryFn = client ? client.query.bind(client) : query;

      // SELECT FOR UPDATE to lock rows before update (only when using transaction)
      if (client) {
        await queryFn(
          `SELECT id FROM products WHERE ${whereClause} FOR UPDATE`,
          params.slice(2) // Skip percentage and expiresAt params
        );
      }

      // Apply discount to matching products
      const result = await queryFn(
        `UPDATE products
         SET
           discount_percentage = $1::DECIMAL,
           original_price = CASE
             WHEN discount_percentage = 0 THEN price
             ELSE COALESCE(original_price, price)
           END,
           price = CASE
             WHEN discount_percentage = 0 THEN price * (1 - $1::DECIMAL/100)
             ELSE COALESCE(original_price, price) * (1 - $1::DECIMAL/100)
           END,
           discount_expires_at = $2,
           updated_at = NOW()
         WHERE ${whereClause}
         RETURNING *`,
        params
      );

      return {
        success: true,
        productsUpdated: result.rows.length,
        productsExcluded: excludedProductIds.length,
        updatedProducts: result.rows,
      };
    } catch (error) {
      logger.error('[DB] applyBulkDiscount error', {
        shopId,
        percentage,
        excludedCount: excludedProductIds.length,
        excludedIds: excludedProductIds,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },

  // Remove bulk discount from all products in a shop
  // Optional client parameter for transaction support with row-level locks
  removeBulkDiscount: async (shopId, client = null) => {
    // Use client.query if transaction client provided, otherwise use pool query
    const queryFn = client ? client.query.bind(client) : query;

    // SELECT FOR UPDATE to lock rows before update (only when using transaction)
    if (client) {
      await queryFn(
        `SELECT id FROM products WHERE shop_id = $1 AND discount_percentage > 0 FOR UPDATE`,
        [shopId]
      );
    }

    // Remove discount and restore original_price
    const result = await queryFn(
      `UPDATE products
       SET
         discount_percentage = 0,
         price = COALESCE(original_price, price),
         original_price = NULL,
         discount_expires_at = NULL,
         updated_at = NOW()
       WHERE shop_id = $1 AND discount_percentage > 0
       RETURNING *`,
      [shopId]
    );

    return result.rows;
  },
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
  // P0-DB-3 FIX: Enforce MAX_LIMIT
  findByBuyerId: async (buyerId, limit = 50, offset = 0) => {
    const MAX_LIMIT = 1000;
    const safeLimit = Math.min(limit, MAX_LIMIT);

    const result = await query(
      `SELECT o.*, p.name as product_name, s.name as shop_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
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
  },

  // Optimized query for invoice generation - replaces 4 queries with 1
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
       JOIN products p ON o.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
       WHERE o.id = $1`,
      [orderId]
    );
    return result.rows[0];
  },
};

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

  // Get order items with product stock info (for payment verification)
  findByOrderIdWithStock: async (orderId, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;

    const result = await queryFn(
      `SELECT 
         oi.id as item_id,
         oi.product_id,
         oi.quantity as ordered_quantity,
         oi.price as price_at_purchase,
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

/**
 * Payment database queries
 */
export const paymentQueries = {
  // Create payment record
  create: async (paymentData, client = null) => {
    const { orderId, txHash, amount, currency, status } = paymentData;
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `INSERT INTO payments (order_id, tx_hash, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tx_hash) DO UPDATE
       SET status = CASE
         WHEN payments.status = 'pending' AND EXCLUDED.status = 'confirmed' THEN 'confirmed'
         WHEN payments.status = 'failed' AND EXCLUDED.status IN ('pending', 'confirmed') THEN EXCLUDED.status
         ELSE payments.status
       END,
       updated_at = NOW()
       RETURNING *`,
      [orderId, txHash, amount, currency, status]
    );
    return result.rows[0];
  },

  // Find payment by transaction hash
  findByTxHash: async (txHash) => {
    const result = await query('SELECT * FROM payments WHERE tx_hash = $1', [txHash]);
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
       SET status = $2::VARCHAR,
           confirmations = COALESCE($3::INT, confirmations),
           verified_at = CASE WHEN $2 = 'confirmed' THEN NOW() ELSE verified_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, confirmations]
    );
    return result.rows[0];
  },
};

/**
 * Invoice database queries (HD wallet address-per-payment with BIP44 derivation)
 */
export const invoiceQueries = {
  // Create invoice with generated address
  create: async (invoiceData) => {
    const {
      orderId,
      chain,
      address,
      addressIndex,
      expectedAmount,
      currency,
      webhookSubscriptionId,
      expiresAt,
    } = invoiceData;
    const result = await query(
      `INSERT INTO invoices (order_id, chain, address, address_index, expected_amount, currency, tatum_subscription_id, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [
        orderId,
        chain,
        address,
        addressIndex,
        expectedAmount,
        currency,
        webhookSubscriptionId,
        expiresAt,
      ]
    );
    return result.rows[0];
  },

  // Find invoice by payment address
  findByAddress: async (address) => {
    const result = await query('SELECT * FROM invoices WHERE address = $1', [address]);
    return result.rows[0];
  },

  // Find invoice by order ID
  findByOrderId: async (orderId) => {
    const result = await query(
      'SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    );
    return result.rows[0];
  },

  // Get next address index for chain
  // ✅ FIX: Use PostgreSQL SEQUENCE for atomic, race-condition-free index generation
  getNextIndex: async (chain) => {
    // Map chain to sequence name (e.g., BTC -> wallet_address_index_btc)
    const sequenceName = `wallet_address_index_${chain.toLowerCase()}`;

    try {
      const result = await query(`SELECT nextval($1::regclass) as next_index`, [sequenceName]);
      // Convert to integer (PostgreSQL returns bigint as string)
      return parseInt(result.rows[0].next_index, 10);
    } catch (error) {
      logger.error('[DB] getNextIndex error', {
        chain,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to get next index for ${chain}: ${error.message}`);
    }
  },

  // Update invoice status
  updateStatus: async (id, status, txHash = null) => {
    const result = await query(
      `UPDATE invoices
       SET status = $2,
           paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END,
           tx_hash = COALESCE($3, tx_hash),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, txHash]
    );
    return result.rows[0];
  },

  // Find expired invoices (for cleanup)
  findExpired: async () => {
    const result = await query(
      `SELECT * FROM invoices
       WHERE status = 'pending'
       AND expires_at < NOW()`,
      []
    );
    return result.rows;
  },

  // Find pending invoices by chains (for polling service)
  findPendingByChains: async (chains) => {
    const result = await query(
      `SELECT * FROM invoices
       WHERE status = 'pending'
       AND chain = ANY($1)
       AND expires_at > NOW()
       ORDER BY created_at ASC`,
      [chains]
    );
    return result.rows;
  },
};

/**
 * Subscription database queries
 */
export const subscriptionQueries = {
  // Create subscription
  create: async (userId, shopId, telegramId = null) => {
    try {
      const result = await query(
        `INSERT INTO subscriptions (user_id, shop_id, telegram_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, shop_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
         RETURNING *`,
        [userId, shopId, telegramId]
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

  // Find subscription by user and shop (for check endpoint)
  findByUserAndShop: async (userId, shopId) => {
    const result = await query(
      `SELECT s.*, sh.name as shop_name, sh.description as shop_description,
              u.username as shop_owner_username
       FROM subscriptions s
       JOIN shops sh ON s.shop_id = sh.id
       JOIN users u ON sh.owner_id = u.id
       WHERE s.user_id = $1 AND s.shop_id = $2 AND sh.is_active = true
       LIMIT 1`,
      [userId, shopId]
    );
    return result.rows[0] || null;
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
    const result = await query('SELECT COUNT(*) as count FROM subscriptions WHERE shop_id = $1', [
      shopId,
    ]);
    return parseInt(result.rows[0].count, 10);
  },
};

export { workerQueries, processedWebhookQueries };

export default {
  userQueries,
  shopQueries,
  productQueries,
  orderQueries,
  paymentQueries,
  subscriptionQueries,
  invoiceQueries,
  workerQueries,
  processedWebhookQueries,
};
