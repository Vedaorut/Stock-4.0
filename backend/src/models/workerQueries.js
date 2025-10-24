import { query } from '../config/database.js';

/**
 * Worker database queries
 * Manages shop_workers table for workspace functionality
 */
export const workerQueries = {
  /**
   * Add worker to shop
   * @param {Object} data - {shopId, workerUserId, telegramId, addedBy}
   * @returns {Object} Created worker record
   */
  create: async ({ shopId, workerUserId, telegramId, addedBy }) => {
    const result = await query(
      `INSERT INTO shop_workers (shop_id, worker_user_id, telegram_id, added_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [shopId, workerUserId, telegramId, addedBy]
    );
    return result.rows[0];
  },

  /**
   * Find worker by shop and user
   * @param {number} shopId
   * @param {number} userId
   * @returns {Object|null} Worker record or null
   */
  findByShopAndUser: async (shopId, userId) => {
    const result = await query(
      `SELECT * FROM shop_workers 
       WHERE shop_id = $1 AND worker_user_id = $2`,
      [shopId, userId]
    );
    return result.rows[0];
  },

  /**
   * Find worker by ID
   * @param {number} id - Worker record ID
   * @returns {Object|null} Worker record or null
   */
  findById: async (id) => {
    const result = await query(
      `SELECT sw.*, u.username, u.first_name, u.last_name, u.telegram_id as user_telegram_id
       FROM shop_workers sw
       JOIN users u ON sw.worker_user_id = u.id
       WHERE sw.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * List all workers for a shop
   * @param {number} shopId
   * @returns {Array} Array of worker records with user info
   */
  listByShop: async (shopId) => {
    const result = await query(
      `SELECT sw.*, u.username, u.first_name, u.last_name, u.telegram_id as user_telegram_id
       FROM shop_workers sw
       JOIN users u ON sw.worker_user_id = u.id
       WHERE sw.shop_id = $1
       ORDER BY sw.created_at DESC`,
      [shopId]
    );
    return result.rows;
  },

  /**
   * Get all shops where user has access (owner or worker)
   * @param {number} userId
   * @returns {Array} Array of shops with access_type field
   */
  getAccessibleShops: async (userId) => {
    const result = await query(
      `SELECT 
         s.*,
         CASE 
           WHEN s.owner_id = $1 THEN 'owner'
           ELSE 'worker'
         END as access_type,
         sw.id as worker_id,
         sw.added_by,
         sw.created_at as worker_since
       FROM shops s
       LEFT JOIN shop_workers sw ON s.id = sw.shop_id AND sw.worker_user_id = $1
       WHERE s.owner_id = $1 OR sw.id IS NOT NULL
       ORDER BY s.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Get shops where user is worker (not owner)
   * @param {number} userId
   * @returns {Array} Array of shops where user is worker
   */
  getWorkerShops: async (userId) => {
    const result = await query(
      `SELECT 
         s.*,
         'worker' as access_type,
         sw.id as worker_id,
         sw.added_by,
         sw.created_at as worker_since
       FROM shops s
       JOIN shop_workers sw ON s.id = sw.shop_id
       WHERE sw.worker_user_id = $1 AND s.owner_id != $1
       ORDER BY sw.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Check if user is worker in shop (not owner)
   * @param {number} shopId
   * @param {number} userId
   * @returns {boolean} True if user is worker in this shop
   */
  isWorker: async (shopId, userId) => {
    const result = await query(
      `SELECT EXISTS(
         SELECT 1 FROM shop_workers sw
         JOIN shops s ON sw.shop_id = s.id
         WHERE sw.shop_id = $1 
           AND sw.worker_user_id = $2
           AND s.owner_id != $2
       ) as is_worker`,
      [shopId, userId]
    );
    return result.rows[0]?.is_worker || false;
  },

  /**
   * Check if user has access to shop (owner or worker)
   * @param {number} shopId
   * @param {number} userId
   * @returns {Object} {hasAccess: boolean, accessType: 'owner'|'worker'|null}
   */
  checkAccess: async (shopId, userId) => {
    const result = await query(
      `SELECT 
         CASE 
           WHEN s.owner_id = $2 THEN 'owner'
           WHEN sw.id IS NOT NULL THEN 'worker'
           ELSE NULL
         END as access_type
       FROM shops s
       LEFT JOIN shop_workers sw ON s.id = sw.shop_id AND sw.worker_user_id = $2
       WHERE s.id = $1`,
      [shopId, userId]
    );
    
    const accessType = result.rows[0]?.access_type;
    return {
      hasAccess: accessType !== null,
      accessType
    };
  },

  /**
   * Remove worker from shop
   * @param {number} workerId - Worker record ID (not user ID!)
   * @returns {Object} Deleted worker record
   */
  remove: async (workerId) => {
    const result = await query(
      `DELETE FROM shop_workers
       WHERE id = $1
       RETURNING *`,
      [workerId]
    );
    return result.rows[0];
  },

  /**
   * Remove worker by shop and user
   * @param {number} shopId
   * @param {number} userId
   * @returns {Object} Deleted worker record
   */
  removeByShopAndUser: async (shopId, userId) => {
    const result = await query(
      `DELETE FROM shop_workers
       WHERE shop_id = $1 AND worker_user_id = $2
       RETURNING *`,
      [shopId, userId]
    );
    return result.rows[0];
  },

  /**
   * Count workers in shop
   * @param {number} shopId
   * @returns {number} Worker count
   */
  countByShop: async (shopId) => {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM shop_workers
       WHERE shop_id = $1`,
      [shopId]
    );
    return parseInt(result.rows[0]?.count || 0);
  }
};

export default workerQueries;
