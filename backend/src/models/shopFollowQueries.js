import { query } from '../config/database.js';

/**
 * Shop Follow database queries
 * Handles follower → source shop relationships for dropshipping/reseller functionality
 */
export const shopFollowQueries = {
  /**
   * Create a new follow relationship
   * @param {Object} followData - { followerShopId, sourceShopId, mode, markupPercentage }
   * @returns {Promise<Object>} Created follow record
   */
  create: async (followData) => {
    const { followerShopId, sourceShopId, mode, markupPercentage = 0 } = followData;
    
    const result = await query(
      `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING *`,
      [followerShopId, sourceShopId, mode, markupPercentage]
    );
    return result.rows[0];
  },

  /**
   * Find follow by ID
   * @param {number} id - Follow ID
   * @returns {Promise<Object|undefined>} Follow record with shop details
   */
  findById: async (id) => {
    const result = await query(
      `SELECT 
        sf.*,
        fs.name as follower_shop_name,
        fs.owner_id as follower_owner_id,
        ss.name as source_shop_name,
        ss.owner_id as source_owner_id,
        u.username as source_username,
        (
          SELECT COUNT(*) 
          FROM synced_products sp 
          WHERE sp.follow_id = sf.id
        ) as synced_products_count
       FROM shop_follows sf
       JOIN shops fs ON sf.follower_shop_id = fs.id
       JOIN shops ss ON sf.source_shop_id = ss.id
       LEFT JOIN users u ON ss.owner_id = u.id
       WHERE sf.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Find all follows for a follower shop
   * @param {number} followerShopId - Follower shop ID
   * @param {string} status - Filter by status ('active', 'paused', 'cancelled') or null for all
   * @returns {Promise<Array>} Array of follow records
   */
  findByFollowerShopId: async (followerShopId, status = null) => {
    let queryText = `
      SELECT 
        sf.*,
        ss.name as source_shop_name,
        ss.owner_id as source_owner_id,
        u.username as source_username,
        (SELECT COUNT(*) FROM synced_products sp WHERE sp.follow_id = sf.id) as synced_products_count
      FROM shop_follows sf
      JOIN shops ss ON sf.source_shop_id = ss.id
      JOIN users u ON ss.owner_id = u.id
      WHERE sf.follower_shop_id = $1
    `;
    
    const params = [followerShopId];
    
    if (status) {
      queryText += ' AND sf.status = $2';
      params.push(status);
    }
    
    queryText += ' ORDER BY sf.created_at DESC';
    
    const result = await query(queryText, params);
    return result.rows;
  },

  /**
   * Find all shops following a source shop
   * @param {number} sourceShopId - Source shop ID
   * @param {string} status - Filter by status or null for all
   * @returns {Promise<Array>} Array of follower shops
   */
  findBySourceShopId: async (sourceShopId, status = null) => {
    let queryText = `
      SELECT 
        sf.*,
        fs.name as follower_shop_name,
        fs.owner_id as follower_owner_id,
        u.username as follower_username
      FROM shop_follows sf
      JOIN shops fs ON sf.follower_shop_id = fs.id
      JOIN users u ON fs.owner_id = u.id
      WHERE sf.source_shop_id = $1
    `;
    
    const params = [sourceShopId];
    
    if (status) {
      queryText += ' AND sf.status = $2';
      params.push(status);
    }
    
    queryText += ' ORDER BY sf.created_at DESC';
    
    const result = await query(queryText, params);
    return result.rows;
  },

  /**
   * Check if follow relationship exists
   * @param {number} followerShopId - Follower shop ID
   * @param {number} sourceShopId - Source shop ID
   * @returns {Promise<Object|undefined>} Existing follow or undefined
   */
  findByRelationship: async (followerShopId, sourceShopId) => {
    const result = await query(
      `SELECT * FROM shop_follows 
       WHERE follower_shop_id = $1 AND source_shop_id = $2`,
      [followerShopId, sourceShopId]
    );
    return result.rows[0];
  },

  /**
   * Count active follows for a follower shop (for FREE tier limit check)
   * @param {number} followerShopId - Follower shop ID
   * @returns {Promise<number>} Count of active follows
   */
  countActiveByFollowerShopId: async (followerShopId) => {
    const result = await query(
      `SELECT COUNT(*) as count FROM shop_follows 
       WHERE follower_shop_id = $1 AND status = 'active'`,
      [followerShopId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  /**
   * Update follow mode
   * @param {number} id - Follow ID
   * @param {string} mode - New mode ('monitor' or 'resell')
   * @returns {Promise<Object>} Updated follow record
   */
  updateMode: async (id, mode) => {
    const result = await query(
      `UPDATE shop_follows
       SET mode = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, mode]
    );
    return result.rows[0];
  },

  /**
   * Update markup percentage
   * @param {number} id - Follow ID
   * @param {number} markupPercentage - New markup (1-500)
   * @returns {Promise<Object>} Updated follow record
   */
  updateMarkup: async (id, markupPercentage) => {
    const result = await query(
      `UPDATE shop_follows
       SET markup_percentage = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, markupPercentage]
    );
    return result.rows[0];
  },

  /**
   * Update follow status
   * @param {number} id - Follow ID
   * @param {string} status - New status ('active', 'paused', 'cancelled')
   * @returns {Promise<Object>} Updated follow record
   */
  updateStatus: async (id, status) => {
    const result = await query(
      `UPDATE shop_follows
       SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    return result.rows[0];
  },

  /**
   * Delete follow (also cascades to synced_products)
   * @param {number} id - Follow ID
   * @returns {Promise<Object>} Deleted follow record
   */
  delete: async (id) => {
    const result = await query(
      'DELETE FROM shop_follows WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Check for circular follows (A→B→C→A)
   * Uses recursive CTE to detect cycles
   * @param {number} followerShopId - Shop that wants to follow
   * @param {number} sourceShopId - Shop to be followed
   * @returns {Promise<boolean>} True if would create a cycle
   */
  checkCircularFollow: async (followerShopId, sourceShopId) => {
    const result = await query(
      `WITH RECURSIVE follow_chain AS (
        -- Base case: direct follows from source shop
        SELECT source_shop_id as shop_id, follower_shop_id, 1 as depth
        FROM shop_follows
        WHERE follower_shop_id = $2 AND status = 'active'
        
        UNION ALL
        
        -- Recursive case: follow the chain
        SELECT sf.source_shop_id, sf.follower_shop_id, fc.depth + 1
        FROM shop_follows sf
        JOIN follow_chain fc ON sf.follower_shop_id = fc.shop_id
        WHERE sf.status = 'active' AND fc.depth < 10
      )
      SELECT EXISTS(
        SELECT 1 FROM follow_chain WHERE shop_id = $1
      ) as has_cycle`,
      [followerShopId, sourceShopId]
    );
    return result.rows[0].has_cycle;
  },

  /**
   * Get all active resell-mode follows for a source shop
   * Used by sync service to find shops that need updates
   * @param {number} sourceShopId - Source shop ID
   * @returns {Promise<Array>} Array of active resell follows
   */
  findActiveResellFollowers: async (sourceShopId) => {
    const result = await query(
      `SELECT sf.*, fs.name as follower_shop_name
       FROM shop_follows sf
       JOIN shops fs ON sf.follower_shop_id = fs.id
       WHERE sf.source_shop_id = $1 
         AND sf.mode = 'resell' 
         AND sf.status = 'active'
       ORDER BY sf.created_at`,
      [sourceShopId]
    );
    return result.rows;
  }
};
