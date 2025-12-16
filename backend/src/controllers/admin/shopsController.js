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

/**
 * Change shop tier
 * POST /api/admin/shops/:shopId/change-tier
 */
export async function changeTier(req, res) {
  try {
    const { shopId } = req.params;
    const { tier, reason, notes } = req.body;

    if (!tier || !['pro', 'max'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be "pro" or "max"'
      });
    }

    const shop = await adminQueries.changeTier(parseInt(shopId, 10), tier);

    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found'
      });
    }

    // Log action (non-blocking)
    adminQueries.logAction({
      adminId: req.user?.id,
      action: 'change_tier',
      targetType: 'shop',
      targetId: parseInt(shopId, 10),
      reason: reason || null,
      notes: notes || null,
      metadata: { oldTier: shop.tier, newTier: tier },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => {
      logger.error('[AdminShops] Failed to log change_tier action:', err);
    });

    res.json({
      success: true,
      data: shop
    });
  } catch (error) {
    logger.error('[AdminShops] Failed to change tier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change shop tier'
    });
  }
}

/**
 * Suspend shop
 * POST /api/admin/shops/:shopId/suspend
 */
export async function suspendShop(req, res) {
  try {
    const { shopId } = req.params;
    const { reason, notes } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required for suspending a shop'
      });
    }

    const shop = await adminQueries.suspendShop(parseInt(shopId, 10));

    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found'
      });
    }

    // Log action (non-blocking)
    adminQueries.logAction({
      adminId: req.user?.id,
      action: 'suspend_shop',
      targetType: 'shop',
      targetId: parseInt(shopId, 10),
      reason,
      notes: notes || null,
      metadata: { shopName: shop.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => {
      logger.error('[AdminShops] Failed to log suspend_shop action:', err);
    });

    res.json({
      success: true,
      data: shop
    });
  } catch (error) {
    logger.error('[AdminShops] Failed to suspend shop:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suspend shop'
    });
  }
}

/**
 * Activate shop
 * POST /api/admin/shops/:shopId/activate
 */
export async function activateShop(req, res) {
  try {
    const { shopId } = req.params;
    const { notes } = req.body;

    const shop = await adminQueries.activateShop(parseInt(shopId, 10));

    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found'
      });
    }

    // Log action (non-blocking)
    adminQueries.logAction({
      adminId: req.user?.id,
      action: 'activate_shop',
      targetType: 'shop',
      targetId: parseInt(shopId, 10),
      reason: null,
      notes: notes || null,
      metadata: { shopName: shop.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => {
      logger.error('[AdminShops] Failed to log activate_shop action:', err);
    });

    res.json({
      success: true,
      data: shop
    });
  } catch (error) {
    logger.error('[AdminShops] Failed to activate shop:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate shop'
    });
  }
}

/**
 * Grant lifetime subscription
 * POST /api/admin/shops/:shopId/grant-lifetime
 */
export async function grantLifetimeSubscription(req, res) {
  try {
    const { shopId } = req.params;
    const { tier, notes } = req.body;

    if (!tier || !['pro', 'max'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be "pro" or "max"'
      });
    }

    const shop = await adminQueries.grantLifetimeSubscription(parseInt(shopId, 10), tier);

    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found'
      });
    }

    // Log action (non-blocking)
    adminQueries.logAction({
      adminId: req.user?.id,
      action: 'grant_lifetime',
      targetType: 'shop',
      targetId: parseInt(shopId, 10),
      reason: null,
      notes: notes || null,
      metadata: { tier, shopName: shop.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => {
      logger.error('[AdminShops] Failed to log grant_lifetime action:', err);
    });

    res.json({
      success: true,
      data: shop
    });
  } catch (error) {
    logger.error('[AdminShops] Failed to grant lifetime subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to grant lifetime subscription'
    });
  }
}

/**
 * Extend subscription
 * POST /api/admin/shops/:shopId/extend-subscription
 */
export async function extendSubscription(req, res) {
  try {
    const { shopId } = req.params;
    const { days, notes } = req.body;

    if (!days || days <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid days. Must be a positive number'
      });
    }

    const shop = await adminQueries.extendSubscription(parseInt(shopId, 10), parseInt(days, 10));

    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found'
      });
    }

    // Log action (non-blocking)
    adminQueries.logAction({
      adminId: req.user?.id,
      action: 'extend_subscription',
      targetType: 'shop',
      targetId: parseInt(shopId, 10),
      reason: null,
      notes: notes || null,
      metadata: { days: parseInt(days, 10), shopName: shop.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => {
      logger.error('[AdminShops] Failed to log extend_subscription action:', err);
    });

    res.json({
      success: true,
      data: shop
    });
  } catch (error) {
    logger.error('[AdminShops] Failed to extend subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extend subscription'
    });
  }
}

export default {
  getShops,
  getShopDetail,
  changeTier,
  suspendShop,
  activateShop,
  grantLifetimeSubscription,
  extendSubscription
};
