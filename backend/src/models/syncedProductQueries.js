import { query } from '../config/database.js';

/**
 * Helper to execute query with optional transaction client
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {Object} client - Optional transaction client (from getClient())
 * @returns {Promise<Object>} Query result
 */
const execQuery = async (sql, params, client = null) => {
  if (client) {
    return client.query(sql, params);
  }
  return query(sql, params);
};

/**
 * Synced Product database queries
 * Tracks synced products between follower and source shops
 */
export const syncedProductQueries = {
  /**
   * Create a synced product record
   * @param {Object} syncData - { followId, syncedProductId, sourceProductId }
   * @returns {Promise<Object>} Created synced product record
   */
  create: async (syncData) => {
    const { followId, syncedProductId, sourceProductId } = syncData;

    const result = await query(
      `INSERT INTO synced_products (follow_id, synced_product_id, source_product_id, last_synced_at, conflict_status)
       VALUES ($1, $2, $3, NOW(), 'synced')
       RETURNING *`,
      [followId, syncedProductId, sourceProductId]
    );
    return result.rows[0];
  },

  /**
   * Find synced product by ID
   * @param {number} id - Synced product record ID
   * @returns {Promise<Object|undefined>} Synced product record
   */
  findById: async (id) => {
    const result = await query(
      `SELECT 
        sp.*,
        p_synced.name as synced_product_name,
        p_synced.price as synced_product_price,
        p_synced.stock_quantity as synced_product_stock,
        p_source.name as source_product_name,
        p_source.price as source_product_price,
        p_source.stock_quantity as source_product_stock
       FROM synced_products sp
       JOIN products p_synced ON sp.synced_product_id = p_synced.id
       JOIN products p_source ON sp.source_product_id = p_source.id
       WHERE sp.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Find synced product by synced product ID
   * @param {number} syncedProductId - The product ID in follower shop
   * @returns {Promise<Object|undefined>} Synced product record with source_shop_id
   */
  findBySyncedProductId: async (syncedProductId) => {
    const result = await query(
      `SELECT sp.*, sf.markup_percentage, sf.mode, sf.source_shop_id
       FROM synced_products sp
       JOIN shop_follows sf ON sp.follow_id = sf.id
       WHERE sp.synced_product_id = $1`,
      [syncedProductId]
    );
    return result.rows[0];
  },

  /**
   * Find synced product with source shop and owner info (for notifications)
   * @param {number} syncedProductId - The product ID in follower shop
   * @returns {Promise<Object|undefined>} Synced product with source shop name and owner username
   */
  findWithSourceInfo: async (syncedProductId) => {
    const result = await query(
      `SELECT sp.*,
              sf.mode,
              sf.source_shop_id,
              s.name as source_shop_name,
              u.username as source_owner_username,
              u.telegram_id as source_owner_telegram_id
       FROM synced_products sp
       JOIN shop_follows sf ON sp.follow_id = sf.id
       JOIN shops s ON sf.source_shop_id = s.id
       JOIN users u ON s.owner_id = u.id
       WHERE sp.synced_product_id = $1`,
      [syncedProductId]
    );
    return result.rows[0];
  },

  /**
   * Find synced product by source product ID and follow ID
   * @param {number} sourceProductId - Source product ID
   * @param {number} followId - Follow relationship ID
   * @returns {Promise<Object|undefined>} Synced product record
   */
  findBySourceAndFollow: async (sourceProductId, followId) => {
    const result = await query(
      'SELECT * FROM synced_products WHERE source_product_id = $1 AND follow_id = $2',
      [sourceProductId, followId]
    );
    return result.rows[0];
  },

  /**
   * Find all synced products for a follow relationship
   * @param {number} followId - Follow relationship ID
   * @param {Object} client - Optional transaction client
   * @returns {Promise<Array>} Array of synced products with details
   */
  findByFollowId: async (followId, client = null) => {
    const result = await execQuery(
      `SELECT
        sp.*,
        p_synced.name as synced_product_name,
        p_synced.price as synced_product_price,
        p_synced.stock_quantity as synced_product_stock,
        p_synced.is_active as synced_product_active,
        p_source.name as source_product_name,
        p_source.price as source_product_price,
        p_source.stock_quantity as source_product_stock,
        p_source.is_active as source_product_active
       FROM synced_products sp
       JOIN products p_synced ON sp.synced_product_id = p_synced.id
       JOIN products p_source ON sp.source_product_id = p_source.id
       WHERE sp.follow_id = $1
       ORDER BY sp.created_at DESC`,
      [followId],
      client
    );
    return result.rows;
  },

  // Find synced products with pagination support (includes custom markup)
  findByFollowIdPaginated: async (followId, limit = 50, offset = 0) => {
    const result = await query(
      `SELECT
        sp.*,
        sp.custom_markup_type,
        sp.custom_markup_percentage,
        sp.custom_markup_fixed,
        p_synced.name as synced_product_name,
        p_synced.price as synced_product_price,
        p_synced.stock_quantity as synced_product_stock,
        p_synced.is_active as synced_product_active,
        p_synced.is_preorder as synced_product_preorder,
        p_source.name as source_product_name,
        p_source.price as source_product_price,
        p_source.stock_quantity as source_product_stock,
        p_source.is_active as source_product_active,
        p_source.is_preorder as source_product_preorder,
        COUNT(*) OVER() as total_count
       FROM synced_products sp
       JOIN products p_synced ON sp.synced_product_id = p_synced.id
       JOIN products p_source ON sp.source_product_id = p_source.id
       WHERE sp.follow_id = $1
         AND p_source.is_active = true
         AND p_synced.is_active = true
       ORDER BY sp.created_at DESC
       LIMIT $2 OFFSET $3`,
      [followId, limit, offset]
    );
    return result.rows;
  },

  /**
   * Find all synced products derived from a source product
   * Used when source product is updated to sync to all followers
   * @param {number} sourceProductId - Source product ID
   * @returns {Promise<Array>} Array of synced products
   */
  findBySourceProductId: async (sourceProductId) => {
    const result = await query(
      `SELECT 
        sp.*,
        sf.follower_shop_id,
        sf.markup_percentage,
        sf.mode,
        sf.status as follow_status
       FROM synced_products sp
       JOIN shop_follows sf ON sp.follow_id = sf.id
       WHERE sp.source_product_id = $1 
         AND sf.mode = 'resell' 
         AND sf.status = 'active'
       ORDER BY sp.created_at`,
      [sourceProductId]
    );
    return result.rows;
  },

  /**
   * Update last synced timestamp
   * @param {number} id - Synced product record ID
   * @returns {Promise<Object>} Updated record
   */
  updateLastSynced: async (id) => {
    const result = await query(
      `UPDATE synced_products
       SET last_synced_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Update conflict status
   * @param {number} id - Synced product record ID
   * @param {string} conflictStatus - New status ('synced', 'conflict', 'manual_override')
   * @returns {Promise<Object>} Updated record
   */
  updateConflictStatus: async (id, conflictStatus) => {
    const result = await query(
      `UPDATE synced_products
       SET conflict_status = $2
       WHERE id = $1
       RETURNING *`,
      [id, conflictStatus]
    );
    return result.rows[0];
  },

  /**
   * Delete synced product record
   * @param {number} id - Synced product record ID
   * @returns {Promise<Object>} Deleted record
   */
  delete: async (id) => {
    const result = await query('DELETE FROM synced_products WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  /**
   * Delete all synced products for a follow relationship
   * Called when follow is deleted
   * @param {number} followId - Follow relationship ID
   * @param {Object} client - Optional transaction client
   * @returns {Promise<number>} Number of deleted records
   */
  deleteByFollowId: async (followId, client = null) => {
    const result = await execQuery(
      'DELETE FROM synced_products WHERE follow_id = $1 RETURNING id',
      [followId],
      client
    );
    return result.rows.length;
  },

  /**
   * Delete synced product records by source product ID
   * @param {number} sourceProductId - Source product ID
   * @returns {Promise<number>} Number of deleted records
   */
  deleteBySourceProductId: async (sourceProductId) => {
    const result = await query(
      'DELETE FROM synced_products WHERE source_product_id = $1 RETURNING id',
      [sourceProductId]
    );
    return result.rows.length;
  },

  /**
   * Delete synced product by synced product ID
   * Called when follower manually deletes their synced product
   * @param {number} syncedProductId - Synced product ID
   * @returns {Promise<Object>} Deleted record
   */
  deleteBySyncedProductId: async (syncedProductId) => {
    const result = await query(
      'DELETE FROM synced_products WHERE synced_product_id = $1 RETURNING *',
      [syncedProductId]
    );
    return result.rows[0];
  },

  /**
   * Find products that need sync (stale or conflict)
   * @param {number} staleMinutes - Minutes since last sync to consider stale
   * @returns {Promise<Array>} Array of synced products needing update
   */
  findStaleProducts: async (staleMinutes = 5) => {
    const result = await query(
      `SELECT 
        sp.*,
        sp.conflict_status,
        sp.custom_markup_type,
        sp.custom_markup_percentage,
        sp.custom_markup_fixed,
        sf.follower_shop_id,
        sf.markup_percentage,
        sf.markup_type,
        sf.markup_fixed,
        sf.mode,
        p_source.price as source_price,
        p_source.stock_quantity as source_stock,
        p_source.is_active as source_active,
        p_synced.price as synced_price,
        p_synced.stock_quantity as synced_stock,
        p_synced.is_active as synced_active
       FROM synced_products sp
       JOIN shop_follows sf ON sp.follow_id = sf.id
       JOIN products p_source ON sp.source_product_id = p_source.id
       JOIN products p_synced ON sp.synced_product_id = p_synced.id
       WHERE sf.mode = 'resell' 
         AND sf.status = 'active'
         AND sp.conflict_status IN ('synced', 'conflict')
         AND sp.last_synced_at < NOW() - INTERVAL '${staleMinutes} minutes'
       ORDER BY sp.last_synced_at ASC
       LIMIT 100`,
      []
    );
    return result.rows;
  },

  /**
   * Count synced products by follow ID
   * @param {number} followId - Follow relationship ID
   * @returns {Promise<number>} Count of synced products
   */
  countByFollowId: async (followId) => {
    const result = await query(
      'SELECT COUNT(*) as count FROM synced_products WHERE follow_id = $1',
      [followId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  /**
   * Count synced products with conflicts by follow ID
   * @param {number} followId - Follow relationship ID
   * @returns {Promise<number>} Count of products with conflicts
   */
  countConflictsByFollowId: async (followId) => {
    const result = await query(
      `SELECT COUNT(*) as count FROM synced_products 
       WHERE follow_id = $1 AND conflict_status IN ('conflict', 'manual_override')`,
      [followId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  /**
   * Update custom markup for a specific synced product
   * @param {number} id - Synced product record ID
   * @param {string} markupType - 'percentage' or 'fixed'
   * @param {number} markupPercentage - Percentage markup (0-500)
   * @param {number} markupFixed - Fixed markup amount (0-10000)
   * @returns {Promise<Object>} Updated record
   */
  updateCustomMarkup: async (id, markupType, markupPercentage, markupFixed) => {
    const result = await query(
      `UPDATE synced_products
       SET custom_markup_type = $2,
           custom_markup_percentage = $3,
           custom_markup_fixed = $4
       WHERE id = $1
       RETURNING *`,
      [id, markupType, markupPercentage, markupFixed]
    );
    return result.rows[0];
  },

  /**
   * Reset custom markup to use global follow markup
   * @param {number} id - Synced product record ID
   * @returns {Promise<Object>} Updated record
   */
  resetCustomMarkup: async (id) => {
    const result = await query(
      `UPDATE synced_products
       SET custom_markup_type = NULL,
           custom_markup_percentage = NULL,
           custom_markup_fixed = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Find synced product by follow ID and synced product ID
   * @param {number} followId - Follow relationship ID
   * @param {number} syncedProductId - Synced product ID
   * @returns {Promise<Object|undefined>} Synced product record
   */
  findByFollowAndSyncedProduct: async (followId, syncedProductId) => {
    const result = await query(
      `SELECT sp.*,
              p_synced.name as synced_product_name,
              p_synced.price as synced_product_price
       FROM synced_products sp
       JOIN products p_synced ON sp.synced_product_id = p_synced.id
       WHERE sp.follow_id = $1 AND sp.synced_product_id = $2`,
      [followId, syncedProductId]
    );
    return result.rows[0];
  },

  /**
   * Detect if synced product has manual edits (potential conflict)
   * Compares synced product with expected values based on source + markup
   * @param {number} syncedProductId - Synced product ID
   * @returns {Promise<boolean>} True if manual edits detected
   */
  hasManualEdits: async (syncedProductId) => {
    const result = await query(
      `SELECT 
        p_synced.price as synced_price,
        p_source.price as source_price,
        sp.custom_markup_type,
        sp.custom_markup_percentage,
        sp.custom_markup_fixed,
        sf.markup_type,
        sf.markup_percentage,
        sf.markup_fixed,
        CASE
          WHEN sp.custom_markup_type = 'fixed' THEN
            ROUND(p_source.price + COALESCE(sp.custom_markup_fixed, 0), 2)
          WHEN sp.custom_markup_type = 'percentage' THEN
            ROUND(p_source.price * (1 + COALESCE(sp.custom_markup_percentage, 0) / 100), 2)
          WHEN sf.markup_type = 'fixed' THEN
            ROUND(p_source.price + COALESCE(sf.markup_fixed, 0), 2)
          ELSE
            ROUND(p_source.price * (1 + COALESCE(sf.markup_percentage, 0) / 100), 2)
        END as expected_price
       FROM synced_products sp
       JOIN shop_follows sf ON sp.follow_id = sf.id
       JOIN products p_source ON sp.source_product_id = p_source.id
       JOIN products p_synced ON sp.synced_product_id = p_synced.id
       WHERE sp.synced_product_id = $1`,
      [syncedProductId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const { synced_price, expected_price } = result.rows[0];
    // Compare with small epsilon for floating point precision
    return Math.abs(parseFloat(synced_price) - parseFloat(expected_price)) > 0.01;
  },
};
