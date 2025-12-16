/**
 * Admin Users Controller
 *
 * Handles user management for admin panel
 */

import { adminQueries } from '../../database/queries/adminQueries.js';
import logger from '../../utils/logger.js';

/**
 * Get all users with pagination and filters
 * GET /api/admin/users
 */
export async function getUsers(req, res) {
  try {
    const { page = 1, limit = 50, search = '', role = 'all' } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { users, total } = await adminQueries.getAllUsers({
      search,
      role,
      limit: parseInt(limit, 10),
      offset
    });

    // Log action (non-blocking)
    adminQueries.logAction({
      adminId: req.user?.id,
      action: 'view_users',
      targetType: null,
      targetId: null,
      reason: null,
      notes: null,
      metadata: { filters: { search, role }, page, limit },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => {
      logger.error('[AdminUsers] Failed to log view action:', err);
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          pages: Math.ceil(total / parseInt(limit, 10)),
          hasMore: offset + users.length < total
        }
      }
    });
  } catch (error) {
    logger.error('[AdminUsers] Failed to get users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
}

/**
 * Get user details
 * GET /api/admin/users/:userId
 */
export async function getUserDetail(req, res) {
  try {
    const { userId } = req.params;

    const user = await adminQueries.getUserDetail(parseInt(userId, 10));

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Log action (non-blocking)
    adminQueries.logAction({
      adminId: req.user?.id,
      action: 'view_user_detail',
      targetType: 'user',
      targetId: parseInt(userId, 10),
      reason: null,
      notes: null,
      metadata: { username: user.username },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => {
      logger.error('[AdminUsers] Failed to log view detail action:', err);
    });

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('[AdminUsers] Failed to get user detail:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user details'
    });
  }
}

export default {
  getUsers,
  getUserDetail
};
