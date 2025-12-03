import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Product database queries
 */
export const productQueries = {
  // Create new product
  create: async (productData) => {
    const shopId = productData.shopId ?? productData.shop_id;
    const stockQuantity =
      productData.stockQuantity ?? productData.stock ?? productData.stock_quantity ?? 0;
    const currency = productData.currency ?? 'USD';
    const { name, description, price, isPreorder } = productData;

    if (!shopId) {
      throw new Error('shopId is required to create a product');
    }

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
      `SELECT p.*,
              s.name as shop_name,
              s.owner_id,
              CASE WHEN sp.id IS NOT NULL THEN true ELSE false END AS is_synced,
              source_shop.name as source_shop_name
       FROM products p
       JOIN shops s ON p.shop_id = s.id
       LEFT JOIN synced_products sp ON sp.synced_product_id = p.id
       LEFT JOIN shop_follows sf ON sf.id = sp.follow_id
       LEFT JOIN shops source_shop ON source_shop.id = sf.source_shop_id
       WHERE p.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // List products with filters
  list: async (filters = {}) => {
    const { shopId, isActive, limit = 50, offset = 0 } = filters;

    let queryText = `
      SELECT p.*,
             s.name as shop_name,
             CASE WHEN sp.id IS NOT NULL THEN true ELSE false END AS is_synced,
             source_shop.name as source_shop_name
      FROM products p
      JOIN shops s ON p.shop_id = s.id
      LEFT JOIN synced_products sp ON sp.synced_product_id = p.id
      LEFT JOIN shop_follows sf ON sf.id = sp.follow_id
      LEFT JOIN shops source_shop ON source_shop.id = sf.source_shop_id
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
       RETURNING id, shop_id, name, description, price, currency, stock_quantity, reserved_quantity, original_price, discount_percentage, discount_expires_at, is_active, is_preorder, created_at, updated_at`,
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
  // SECURITY FIX: Added stock availability check to prevent overselling
  reserveStock: async (id, quantity, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `UPDATE products
       SET reserved_quantity = reserved_quantity + $2,
           updated_at = NOW()
       WHERE id = $1
         AND stock_quantity >= reserved_quantity + $2
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

  // Bulk delete products by shop ID (excludes synced products)
  bulkDeleteByShopId: async (shopId) => {
    const result = await query(
      `DELETE FROM products p
       WHERE p.shop_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM synced_products sp WHERE sp.synced_product_id = p.id
         )
       RETURNING id, shop_id, name`,
      [shopId]
    );
    return result.rows;
  },

  // Bulk delete products by IDs (with ownership check via shopId, excludes synced products)
  bulkDeleteByIds: async (productIds, shopId) => {
    const result = await query(
      `DELETE FROM products p
       WHERE p.id = ANY($1) AND p.shop_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM synced_products sp WHERE sp.synced_product_id = p.id
         )
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

  /**
   * Search products across multiple shops by name
   * @param {string} searchQuery - Search term (ILIKE pattern)
   * @param {number[]} shopIds - Array of shop IDs to search in
   * @param {number} limit - Maximum results (default 20)
   * @returns {Promise<Array>} Products with shop info
   */
  searchAcrossShops: async (searchQuery, shopIds, limit = 20) => {
    if (!shopIds || shopIds.length === 0) {
      return [];
    }

    const result = await query(
      `SELECT p.*,
              s.name as shop_name,
              s.id as shop_id,
              s.logo as shop_logo
       FROM products p
       JOIN shops s ON p.shop_id = s.id
       WHERE p.shop_id = ANY($1)
         AND p.is_active = true
         AND s.is_active = true
         AND p.name ILIKE $2
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [shopIds, `%${searchQuery}%`, limit]
    );
    return result.rows;
  },
};

export default productQueries;
