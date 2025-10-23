import { query } from '../config/database.js';

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
   * @returns {Promise<Object|undefined>} Synced product record
   */
  findBySyncedProductId: async (syncedProductId) => {
    const result = await query(
      `SELECT sp.*, sf.markup_percentage, sf.mode
       FROM synced_products sp
       JOIN shop_follows sf ON sp.follow_id = sf.id
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
   * @returns {Promise<Array>} Array of synced products with details
   */
  findByFollowId: async (followId) => {
    const result = await query(
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
      [followId]
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
    const result = await query(
      'DELETE FROM synced_products WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Delete all synced products for a follow relationship
   * Called when follow is deleted
   * @param {number} followId - Follow relationship ID
   * @returns {Promise<number>} Number of deleted records
   */
  deleteByFollowId: async (followId) => {
    const result = await query(
      'DELETE FROM synced_products WHERE follow_id = $1 RETURNING id',
      [followId]
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
        sf.follower_shop_id,
        sf.markup_percentage,
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
         AND sp.conflict_status = 'synced'
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
        sf.markup_percentage,
        ROUND(p_source.price * (1 + sf.markup_percentage / 100), 2) as expected_price
       FROM synced_products sp
       JOIN shop_follows sf ON sp.follow_id = sf.id
       JOIN products p_source ON sp.source_product_id = p_source.id
       JOIN products p_synced ON sp.synced_product_id = p_synced.id
       WHERE sp.synced_product_id = $1`,
      [syncedProductId]
    );
    
    if (result.rows.length === 0) return false;
    
    const { synced_price, expected_price } = result.rows[0];
    // Compare with small epsilon for floating point precision
    return Math.abs(parseFloat(synced_price) - parseFloat(expected_price)) > 0.01;
  }
};
