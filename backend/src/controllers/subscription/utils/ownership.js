import logger from '../../../utils/logger.js';

/**
 * Verify shop ownership for subscription actions.
 * Returns success flag with HTTP-friendly status/error fields for controller usage.
 */
export async function verifyShopOwnership(shopId, userId) {
  try {
    const pool = (await import('../../../config/database.js')).default;
    const result = await pool.query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);

    if (result.rows.length === 0) {
      return { success: false, status: 404, error: 'Shop not found' };
    }

    if (result.rows[0].owner_id !== userId) {
      return { success: false, status: 403, error: 'Not authorized to manage this shop' };
    }

    return { success: true };
  } catch (error) {
    logger.error('[SubscriptionController] Error verifying shop ownership:', error);
    return { success: false, status: 500, error: 'Internal server error' };
  }
}

/**
 * Verify subscription ownership. Checks owner via shop owner or direct user link.
 */
export async function verifySubscriptionOwnership(subscriptionId, userId) {
  try {
    const pool = (await import('../../../config/database.js')).default;

    const result = await pool.query(
      `SELECT ss.*,
              CASE
                WHEN ss.shop_id IS NOT NULL THEN s.owner_id
                ELSE ss.user_id
              END as owner_id
       FROM shop_subscriptions ss
       LEFT JOIN shops s ON ss.shop_id = s.id
       WHERE ss.id = $1`,
      [subscriptionId]
    );

    if (result.rows.length === 0) {
      return { success: false, status: 404, error: 'Subscription not found' };
    }

    const subscription = result.rows[0];

    if (subscription.owner_id !== userId) {
      return { success: false, status: 403, error: 'Not authorized to access this subscription' };
    }

    return { success: true, subscription };
  } catch (error) {
    logger.error('[SubscriptionController] Error verifying subscription ownership:', error);
    return { success: false, status: 500, error: 'Internal server error' };
  }
}
