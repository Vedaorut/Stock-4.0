/**
 * Subscription Controller
 * 
 * Handles HTTP requests for shop subscription management:
 * - Payment processing for monthly subscriptions
 * - Tier upgrades (basic → pro)
 * - Subscription status and history
 */

import * as subscriptionService from '../services/subscriptionService.js';
import logger from '../utils/logger.js';

/**
 * Pay for subscription (monthly renewal or new subscription)
 * POST /api/subscriptions/pay
 * 
 * Body: {
 *   shopId: number,
 *   tier: 'basic' | 'pro',
 *   txHash: string,
 *   currency: 'BTC' | 'ETH' | 'USDT',
 *   paymentAddress: string
 * }
 */
async function paySubscription(req, res) {
  try {
    const { shopId, tier, txHash, currency, paymentAddress } = req.body;
    const userId = req.user.id;
    
    // Validate required fields
    if (!shopId || !tier || !txHash || !currency || !paymentAddress) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['shopId', 'tier', 'txHash', 'currency', 'paymentAddress']
      });
    }
    
    // Verify shop ownership
    const ownershipCheck = await verifyShopOwnership(shopId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }
    
    // Process subscription payment
    const subscription = await subscriptionService.processSubscriptionPayment(
      shopId,
      tier,
      txHash,
      currency,
      paymentAddress
    );
    
    logger.info(`[SubscriptionController] Subscription payment processed for shop ${shopId}, tier: ${tier}`);
    
    res.status(201).json({
      success: true,
      subscription,
      message: `Subscription activated: ${tier} tier for 30 days`
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error processing subscription payment:', error);
    
    // Handle specific errors
    if (error.message.includes('Transaction verification failed')) {
      return res.status(400).json({ error: 'Transaction verification failed', details: error.message });
    }
    if (error.message.includes('already processed')) {
      return res.status(409).json({ error: 'Transaction already processed' });
    }
    if (error.message.includes('Invalid subscription tier')) {
      return res.status(400).json({ error: 'Invalid subscription tier. Use "basic" or "pro"' });
    }
    
    res.status(500).json({ error: 'Failed to process subscription payment' });
  }
}

/**
 * Upgrade shop from basic to PRO tier
 * POST /api/subscriptions/upgrade
 * 
 * Body: {
 *   shopId: number,
 *   txHash: string,
 *   currency: 'BTC' | 'ETH' | 'USDT',
 *   paymentAddress: string
 * }
 */
async function upgradeShop(req, res) {
  try {
    const { shopId, txHash, currency, paymentAddress } = req.body;
    const userId = req.user.id;
    
    // Validate required fields
    if (!shopId || !txHash || !currency || !paymentAddress) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['shopId', 'txHash', 'currency', 'paymentAddress']
      });
    }
    
    // Verify shop ownership
    const ownershipCheck = await verifyShopOwnership(shopId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }
    
    // Upgrade shop to PRO
    const subscription = await subscriptionService.upgradeShopToPro(
      shopId,
      txHash,
      currency,
      paymentAddress
    );
    
    logger.info(`[SubscriptionController] Shop ${shopId} upgraded to PRO tier`);
    
    res.status(200).json({
      success: true,
      subscription,
      message: 'Shop upgraded to PRO tier successfully',
      newTier: 'pro'
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error upgrading shop:', error);
    
    // Handle specific errors
    if (error.message.includes('already PRO')) {
      return res.status(400).json({ error: 'Shop is already PRO tier' });
    }
    if (error.message.includes('No active subscription')) {
      return res.status(400).json({ error: 'No active subscription found. Please renew subscription first.' });
    }
    if (error.message.includes('Transaction verification failed')) {
      return res.status(400).json({ error: 'Transaction verification failed', details: error.message });
    }
    if (error.message.includes('already processed')) {
      return res.status(409).json({ error: 'Transaction already processed' });
    }
    
    res.status(500).json({ error: 'Failed to upgrade shop' });
  }
}

/**
 * Get upgrade cost for shop
 * GET /api/subscriptions/upgrade-cost/:shopId
 */
async function getUpgradeCost(req, res) {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;
    
    // Verify shop ownership
    const ownershipCheck = await verifyShopOwnership(shopId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }
    
    const upgradeInfo = await subscriptionService.calculateUpgradeCost(shopId);
    
    res.json(upgradeInfo);
  } catch (error) {
    logger.error('[SubscriptionController] Error calculating upgrade cost:', error);
    
    if (error.message.includes('Shop not found')) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    if (error.message.includes('No active subscription')) {
      return res.status(400).json({ error: 'No active subscription found' });
    }
    
    res.status(500).json({ error: 'Failed to calculate upgrade cost' });
  }
}

/**
 * Get subscription status for shop
 * GET /api/subscriptions/status/:shopId
 */
async function getStatus(req, res) {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;
    
    // Verify shop ownership
    const ownershipCheck = await verifyShopOwnership(shopId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }
    
    const status = await subscriptionService.getSubscriptionStatus(shopId);
    
    res.json(status);
  } catch (error) {
    logger.error('[SubscriptionController] Error getting subscription status:', error);
    
    if (error.message.includes('Shop not found')) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
}

/**
 * Get subscription payment history for shop
 * GET /api/subscriptions/history/:shopId?limit=10
 */
async function getHistory(req, res) {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 10;
    
    // Verify shop ownership
    const ownershipCheck = await verifyShopOwnership(shopId, userId);
    if (!ownershipCheck.success) {
      return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
    }
    
    const history = await subscriptionService.getSubscriptionHistory(shopId, limit);
    
    res.json({
      shopId,
      history
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting subscription history:', error);
    res.status(500).json({ error: 'Failed to get subscription history' });
  }
}

/**
 * Get subscription pricing info
 * GET /api/subscriptions/pricing
 */
async function getPricing(req, res) {
  try {
    res.json({
      basic: {
        price: subscriptionService.SUBSCRIPTION_PRICES.basic,
        currency: 'USD',
        period: '30 days',
        features: [
          'Create and manage shop',
          'Up to 4 products',
          'Basic analytics',
          'Crypto payments (BTC, ETH, USDT)'
        ]
      },
      pro: {
        price: subscriptionService.SUBSCRIPTION_PRICES.pro,
        currency: 'USD',
        period: '30 days',
        features: [
          'All Basic features',
          'Unlimited products',
          'Unlimited Follow Shop (dropshipping)',
          'Channel Migration (2 times/month)',
          'Priority support',
          'Advanced analytics'
        ]
      },
      gracePeriod: {
        days: subscriptionService.GRACE_PERIOD_DAYS,
        description: 'Grace period after subscription expires before shop deactivation'
      }
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting pricing:', error);
    res.status(500).json({ error: 'Failed to get pricing information' });
  }
}

/**
 * Helper: Verify shop ownership
 * 
 * @param {number} shopId - Shop ID
 * @param {number} userId - User ID
 * @returns {Promise<{success: boolean, status?: number, error?: string}>}
 */
async function verifyShopOwnership(shopId, userId) {
  try {
    const pool = (await import('../config/database.js')).default;
    
    const result = await pool.query(
      'SELECT owner_id FROM shops WHERE id = $1',
      [shopId]
    );
    
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
 * Get user subscriptions (buyer view)
 * GET /api/subscriptions
 */
async function getUserSubscriptions(req, res) {
  try {
    const userId = req.user.id;

    const subscriptions = await subscriptionService.getUserSubscriptions(userId);

    res.json({
      data: subscriptions,
      count: subscriptions.length
    });
  } catch (error) {
    logger.error('[SubscriptionController] Error getting user subscriptions:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to fetch subscriptions'
    });
  }
}

export {
  paySubscription,
  upgradeShop,
  getUpgradeCost,
  getStatus,
  getHistory,
  getPricing,
  getUserSubscriptions
};
