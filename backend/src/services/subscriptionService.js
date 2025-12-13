/**
 * Subscription Service
 *
 * Handles recurring monthly subscriptions for shops:
 * - PRO tier ($25/month) and MAX tier ($35/month)
 * - Grace period: 2 days after expiration
 * - Auto-deactivation after grace period
 */

import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import {
  SUBSCRIPTION_PRICES,
  SUBSCRIPTION_PRICES_YEARLY,
  SUBSCRIPTION_PERIOD_DAYS,
  GRACE_PERIOD_DAYS,
  TRIAL_PERIOD_DAYS,
  SUBSCRIPTION_TIERS,
} from '../config/subscriptionPricing.js';
import { workerQueries } from '../models/workerQueries.js';
// paymentVerificationService removed - only CrystalPay payments supported

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Calculate prorated upgrade amount from current tier to target tier
 *
 * @param {Date} periodStart - Start of current subscription period
 * @param {Date} periodEnd - End of current subscription period
 * @param {number} currentTierPrice - Price of current tier per month
 * @param {number} targetTierPrice - Price of target tier per month
 * @returns {number} Prorated upgrade cost
 */
function calculateUpgradeAmount(periodStart, periodEnd, basicPrice, proPrice) {
  const now = new Date();
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  // Total period in days
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (totalDays <= 0) {
    return proPrice - basicPrice; // Full difference if period is invalid
  }

  // Remaining days in period
  const remainingDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  if (remainingDays <= 0) {
    return proPrice; // Full pro price if no time remaining
  }

  // Prorated difference: (pro - basic) * (remaining / total)
  const priceDifference = proPrice - basicPrice;
  const proratedAmount = (priceDifference * remainingDays) / totalDays;

  // Round to 2 decimal places
  return Math.round(proratedAmount * 100) / 100;
}

/**
 * Process subscription payment
 *
 * @deprecated HD wallet payments removed. Use CrystalPay via invoicePaymentService.
 */
async function processSubscriptionPayment() {
  throw new Error('Direct blockchain payments not supported. Use CrystalPay via /api/payments/subscription/crystalpay');
}

/**
 * Upgrade shop from free to PRO tier
 *
 * @deprecated HD wallet payments removed. Use CrystalPay.
 */
async function upgradeShopToPro() {
  throw new Error('Direct blockchain payments not supported. Use CrystalPay.');
}

/**
 * Check for expired subscriptions and update shop status
 * Run via cron job every hour
 *
 * @returns {Promise<{expired: number, gracePeriod: number, deactivated: number}>}
 */
async function checkExpiredSubscriptions() {
  const client = await pool.connect();

  try {
    // P1-005: Use explicit UTC timestamp to prevent timezone drift
    const nowUTC = new Date().toISOString();

    logger.info('[Subscription] Checking for expired subscriptions...');

    // BUG-FIX: Wrap all UPDATEs in transaction for atomicity
    await client.query('BEGIN');

    // BATCH 1: Active subscriptions expired → Start grace period
    // Single UPDATE with RETURNING instead of N+1 loop
    // FIX H1: Use make_interval instead of string interpolation to prevent SQL injection
    // P1-005: Cast to timestamptz for explicit UTC comparison
    const gracePeriodResult = await client.query(
      `UPDATE shops
       SET subscription_status = 'grace_period',
           grace_period_until = next_payment_due + make_interval(days => $2),
           updated_at = timezone('UTC', NOW())
       WHERE next_payment_due < $1::timestamptz
       AND subscription_status = 'active'
       RETURNING id, name, grace_period_until`,
      [nowUTC, GRACE_PERIOD_DAYS]
    );

    const gracePeriod = gracePeriodResult.rowCount || 0;
    for (const shop of gracePeriodResult.rows) {
      logger.warn(
        `[Subscription] Shop ${shop.id} (${shop.name}) entered grace period until ${shop.grace_period_until.toISOString()}`
      );
    }

    // BATCH 2: Grace period expired → Deactivate
    // Single UPDATE instead of N+1 loop
    // P1-005: Cast to timestamptz for explicit UTC comparison
    // BUG-FIX: Handle NULL grace_period_until (should also be deactivated)
    const deactivatedResult = await client.query(
      `UPDATE shops
       SET is_active = false,
           subscription_status = 'inactive',
           updated_at = timezone('UTC', NOW())
       WHERE subscription_status = 'grace_period'
       AND (grace_period_until IS NULL OR grace_period_until < $1::timestamptz)
       RETURNING id, name`,
      [nowUTC]
    );

    const deactivated = deactivatedResult.rowCount || 0;

    // SECURITY: Remove all workers from deactivated shops
    // Workers should not have access after shop deactivation
    // BUG-FIX: Worker removal is now part of transaction - errors will cause rollback
    for (const shop of deactivatedResult.rows) {
      logger.error(`[Subscription] Shop ${shop.id} (${shop.name}) deactivated after grace period expiry`);
      const removedWorkers = await workerQueries.removeAllByShop(shop.id, client);
      if (removedWorkers.length > 0) {
        logger.info(
          `[Subscription] SECURITY: Removed ${removedWorkers.length} workers from shop ${shop.id} on deactivation`
        );
      }
    }

    // BATCH 3: Mark expired subscription records
    // P1-005: Cast to timestamptz for explicit UTC comparison
    const expiredSubsResult = await client.query(
      `UPDATE shop_subscriptions
       SET status = 'expired'
       WHERE period_end < $1::timestamptz
       AND status = 'active'
       RETURNING id`,
      [nowUTC]
    );

    const expired = expiredSubsResult.rowCount || 0;

    // BUG-FIX: Commit transaction
    await client.query('COMMIT');

    logger.info(
      `[Subscription] Check complete: ${expired} subscriptions expired, ${gracePeriod} in grace period, ${deactivated} deactivated`
    );

    return { expired, gracePeriod, deactivated };
  } catch (error) {
    // BUG-FIX: Rollback transaction on any error
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('[Subscription] Rollback error:', rollbackError);
    }
    logger.error('[Subscription] Error checking expired subscriptions:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deactivate shop after grace period
 *
 * @param {number} shopId - Shop ID
 * @param {object} client - Database client (optional, for transactions)
 */
async function deactivateShop(shopId, client = null) {
  const shouldReleaseClient = !client;
  if (!client) {
    client = await pool.connect();
  }

  try {
    await client.query(
      `UPDATE shops
       SET is_active = false,
           subscription_status = 'inactive',
           updated_at = NOW()
       WHERE id = $1`,
      [shopId]
    );

    // SECURITY: Remove all workers when shop is deactivated
    // Workers should not have access to deactivated shops
    const removedWorkers = await workerQueries.removeAllByShop(shopId, client);
    if (removedWorkers.length > 0) {
      logger.info(
        `[Subscription] SECURITY: Removed ${removedWorkers.length} workers from shop ${shopId} on deactivation`
      );
    }

    logger.warn(`[Subscription] Shop ${shopId} deactivated`);
  } catch (error) {
    logger.error(`[Subscription] Error deactivating shop ${shopId}:`, error);
    throw error;
  } finally {
    if (shouldReleaseClient) {
      client.release();
    }
  }
}

/**
 * Activate free 7-day PRO trial for a new shop
 *
 * @param {number} shopId - Shop ID
 * @param {number} userId - User ID (shop owner)
 * @returns {Promise<{shopId: number, trialEndsAt: Date}>}
 */
async function activateFreeTrial(shopId, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `SELECT has_used_trial FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found for trial activation');
    }

    const userHasUsedTrial = userResult.rows[0].has_used_trial === true;

    // FIX BUG-SUB-003: Check if user already used trial (track by user_id, not shop_id)
    // FIX RACE CONDITION: Lock user's shops with FOR UPDATE to serialize concurrent trial activations
    const trialCheck = await client.query(
      `SELECT id, is_trial, trial_ends_at
       FROM shops
       WHERE owner_id = $1
       FOR UPDATE`,
      [userId]
    );

    // Check if any of user's shops already had a trial
    const alreadyUsedTrial = trialCheck.rows.some(
      (shop) => shop.is_trial === true || shop.trial_ends_at !== null
    );

    if (alreadyUsedTrial || userHasUsedTrial) {
      // Persist flag if historical trial usage detected but flag missing (outside transaction)
      if (!userHasUsedTrial) {
        await pool.query(
          `UPDATE users SET has_used_trial = true, updated_at = NOW() WHERE id = $1`,
          [userId]
        );
      }
      throw new Error('User has already used free trial');
    }

    const now = new Date();
    const trialEnd = addDays(now, TRIAL_PERIOD_DAYS);

    await client.query(
      `UPDATE shops
       SET is_trial = true,
           trial_ends_at = $1,
           tier = 'pro',
           subscription_status = 'active',
           next_payment_due = $1,
           is_active = true,
           updated_at = NOW()
       WHERE id = $2`,
      [trialEnd, shopId]
    );

    await client.query(
      `UPDATE users
       SET has_used_trial = true,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    await client.query('COMMIT');
    logger.info(`[Subscription] Free trial activated for shop ${shopId} until ${trialEnd.toISOString()}`);

    return { shopId, trialEndsAt: trialEnd };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check for expired trials and transition to grace period
 *
 * @returns {Promise<{transitioned: number}>}
 */
async function checkExpiredTrials() {
  const client = await pool.connect();
  try {
    // P1-005: Use explicit UTC timestamp to prevent timezone drift
    const nowUTC = new Date().toISOString();

    // BATCH UPDATE: Expire all trials in single query instead of N+1 loop
    // Keep tier as PRO but mark trial expired - shop enters grace period
    // After grace period, shop will be deactivated until subscription is paid
    // FIX H1: Use make_interval instead of string interpolation to prevent SQL injection
    // P1-005: Cast to timestamptz for explicit UTC comparison
    // BUG-FIX: Add idempotency check - don't re-process already-expired trials
    const result = await client.query(
      `UPDATE shops
       SET is_trial = false,
           subscription_status = 'grace_period',
           grace_period_until = $1::timestamptz + make_interval(days => $2),
           updated_at = timezone('UTC', NOW())
       WHERE is_trial = true
       AND trial_ends_at < $1::timestamptz
       AND subscription_status NOT IN ('grace_period', 'inactive')
       RETURNING id, name, grace_period_until`,
      [nowUTC, GRACE_PERIOD_DAYS]
    );

    const transitioned = result.rowCount || 0;

    // Log each transitioned shop
    for (const shop of result.rows) {
      logger.warn(`[Trial] Shop ${shop.id} (${shop.name}) trial expired, entered grace period until ${shop.grace_period_until.toISOString()}`);
    }

    if (transitioned > 0) {
      logger.info(`[Trial] ${transitioned} trials expired and transitioned to grace period`);
    }

    return { transitioned };
  } catch (error) {
    logger.error('[SubscriptionService] checkExpiredTrials error:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function activatePromoSubscription(shopId, userId, promoCode, targetTier = 'pro', isPermanent = false) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if user already used this promo code (idempotency)
    const promoCheck = await client.query(
      'SELECT id FROM promo_activations WHERE user_id = $1 AND promo_code = $2',
      [userId, promoCode]
    );

    if (promoCheck.rows.length > 0) {
      throw new Error('Promo code already used by this user');
    }

    const shopRes = await client.query(
      'SELECT id, tier, owner_id FROM shops WHERE id = $1 FOR UPDATE',
      [shopId]
    );

    if (shopRes.rows.length === 0) {
      throw new Error('Shop not found');
    }

    if (shopRes.rows[0].owner_id !== userId) {
      throw new Error('User does not own this shop');
    }

    const now = new Date();
    const periodEnd = isPermanent ? null : addDays(now, SUBSCRIPTION_PERIOD_DAYS);
    const promoTx = `promo-${shopId}-${Date.now()}`;

    // Record promo activation for idempotency
    await client.query(
      'INSERT INTO promo_activations (user_id, shop_id, promo_code) VALUES ($1, $2, $3)',
      [userId, shopId, promoCode]
    );

    // FIX BUG-SUB-008: Use ON CONFLICT to prevent race condition
    await client.query(
      `INSERT INTO shop_subscriptions (user_id, shop_id, tier, amount, tx_hash, currency, period_start, period_end, status, verified_at)
       VALUES ($1, $2, $3, 0, $4, 'USDT', $5, $6, 'active', NOW())
       ON CONFLICT (tx_hash) DO NOTHING`,
      [userId, shopId, targetTier, promoTx, now, periodEnd]
    );

    // If permanent (period_end is NULL), set next_payment_due far in future
    const nextPayment = periodEnd || addDays(now, 365 * 100);

    const updatedShop = await client.query(
      `UPDATE shops
       SET tier = $2,
           subscription_status = 'active',
           next_payment_due = $3,
           grace_period_until = NULL,
           registration_paid = true,
           is_active = true,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [shopId, targetTier, nextPayment]
    );

    await client.query('COMMIT');
    return updatedShop.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      logger.error('[Subscription] Promo rollback error:', rollbackError);
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send expiration reminder notifications via Telegram
 * Run via cron job daily at 10:00
 *
 * @param {object} bot - Telegram bot instance
 * @returns {Promise<{reminded: number, sent: number, failed: number}>}
 */
async function sendExpirationReminders(bot) {
  const client = await pool.connect();

  try {
    const now = new Date();

    // Reminders: 3 days before, 1 day before, and on expiration day
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    logger.info('[Subscription] Sending expiration reminders...');

    // Get shops needing reminders
    const shopsResult = await client.query(
      `SELECT s.id, s.name, s.tier, s.next_payment_due, u.telegram_id, u.first_name
       FROM shops s
       JOIN users u ON s.owner_id = u.id
       WHERE s.subscription_status = 'active'
       AND s.next_payment_due BETWEEN $1 AND $2
       AND u.telegram_id IS NOT NULL`,
      [now, threeDaysFromNow]
    );

    let reminded = 0;
    let failed = 0;

    for (const shop of shopsResult.rows) {
      const { id, name, tier, next_payment_due, telegram_id, first_name } = shop;
      const daysUntilExpiry = Math.ceil((next_payment_due - now) / (1000 * 60 * 60 * 24));

      const ownerName = first_name ? `${first_name}` : 'владелец';

      let message = `🔔 <b>Напоминание о подписке</b>\n\n`;
      message += `Привет, ${ownerName}!\n`;
      message += `Магазин: <b>${name}</b>\n`;
      message += `Tier: ${tier === 'max' ? 'MAX' : 'PRO'}\n`;
      message += `Стоимость: $${SUBSCRIPTION_PRICES[tier]}/месяц\n\n`;

      if (daysUntilExpiry <= 0) {
        message += `⚠️ <b>Подписка истекает сегодня!</b>\n`;
      } else if (daysUntilExpiry === 1) {
        message += `⚠️ Подписка истекает завтра!\n`;
      } else {
        message += `Подписка истекает через ${daysUntilExpiry} дня\n`;
      }

      message += `\n💡 Продлите подписку чтобы избежать деактивации магазина.\n`;
      message += `Grace period: 2 дня после истечения.`;

      try {
        await bot.telegram.sendMessage(telegram_id, message, { parse_mode: 'HTML' });
        reminded++;
        logger.info(
          `[Subscription] Reminder sent to shop ${id} (${name}), ${daysUntilExpiry} days until expiry`
        );
      } catch (error) {
        logger.error(`[Subscription] Failed to send reminder to shop ${id}:`, error.message);
        failed++;
      }
    }

    logger.info(`[Subscription] Reminders sent: ${reminded}`);

    return { reminded, sent: reminded, failed };
  } catch (error) {
    logger.error('[Subscription] Error sending expiration reminders:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get subscription status for a shop
 *
 * @param {number} shopId - Shop ID
 * @returns {Promise<object>} Subscription status
 */
async function getSubscriptionStatus(shopId) {
  const shopResult = await pool.query(
    `SELECT id, tier, subscription_status, next_payment_due, grace_period_until, is_active
     FROM shops
     WHERE id = $1`,
    [shopId]
  );

  if (shopResult.rows.length === 0) {
    throw new Error('Shop not found');
  }

  const shop = shopResult.rows[0];

  // Get current active subscription
  // FIX BUG-SUB-005: Handle NULL period_end (permanent promo)
  const subResult = await pool.query(
    `SELECT * FROM shop_subscriptions
     WHERE shop_id = $1
     AND status = 'active'
     AND (period_end IS NULL OR period_end > NOW())
     ORDER BY period_end DESC NULLS FIRST
     LIMIT 1`,
    [shopId]
  );

  const currentSubscription = subResult.rows[0] || null;

  // Also get the latest subscription for renewal (even if expired)
  // This is needed for renewal flow when current subscription has expired
  let latestSubscription = currentSubscription;
  if (!currentSubscription) {
    const latestResult = await pool.query(
      `SELECT * FROM shop_subscriptions
       WHERE shop_id = $1
       ORDER BY period_end DESC
       LIMIT 1`,
      [shopId]
    );
    latestSubscription = latestResult.rows[0] || null;
  }

  return {
    shopId: shop.id,
    tier: shop.tier,
    status: shop.subscription_status,
    isActive: shop.is_active,
    nextPaymentDue: shop.next_payment_due,
    gracePeriodUntil: shop.grace_period_until,
    currentSubscription,
    latestSubscription, // For renewal flow
    price: SUBSCRIPTION_PRICES[shop.tier],
  };
}

/**
 * Get subscription payment history for a shop
 *
 * @param {number} shopId - Shop ID
 * @param {number} userId - Requesting user ID (must own the shop)
 * @param {number} limit - Number of records to return
 * @returns {Promise<array>} Payment history
 */
async function getSubscriptionHistory(shopId, userId, limit = 10) {
  const client = await pool.connect();
  try {
    if (!userId) {
      throw new Error('User ID is required to fetch subscription history');
    }

    // Authorization: ensure requesting user owns the shop
    const shopResult = await client.query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);
    if (shopResult.rows.length === 0) {
      throw new Error('Shop not found');
    }

    const shop = shopResult.rows[0];
    if (shop.owner_id !== userId) {
      throw new Error('Unauthorized access to subscription history');
    }

    const result = await client.query(
      `SELECT * FROM shop_subscriptions
       WHERE shop_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [shopId, limit]
    );

    return result.rows;
  } catch (error) {
    logger.error('[Subscription] Error getting subscription history:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Calculate upgrade cost (helper for API)
 *
 * @param {number} shopId - Shop ID
 * @returns {Promise<object>} Upgrade cost details
 */
async function calculateUpgradeCost(shopId) {
  const shopResult = await pool.query('SELECT tier FROM shops WHERE id = $1', [shopId]);

  if (shopResult.rows.length === 0) {
    throw new Error('Shop not found');
  }

  const shop = shopResult.rows[0];

  // FIX BUG-SUB-007: Make upgrade logic flexible using SUBSCRIPTION_TIERS from config
  const currentTierIndex = SUBSCRIPTION_TIERS.indexOf(shop.tier);

  if (currentTierIndex === -1) {
    throw new Error('Invalid current tier');
  }

  if (currentTierIndex === SUBSCRIPTION_TIERS.length - 1) {
    return {
      alreadyMax: true,
      amount: 0,
      currentTier: shop.tier,
    };
  }

  const newTier = SUBSCRIPTION_TIERS[currentTierIndex + 1];

  // Get current subscription
  const subResult = await pool.query(
    `SELECT * FROM shop_subscriptions
     WHERE shop_id = $1
     AND status = 'active'
     AND (period_end IS NULL OR period_end > NOW())
     ORDER BY period_end DESC NULLS FIRST
     LIMIT 1`,
    [shopId]
  );

  if (subResult.rows.length === 0) {
    throw new Error('No active subscription found');
  }

  const currentSub = subResult.rows[0];

  // Calculate prorated upgrade
  const amount = calculateUpgradeAmount(
    currentSub.period_start,
    currentSub.period_end,
    SUBSCRIPTION_PRICES[shop.tier],
    SUBSCRIPTION_PRICES[newTier]
  );

  return {
    alreadyMax: false,
    amount,
    currentTier: shop.tier,
    newTier,
    periodStart: currentSub.period_start,
    periodEnd: currentSub.period_end,
    remainingDays: Math.ceil((currentSub.period_end - new Date()) / (1000 * 60 * 60 * 24)),
  };
}

/**
 * Get user subscriptions (buyer view)
 * Returns all shops the user is subscribed to for notifications
 * Uses shop_subscribers table (unified subscription system)
 *
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of subscriptions
 */
async function getUserSubscriptions(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT
         ss.id,
         ss.shop_id,
         s.name as shop_name,
         s.description as shop_description,
         s.logo as shop_logo,
         s.is_active as shop_is_active,
         ss.created_at
       FROM shop_subscribers ss
       LEFT JOIN shops s ON ss.shop_id = s.id
       WHERE ss.user_id = $1
       ORDER BY ss.created_at DESC`,
      [userId]
    );

    return rows;
  } catch (error) {
    logger.error('[Subscription] Error getting user subscriptions:', error);
    throw error;
  }
}

/**
 * Get shop subscriptions for current user's shops (seller view)
 * Returns payment subscriptions for shops owned by user
 *
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of shop subscriptions
 */
async function getMyShopSubscriptions(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT
         ss.id,
         ss.shop_id,
         s.name as shop_name,
         s.tier,
         ss.tier as subscription_tier,
         ss.status,
         ss.period_start,
         ss.period_end,
         ss.amount,
         ss.currency,
         ss.verified_at,
         s.is_active,
         s.subscription_status as shop_subscription_status,
         s.next_payment_due,
         s.grace_period_until,
         ss.created_at
       FROM shop_subscriptions ss
       INNER JOIN shops s ON ss.shop_id = s.id
       WHERE s.owner_id = $1
       ORDER BY ss.created_at DESC`,
      [userId]
    );

    return rows;
  } catch (error) {
    logger.error('[Subscription] Error getting shop subscriptions:', error);
    throw error;
  }
}

export {
  processSubscriptionPayment,
  upgradeShopToPro,
  checkExpiredSubscriptions,
  checkExpiredTrials,
  activateFreeTrial,
  deactivateShop,
  sendExpirationReminders,
  getSubscriptionStatus,
  getSubscriptionHistory,
  calculateUpgradeCost,
  calculateUpgradeAmount,
  getUserSubscriptions,
  getMyShopSubscriptions,
  activatePromoSubscription,
  SUBSCRIPTION_PRICES,
  SUBSCRIPTION_PRICES_YEARLY,
  GRACE_PERIOD_DAYS,
};
