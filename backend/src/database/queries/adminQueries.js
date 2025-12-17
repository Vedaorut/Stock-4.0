/**
 * Admin Database Queries
 *
 * Queries for admin panel operations:
 * - Users management (list, details, ban/unban)
 * - Shops management (list, details, suspend/activate)
 * - Orders monitoring
 * - Subscriptions management
 * - Activity audit logs
 */

import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';

let adminActionLogsAvailable = null;

/**
 * Admin Queries Module
 */
export const adminQueries = {
  // ============================================
  // INTERNAL HELPERS
  // ============================================

  /**
   * Detect missing admin_action_logs table (migration may not be applied in some environments)
   */
  _isMissingAdminActionLogsTable: (error) => {
    return (
      error?.code === '42P01' ||
      (typeof error?.message === 'string' && error.message.includes('admin_action_logs'))
    );
  },

  _isAdminActionLogsAvailable: async () => {
    if (adminActionLogsAvailable !== null) {return adminActionLogsAvailable;}

    try {
      const result = await query(`SELECT to_regclass('public.admin_action_logs') as name`);
      adminActionLogsAvailable = !!result.rows?.[0]?.name;
      return adminActionLogsAvailable;
    } catch {
      adminActionLogsAvailable = false;
      return false;
    }
  },

  // ============================================
  // USERS QUERIES
  // ============================================

  /**
   * Get all users with stats and pagination
   * @param {Object} options - Query options
   * @param {string} options.search - Search query for username/telegram_id
   * @param {string} options.role - Filter by role (all/buyer/seller)
   * @param {number} options.limit - Results per page
   * @param {number} options.offset - Pagination offset
   * @returns {Promise<{users: Array, total: number}>}
   */
  getAllUsers: async ({ search = '', role = 'all', limit = 50, offset = 0 }) => {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Search filter
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      whereClause += ` AND (u.username ILIKE $${paramIndex} OR u.telegram_id::TEXT ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex})`;
      paramIndex++;
    }

    // Role filter
    if (role && role !== 'all') {
      params.push(role);
      whereClause += ` AND u.selected_role = $${paramIndex}`;
      paramIndex++;
    }

    // Main query
    const queryText = `
      SELECT
        u.id,
        u.telegram_id,
        u.username,
        u.first_name,
        u.last_name,
        u.selected_role,
        u.language,
        u.is_admin,
        u.created_at,
        u.updated_at,
        COUNT(DISTINCT s.id) as shop_count,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(CASE WHEN o.status IN ('confirmed', 'shipped', 'delivered') THEN o.total_price ELSE 0 END), 0) as total_spent
      FROM users u
      LEFT JOIN shops s ON u.id = s.owner_id
      LEFT JOIN orders o ON u.id = o.buyer_id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    // Count query
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      ${whereClause}
    `;

    const [result, countResult] = await Promise.all([
      query(queryText, params),
      query(countQuery, params.slice(0, -2)) // Remove limit/offset from count params
    ]);

    return {
      users: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0, 10)
    };
  },

  /**
   * Get detailed user information
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} User details with shops, orders, subscriptions
   */
  getUserDetail: async (userId) => {
    const userQuery = `
      SELECT
        u.*,
        COUNT(DISTINCT s.id) as shop_count,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(CASE WHEN o.status IN ('confirmed', 'shipped', 'delivered') THEN o.total_price ELSE 0 END), 0) as total_spent
      FROM users u
      LEFT JOIN shops s ON u.id = s.owner_id
      LEFT JOIN orders o ON u.id = o.buyer_id
      WHERE u.id = $1
      GROUP BY u.id
    `;

    const shopsQuery = `
      SELECT
        s.id,
        s.name,
        s.tier,
        s.is_active,
        s.subscription_status,
        s.created_at,
        COUNT(DISTINCT p.id) as product_count,
        COUNT(DISTINCT o.id) as order_count
      FROM shops s
      LEFT JOIN products p ON s.id = p.shop_id AND p.is_active = true
      LEFT JOIN orders o ON s.id = o.shop_id
      WHERE s.owner_id = $1
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `;

    const ordersQuery = `
      SELECT
        o.id,
        o.shop_id,
        o.status,
        o.total_price,
        o.created_at,
        s.name as shop_name
      FROM orders o
      LEFT JOIN shops s ON o.shop_id = s.id
      WHERE o.buyer_id = $1
      ORDER BY o.created_at DESC
      LIMIT 10
    `;

    const [userResult, shopsResult, ordersResult] = await Promise.all([
      query(userQuery, [userId]),
      query(shopsQuery, [userId]),
      query(ordersQuery, [userId])
    ]);

    if (userResult.rows.length === 0) {
      return null;
    }

    return {
      ...userResult.rows[0],
      shops: shopsResult.rows,
      recent_orders: ordersResult.rows
    };
  },

  // ============================================
  // SHOPS QUERIES
  // ============================================

  /**
   * Get all shops with stats and pagination
   * @param {Object} options - Query options
   * @param {string} options.search - Search query for shop name/owner username
   * @param {string} options.tier - Filter by tier (all/pro/max)
   * @param {string} options.status - Filter by status (all/active/inactive/trial/grace_period)
   * @param {number} options.limit - Results per page
   * @param {number} options.offset - Pagination offset
   * @returns {Promise<{shops: Array, total: number}>}
   */
  getAllShops: async ({ search = '', tier = 'all', status = 'all', limit = 50, offset = 0 }) => {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Search filter
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      whereClause += ` AND (s.name ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`;
      paramIndex++;
    }

    // Tier filter
    if (tier && tier !== 'all') {
      params.push(tier);
      whereClause += ` AND s.tier = $${paramIndex}`;
      paramIndex++;
    }

    // Status filter
    if (status && status !== 'all') {
      if (status === 'active') {
        whereClause += ` AND s.is_active = true AND s.subscription_status = 'active'`;
      } else if (status === 'inactive') {
        whereClause += ` AND s.is_active = false`;
      } else if (status === 'trial') {
        whereClause += ` AND s.is_trial = true`;
      } else if (status === 'grace_period') {
        whereClause += ` AND s.subscription_status = 'grace_period'`;
      }
    }

    const queryText = `
      SELECT
        s.id,
        s.name,
        s.tier,
        s.is_active,
        s.is_trial,
        s.subscription_status,
        s.next_payment_due,
        s.created_at,
        u.id as owner_id,
        u.username as owner_username,
        u.telegram_id as owner_telegram_id,
        COUNT(DISTINCT p.id) as product_count,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(CASE WHEN o.status IN ('confirmed', 'shipped', 'delivered') THEN o.total_price ELSE 0 END), 0) as total_revenue
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      LEFT JOIN products p ON s.id = p.shop_id AND p.is_active = true
      LEFT JOIN orders o ON s.id = o.shop_id
      ${whereClause}
      GROUP BY s.id, u.id
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      ${whereClause}
    `;

    const [result, countResult] = await Promise.all([
      query(queryText, params),
      query(countQuery, params.slice(0, -2))
    ]);

    return {
      shops: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0, 10)
    };
  },

  /**
   * Get detailed shop information
   * @param {number} shopId - Shop ID
   * @returns {Promise<Object|null>} Shop details with owner, products, orders
   */
  getShopDetail: async (shopId) => {
    const shopQuery = `
      SELECT
        s.*,
        u.id as owner_id,
        u.username as owner_username,
        u.telegram_id as owner_telegram_id,
        u.first_name as owner_first_name
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      WHERE s.id = $1
    `;

    const productsQuery = `
      SELECT id, name, price, stock_quantity as stock, is_active, created_at
      FROM products
      WHERE shop_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const ordersQuery = `
      SELECT
        o.id,
        o.status,
        o.total_price,
        o.created_at,
        u.username as buyer_username
      FROM orders o
      LEFT JOIN users u ON o.buyer_id = u.id
      WHERE o.shop_id = $1
      ORDER BY o.created_at DESC
      LIMIT 10
    `;

    const statsQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN p.is_active = true THEN p.id END) as active_product_count,
        COUNT(DISTINCT o.id) as total_order_count,
        COUNT(DISTINCT CASE WHEN o.status IN ('confirmed', 'shipped', 'delivered') THEN o.id END) as completed_order_count,
        COALESCE(SUM(CASE WHEN o.status IN ('confirmed', 'shipped', 'delivered') THEN o.total_price ELSE 0 END), 0) as total_revenue
      FROM shops s
      LEFT JOIN products p ON s.id = p.shop_id
      LEFT JOIN orders o ON s.id = o.shop_id
      WHERE s.id = $1
    `;

    const [shopResult, productsResult, ordersResult, statsResult] = await Promise.all([
      query(shopQuery, [shopId]),
      query(productsQuery, [shopId]),
      query(ordersQuery, [shopId]),
      query(statsQuery, [shopId])
    ]);

    if (shopResult.rows.length === 0) {
      return null;
    }

    return {
      ...shopResult.rows[0],
      products: productsResult.rows,
      recent_orders: ordersResult.rows,
      stats: statsResult.rows[0]
    };
  },

  // ============================================
  // ACTIVITY LOG QUERIES
  // ============================================

  /**
   * Get activity logs with pagination
   * @param {Object} options - Query options
   * @param {string} options.action - Filter by action type
   * @param {number} options.adminId - Filter by admin user ID
   * @param {number} options.limit - Results per page
   * @param {number} options.offset - Pagination offset
   * @returns {Promise<{logs: Array, total: number}>}
   */
  getActivityLogs: async ({ action = 'all', adminId = null, limit = 100, offset = 0 }) => {
    if (!(await adminQueries._isAdminActionLogsAvailable())) {
      return { logs: [], total: 0 };
    }

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (action && action !== 'all') {
      params.push(action);
      whereClause += ` AND aal.action = $${paramIndex}`;
      paramIndex++;
    }

    if (adminId) {
      params.push(adminId);
      whereClause += ` AND aal.admin_id = $${paramIndex}`;
      paramIndex++;
    }

    const queryText = `
      SELECT
        aal.*,
        u.username as admin_username,
        u.first_name as admin_first_name
      FROM admin_action_logs aal
      JOIN users u ON aal.admin_id = u.id
      ${whereClause}
      ORDER BY aal.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM admin_action_logs aal
      ${whereClause}
    `;

    try {
      const [result, countResult] = await Promise.all([
        query(queryText, params),
        query(countQuery, params.slice(0, -2))
      ]);

      return {
        logs: result.rows,
        total: parseInt(countResult.rows[0]?.total || 0, 10)
      };
    } catch (error) {
      // If migration 076 isn't applied yet, let admin panel work without activity logs.
      if (adminQueries._isMissingAdminActionLogsTable(error)) {
        adminActionLogsAvailable = false;
        return { logs: [], total: 0 };
      }
      throw error;
    }
  },

  /**
   * Log an admin action
   * @param {Object} logData - Log data
   * @param {number} logData.adminId - Admin user ID
   * @param {string} logData.action - Action type
   * @param {string} logData.targetType - Target entity type
   * @param {number} logData.targetId - Target entity ID
   * @param {string} logData.reason - Reason for action
   * @param {string} logData.notes - Additional notes
   * @param {Object} logData.metadata - Additional metadata
   * @param {string} logData.ipAddress - IP address
   * @param {string} logData.userAgent - User agent string
   * @returns {Promise<Object>} Created log entry
   */
  logAction: async ({ adminId, action, targetType, targetId, reason, notes, metadata, ipAddress, userAgent }) => {
    if (!(await adminQueries._isAdminActionLogsAvailable())) {
      return null;
    }

    const queryText = `
      INSERT INTO admin_action_logs (
        admin_id, action, target_type, target_id, reason, notes, metadata, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    try {
      const result = await query(queryText, [
        adminId,
        action,
        targetType || null,
        targetId || null,
        reason || null,
        notes || null,
        metadata ? JSON.stringify(metadata) : null,
        ipAddress || null,
        userAgent || null
      ]);

      return result.rows[0];
    } catch (error) {
      // In some dev DBs the audit table may not exist yet; don't break admin UX.
      if (adminQueries._isMissingAdminActionLogsTable(error)) {
        adminActionLogsAvailable = false;
        return null;
      }
      logger.error('[AdminQueries] Failed to log action:', error);
      throw error;
    }
  },

  // ============================================
  // SHOP OPERATIONS
  // ============================================

  /**
   * Change shop tier (Pro ↔ Max)
   * @param {number} shopId - Shop ID
   * @param {string} newTier - New tier (pro/max)
   * @returns {Promise<Object>} Updated shop
   */
  changeTier: async (shopId, newTier) => {
    const queryText = `
      UPDATE shops
      SET tier = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(queryText, [newTier, shopId]);
    return result.rows[0];
  },

  /**
   * Suspend shop (set is_active = false)
   * @param {number} shopId - Shop ID
   * @returns {Promise<Object>} Updated shop
   */
  suspendShop: async (shopId) => {
    const queryText = `
      UPDATE shops
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(queryText, [shopId]);
    return result.rows[0];
  },

  /**
   * Activate shop (set is_active = true)
   * @param {number} shopId - Shop ID
   * @returns {Promise<Object>} Updated shop
   */
  activateShop: async (shopId) => {
    const queryText = `
      UPDATE shops
      SET is_active = true, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(queryText, [shopId]);
    return result.rows[0];
  },

  /**
   * Grant lifetime subscription (set next_payment_due to 20 years in future)
   * @param {number} shopId - Shop ID
   * @param {string} tier - Tier (pro/max)
   * @returns {Promise<Object>} Updated shop
   */
  grantLifetimeSubscription: async (shopId, tier) => {
    const queryText = `
      UPDATE shops
      SET
        tier = $1,
        is_trial = false,
        subscription_status = 'active',
        next_payment_due = NOW() + INTERVAL '20 years',
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(queryText, [tier, shopId]);
    return result.rows[0];
  },

  /**
   * Extend subscription by N days
   * @param {number} shopId - Shop ID
   * @param {number} days - Number of days to extend
   * @returns {Promise<Object>} Updated shop
   */
  extendSubscription: async (shopId, days) => {
    const queryText = `
      UPDATE shops
      SET
        next_payment_due = COALESCE(
          CASE
            WHEN next_payment_due > NOW() THEN next_payment_due + ($1 || ' days')::INTERVAL
            ELSE NOW() + ($1 || ' days')::INTERVAL
          END,
          NOW() + ($1 || ' days')::INTERVAL
        ),
        subscription_status = 'active',
        is_trial = false,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(queryText, [days, shopId]);
    return result.rows[0];
  }
};

export default adminQueries;
