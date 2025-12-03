import { query } from '../../config/database.js';

/**
 * Shop Subscriber database queries
 * Handles user subscriptions to shops via invite links (t.me/bot?start=shop_123)
 */
export const shopSubscriberQueries = {
  /**
   * Subscribe user to a shop (idempotent - ON CONFLICT DO NOTHING)
   * @param {number} userId - User ID
   * @param {number} shopId - Shop ID
   * @returns {Promise<Object|null>} Created subscription or null if already exists
   */
  create: async (userId, shopId) => {
    const result = await query(
      `INSERT INTO shop_subscribers (user_id, shop_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, shop_id) DO NOTHING
       RETURNING *`,
      [userId, shopId]
    );
    return result.rows[0] || null;
  },

  /**
   * Find subscription by user and shop
   * @param {number} userId - User ID
   * @param {number} shopId - Shop ID
   * @returns {Promise<Object|undefined>} Subscription record
   */
  findByUserAndShop: async (userId, shopId) => {
    const result = await query(
      `SELECT * FROM shop_subscribers
       WHERE user_id = $1 AND shop_id = $2`,
      [userId, shopId]
    );
    return result.rows[0];
  },

  /**
   * Find all shops a user is subscribed to
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Array of subscriptions with shop details
   */
  findByUser: async (userId) => {
    const result = await query(
      `SELECT
        ss.*,
        s.name as shop_name,
        s.description as shop_description,
        s.logo as shop_logo,
        s.is_active as shop_is_active,
        u.username as owner_username,
        u.first_name as owner_first_name
       FROM shop_subscribers ss
       JOIN shops s ON ss.shop_id = s.id
       JOIN users u ON s.owner_id = u.id
       WHERE ss.user_id = $1
       ORDER BY ss.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Find all subscribers of a shop
   * @param {number} shopId - Shop ID
   * @param {number} limit - Max results (default 100)
   * @param {number} offset - Offset for pagination (default 0)
   * @returns {Promise<Array>} Array of subscribers with user details
   */
  findByShop: async (shopId, limit = 100, offset = 0) => {
    const result = await query(
      `SELECT
        ss.*,
        u.username,
        u.first_name,
        u.last_name,
        u.telegram_id
       FROM shop_subscribers ss
       JOIN users u ON ss.user_id = u.id
       WHERE ss.shop_id = $1
       ORDER BY ss.created_at DESC
       LIMIT $2 OFFSET $3`,
      [shopId, limit, offset]
    );
    return result.rows;
  },

  /**
   * Count subscribers for a shop
   * @param {number} shopId - Shop ID
   * @returns {Promise<number>} Subscriber count
   */
  countByShop: async (shopId) => {
    const result = await query(
      `SELECT COUNT(*) as count FROM shop_subscribers WHERE shop_id = $1`,
      [shopId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  /**
   * Unsubscribe user from a shop
   * @param {number} userId - User ID
   * @param {number} shopId - Shop ID
   * @returns {Promise<Object|undefined>} Deleted subscription or undefined
   */
  delete: async (userId, shopId) => {
    const result = await query(
      `DELETE FROM shop_subscribers
       WHERE user_id = $1 AND shop_id = $2
       RETURNING *`,
      [userId, shopId]
    );
    return result.rows[0];
  },

  /**
   * Check if user is subscribed to a shop
   * @param {number} userId - User ID
   * @param {number} shopId - Shop ID
   * @returns {Promise<boolean>} True if subscribed
   */
  isSubscribed: async (userId, shopId) => {
    const result = await query(
      `SELECT EXISTS(
        SELECT 1 FROM shop_subscribers
        WHERE user_id = $1 AND shop_id = $2
      ) as subscribed`,
      [userId, shopId]
    );
    return result.rows[0].subscribed;
  },
};

export default shopSubscriberQueries;
