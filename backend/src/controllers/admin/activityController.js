/**
 * Admin Activity Controller
 *
 * Handles admin activity log viewing
 */

import { adminQueries } from '../../database/queries/adminQueries.js';
import logger from '../../utils/logger.js';

/**
 * Get activity logs with pagination and filters
 * GET /api/admin/activity
 */
export async function getActivityLogs(req, res) {
  try {
    const { page = 1, limit = 100, action = 'all', adminId = null } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { logs, total } = await adminQueries.getActivityLogs({
      action,
      adminId: adminId ? parseInt(adminId, 10) : null,
      limit: parseInt(limit, 10),
      offset
    });

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          pages: Math.ceil(total / parseInt(limit, 10)),
          hasMore: offset + logs.length < total
        }
      }
    });
  } catch (error) {
    logger.error('[AdminActivity] Failed to get activity logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity logs'
    });
  }
}

export default {
  getActivityLogs
};
