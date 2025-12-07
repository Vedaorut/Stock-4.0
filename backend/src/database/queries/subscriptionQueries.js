import { query } from '../../config/database.js';

/**
 * Subscription database queries
 * Uses shop_subscribers table (unified subscription system)
 */
export const subscriptionQueries = {
  // Create subscription (user follows a shop)
  create: async (userId, shopId, telegramId = null) => {
    try {
      const result = await query(
        `INSERT INTO shop_subscribers (user_id, shop_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, shop_id) DO NOTHING
         RETURNING *`,
        [userId, shopId]
      );
      // If conflict occurred (already subscribed), fetch existing record
      if (result.rows.length === 0) {
        const existing = await query(
          'SELECT * FROM shop_subscribers WHERE user_id = $1 AND shop_id = $2',
          [userId, shopId]
        );
        return existing.rows[0];
      }
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
      `SELECT ss.*, sh.name as shop_name, sh.description as shop_description,
              u.username as shop_owner_username
       FROM shop_subscribers ss
       JOIN shops sh ON ss.shop_id = sh.id
       JOIN users u ON sh.owner_id = u.id
       WHERE ss.user_id = $1 AND sh.is_active = true
       ORDER BY ss.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  },

  // Find subscriptions by shop ID
  findByShopId: async (shopId, limit = 50, offset = 0) => {
    const result = await query(
      `SELECT ss.*, u.username, u.first_name, u.last_name
       FROM shop_subscribers ss
       JOIN users u ON ss.user_id = u.id
       WHERE ss.shop_id = $1
       ORDER BY ss.created_at DESC
       LIMIT $2 OFFSET $3`,
      [shopId, limit, offset]
    );
    return result.rows;
  },

  // Check if subscription exists
  exists: async (userId, shopId) => {
    const result = await query(
      'SELECT EXISTS(SELECT 1 FROM shop_subscribers WHERE user_id = $1 AND shop_id = $2)',
      [userId, shopId]
    );
    return result.rows[0].exists;
  },

  // Find subscription by user and shop (for check endpoint)
  findByUserAndShop: async (userId, shopId) => {
    const result = await query(
      `SELECT ss.*, sh.name as shop_name, sh.description as shop_description,
              u.username as shop_owner_username
       FROM shop_subscribers ss
       JOIN shops sh ON ss.shop_id = sh.id
       JOIN users u ON sh.owner_id = u.id
       WHERE ss.user_id = $1 AND ss.shop_id = $2 AND sh.is_active = true
       LIMIT 1`,
      [userId, shopId]
    );
    return result.rows[0] || null;
  },

  // Delete subscription (unfollow shop)
  delete: async (userId, shopId) => {
    const result = await query(
      'DELETE FROM shop_subscribers WHERE user_id = $1 AND shop_id = $2 RETURNING *',
      [userId, shopId]
    );
    return result.rows[0];
  },

  // Find shop subscription (billing) by ID with owner info
  // Uses LEFT JOIN to support subscriptions without shop (pending new shop creation)
  findShopSubscriptionById: async (id) => {
    const result = await query(
      `SELECT ss.*, s.owner_id
       FROM shop_subscriptions ss
       LEFT JOIN shops s ON ss.shop_id = s.id
       WHERE ss.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },
};

export default subscriptionQueries;
