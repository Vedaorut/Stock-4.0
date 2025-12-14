/**
 * Admin Stats Controller
 *
 * Provides platform-wide statistics for admin dashboard
 */

import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Get platform statistics
 * GET /api/admin/stats
 */
export async function getStats(req, res) {
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE) as users_today,
        (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as users_week,
        (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as users_month,
        (SELECT COUNT(*) FROM shops) as total_shops,
        (SELECT COUNT(*) FROM shops WHERE is_active = true) as active_shops,
        (SELECT COUNT(*) FROM shops WHERE created_at >= CURRENT_DATE) as shops_today,
        (SELECT COUNT(*) FROM orders) as total_orders,
        (SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE) as orders_today,
        (SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as orders_week,
        (SELECT COUNT(*) FROM shop_subscriptions) as total_subscriptions,
        (SELECT COUNT(*) FROM shop_subscriptions WHERE status = 'active') as active_subscriptions,
        (SELECT COUNT(*) FROM shop_subscriptions WHERE tier = 'pro' AND status = 'active') as pro_subscriptions,
        (SELECT COUNT(*) FROM shop_subscriptions WHERE tier = 'max' AND status = 'active') as max_subscriptions,
        (SELECT COALESCE(SUM(expected_amount), 0) FROM invoices WHERE status = 'paid' AND created_at >= CURRENT_DATE) as revenue_today,
        (SELECT COALESCE(SUM(expected_amount), 0) FROM invoices WHERE status = 'paid' AND created_at >= CURRENT_DATE - INTERVAL '7 days') as revenue_week,
        (SELECT COALESCE(SUM(expected_amount), 0) FROM invoices WHERE status = 'paid' AND created_at >= CURRENT_DATE - INTERVAL '30 days') as revenue_month
    `);

    const stats = result.rows[0];

    logger.info('[Admin] Stats fetched', { adminId: req.user?.id });

    res.json({
      success: true,
      data: {
        users: {
          total: parseInt(stats.total_users, 10),
          today: parseInt(stats.users_today, 10),
          week: parseInt(stats.users_week, 10),
          month: parseInt(stats.users_month, 10),
        },
        shops: {
          total: parseInt(stats.total_shops, 10),
          active: parseInt(stats.active_shops, 10),
          today: parseInt(stats.shops_today, 10),
        },
        orders: {
          total: parseInt(stats.total_orders, 10),
          today: parseInt(stats.orders_today, 10),
          week: parseInt(stats.orders_week, 10),
        },
        subscriptions: {
          total: parseInt(stats.total_subscriptions, 10),
          active: parseInt(stats.active_subscriptions, 10),
          pro: parseInt(stats.pro_subscriptions, 10),
          max: parseInt(stats.max_subscriptions, 10),
        },
        revenue: {
          today: parseFloat(stats.revenue_today),
          week: parseFloat(stats.revenue_week),
          month: parseFloat(stats.revenue_month),
        },
      },
    });
  } catch (error) {
    logger.error('[Admin] Failed to get stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
    });
  }
}

export default {
  getStats,
};
