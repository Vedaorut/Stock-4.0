import { SUBSCRIPTION_PERIOD_DAYS } from '../../../config/subscriptionPricing.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import * as subscriptionService from '../../../services/subscriptionService.js';
import { getClient } from '../../../config/database.js';
import { verifyShopOwnership } from '../utils/ownership.js';
import { validatePendingSubscriptionInput } from '../validators/payloadValidators.js';

/**
 * Create pending subscription for first-time shop creation
 * POST /api/subscriptions/pending
 */
export const createPendingSubscription = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { tier, shopId } = validatePendingSubscriptionInput(req.body);

    logger.info('[SubscriptionController] Creating pending subscription:', {
      userId,
      tier,
      shopId: req.body?.shopId,
    });

    if (shopId) {
      const ownershipCheck = await verifyShopOwnership(shopId, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.status).json({
          success: false,
          error: ownershipCheck.error,
        });
      }
    }

    const client = await getClient();

    try {
      await client.query('BEGIN');
      logger.debug('[SubscriptionController] Transaction started');

      if (shopId) {
        const existing = await client.query(
          `SELECT id, status FROM shop_subscriptions 
           WHERE user_id = $1 AND shop_id = $2 AND status IN ('pending', 'active') 
           LIMIT 1`,
          [userId, shopId]
        );

        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            error: 'Subscription already exists for this shop',
            subscriptionId: existing.rows[0].id,
            status: existing.rows[0].status,
          });
        }
      }

      const now = new Date();
      const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
      const tempTxHash = `pending-${userId}-${Date.now()}`;
      const amount = subscriptionService.SUBSCRIPTION_PRICES[tier];

      if (!amount || Number.isNaN(amount) || amount <= 0) {
        throw new ValidationError(`Invalid subscription amount for tier '${tier}': ${amount}`);
      }

      const subscriptionResult = await client.query(
        `INSERT INTO shop_subscriptions
         (user_id, shop_id, tier, amount, tx_hash, currency, period_start, period_end, status)
         VALUES ($1, $2, $3, $4, $5, 'USDT', $6, $7, 'pending')
         RETURNING id, user_id, shop_id, tier, amount, currency, status, period_start, period_end`,
        [userId, shopId, tier, amount, tempTxHash, now, periodEnd]
      );

      const subscription = subscriptionResult.rows[0];

      await client.query('COMMIT');
      logger.info('[SubscriptionController] Pending subscription created:', {
        userId,
        subscriptionId: subscription.id,
        tier,
        amount,
        shopId,
      });

      res.status(201).json({
        success: true,
        subscription: {
          ...subscription,
          period_start: subscription.period_start?.toISOString
            ? subscription.period_start.toISOString()
            : subscription.period_start,
          period_end: subscription.period_end?.toISOString
            ? subscription.period_end.toISOString()
            : subscription.period_end,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[SubscriptionController] Error in transaction (rolled back):', {
        error: error.message,
        stack: error.stack,
        userId,
        tier,
      });
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('[SubscriptionController] Error creating pending subscription:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      tier: req.body?.tier,
    });
    logger.error('[SubscriptionController] CRITICAL - Failed to create pending subscription:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      tier: req.body?.tier,
    });
    throw error;
  }
});
