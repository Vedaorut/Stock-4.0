/**
 * Admin Shops Controller
 *
 * Handles shop management for admin panel
 */

import { adminQueries } from '../../database/queries/adminQueries.js';
import logger from '../../utils/logger.js';

/**
 * Get all shops with pagination and filters
 * GET /api/admin/shops
 */
export async function getShops(req, res) {
  try {
    const { page = 1, limit = 50, search = '', tier = 'all', status = 'all' } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { shops, total } = await adminQueries.getAllShops({
      search,
      tier,
      status,
      limit: parseInt(limit, 10),
      offset
    });

    // Log action (non-blocking)
    adminQueries.logAction({
      adminId: req.user?.id,
      action: 'view_shops',
      targetType: null,
      targetId: null,
      reason: null,
      notes: null,
      metadata: { filters: { search, tier, status }, page, limit },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => {
      logger.error('[AdminShops] Failed to log view action:', err);
    });

    res.json({
      success: true,
      data: {
        shops,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          pages: Math.ceil(total / parseInt(limit, 10)),
          hasMore: offset + shops.length < total
        }
      }
    });
  } catch (error) {
    logger.error('[AdminShops] Failed to get shops:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shops'
    });
  }
}

/**
 * Get shop details
 * GET /api/admin/shops/:shopId
 */
export async function getShopDetail(req, res) {
  try {
    const { shopId } = req.params;

    const shop = await adminQueries.getShopDetail(parseInt(shopId, 10));

    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found'
      });
    }

    // Log action (non-blocking)
    adminQueries.logAction({
      adminId: req.user?.id,
      action: 'view_shop_detail',
      targetType: 'shop',
      targetId: parseInt(shopId, 10),
      reason: null,
      notes: null,
      metadata: { shopName: shop.name, ownerUsername: shop.owner_username },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => {
      logger.error('[AdminShops] Failed to log view detail action:', err);
    });

    res.json({
      success: true,
      data: shop
    });
  } catch (error) {
    logger.error('[AdminShops] Failed to get shop detail:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shop details'
    });
  }
}

export default {
  getShops,
  getShopDetail
};
