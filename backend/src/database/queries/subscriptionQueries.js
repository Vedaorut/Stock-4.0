import { query } from '../../config/database.js';

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

  // Find shop subscription (billing) by ID with owner info
  findShopSubscriptionById: async (id) => {
    const result = await query(
      `SELECT ss.*, s.owner_id
       FROM shop_subscriptions ss
       JOIN shops s ON ss.shop_id = s.id
       WHERE ss.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },
};

export default subscriptionQueries;
