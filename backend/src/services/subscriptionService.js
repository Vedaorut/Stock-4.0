/**
 * Subscription Service
 *
 * Handles recurring monthly subscriptions for shops:
 * - Free tier: $25/month
 * - PRO tier: $35/month
 * - Grace period: 2 days after expiration
 * - Auto-deactivation after grace period
 */

import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import * as cryptoService from './crypto.js';

// Subscription pricing
const SUBSCRIPTION_PRICES = {
  free: 25.00,
  pro: 35.00
};

// Grace period in days
const GRACE_PERIOD_DAYS = 2;

// Subscription period in days
const SUBSCRIPTION_PERIOD_DAYS = 30;

/**
 * Process subscription payment
 * Verifies crypto transaction and creates subscription record
 * 
 * @param {number} shopId - Shop ID
 * @param {string} tier - Subscription tier ('free' or 'pro')
 * @param {string} txHash - Blockchain transaction hash
 * @param {string} currency - Cryptocurrency (BTC, ETH, USDT, TON)
 * @param {string} expectedAddress - Expected payment address
 * @returns {Promise<object>} Subscription record
 */
async function processSubscriptionPayment(shopId, tier, txHash, currency, expectedAddress) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Validate tier
    if (!['free', 'pro'].includes(tier)) {
      throw new Error('Invalid subscription tier');
    }
    
    const amount = SUBSCRIPTION_PRICES[tier];
    
    // Verify transaction on blockchain
    logger.info(`[Subscription] Verifying ${currency} transaction ${txHash}`);
    const verification = await cryptoService.verifyTransaction(
      txHash,
      amount,
      currency,
      expectedAddress
    );
    
    if (!verification.verified) {
      logger.error(`[Subscription] Transaction verification failed: ${verification.error}`);
      throw new Error(verification.error || 'Transaction verification failed');
    }
    
    // Check for duplicate tx_hash
    const duplicateCheck = await client.query(
      'SELECT id FROM shop_subscriptions WHERE tx_hash = $1',
      [txHash]
    );
    
    if (duplicateCheck.rows.length > 0) {
      throw new Error('Transaction already processed');
    }
    
    // Calculate subscription period
    const now = new Date();
    const periodStart = now;
    const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const nextPaymentDue = periodEnd;
    
    // Create subscription record
    const subscriptionResult = await client.query(
      `INSERT INTO shop_subscriptions 
       (shop_id, tier, amount, tx_hash, currency, period_start, period_end, status, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
       RETURNING *`,
      [shopId, tier, amount, txHash, currency, periodStart, periodEnd]
    );
    
    const subscription = subscriptionResult.rows[0];
    
    // Update shop record
    await client.query(
      `UPDATE shops 
       SET tier = $1,
           subscription_status = 'active',
           next_payment_due = $2,
           grace_period_until = NULL,
           registration_paid = true,
           is_active = true,
           updated_at = NOW()
       WHERE id = $3`,
      [tier, nextPaymentDue, shopId]
    );
    
    await client.query('COMMIT');
    
    logger.info(`[Subscription] Subscription created for shop ${shopId}, tier: ${tier}, period: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);
    
    return subscription;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[Subscription] Error processing subscription payment:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Upgrade shop from free to PRO tier
 * Calculates prorated amount based on remaining time
 * 
 * @param {number} shopId - Shop ID
 * @param {string} txHash - Blockchain transaction hash for upgrade payment
 * @param {string} currency - Cryptocurrency
 * @param {string} expectedAddress - Expected payment address
 * @returns {Promise<object>} Upgraded subscription record
 */
async function upgradeShopToPro(shopId, txHash, currency, expectedAddress) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get current shop and subscription
    const shopResult = await client.query(
      'SELECT * FROM shops WHERE id = $1',
      [shopId]
    );
    
    if (shopResult.rows.length === 0) {
      throw new Error('Shop not found');
    }
    
    const shop = shopResult.rows[0];
    
    if (shop.tier === 'pro') {
      throw new Error('Shop is already PRO');
    }
    
    // Get current active subscription
    const currentSubResult = await client.query(
      `SELECT * FROM shop_subscriptions 
       WHERE shop_id = $1 
       AND status = 'active'
       AND period_end > NOW()
       ORDER BY period_end DESC
       LIMIT 1`,
      [shopId]
    );
    
    if (currentSubResult.rows.length === 0) {
      throw new Error('No active subscription found. Please renew subscription first.');
    }
    
    const currentSub = currentSubResult.rows[0];
    
    // Calculate prorated upgrade amount
    const upgradeAmount = calculateUpgradeAmount(
      currentSub.period_start,
      currentSub.period_end,
      SUBSCRIPTION_PRICES.free,
      SUBSCRIPTION_PRICES.pro
    );
    
    logger.info(`[Subscription] Upgrade amount calculated: $${upgradeAmount} (prorated)`);
    
    // Verify transaction
    const verification = await cryptoService.verifyTransaction(
      txHash,
      upgradeAmount,
      currency,
      expectedAddress
    );
    
    if (!verification.verified) {
      throw new Error(verification.error || 'Transaction verification failed');
    }
    
    // Check for duplicate tx_hash
    const duplicateCheck = await client.query(
      'SELECT id FROM shop_subscriptions WHERE tx_hash = $1',
      [txHash]
    );
    
    if (duplicateCheck.rows.length > 0) {
      throw new Error('Transaction already processed');
    }
    
    // Create PRO subscription record (replaces current subscription period)
    const subscriptionResult = await client.query(
      `INSERT INTO shop_subscriptions 
       (shop_id, tier, amount, tx_hash, currency, period_start, period_end, status, verified_at)
       VALUES ($1, 'pro', $2, $3, $4, $5, $6, 'active', NOW())
       RETURNING *`,
      [shopId, upgradeAmount, txHash, currency, currentSub.period_start, currentSub.period_end]
    );
    
    const newSubscription = subscriptionResult.rows[0];
    
    // Mark old subscription as cancelled
    await client.query(
      `UPDATE shop_subscriptions 
       SET status = 'cancelled'
       WHERE id = $1`,
      [currentSub.id]
    );
    
    // Update shop to PRO tier
    await client.query(
      `UPDATE shops 
       SET tier = 'pro',
           updated_at = NOW()
       WHERE id = $1`,
      [shopId]
    );
    
    await client.query('COMMIT');
    
    logger.info(`[Subscription] Shop ${shopId} upgraded to PRO tier`);
    
    return newSubscription;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[Subscription] Error upgrading shop to PRO:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Calculate prorated upgrade amount
 * 
 * @param {Date} periodStart - Subscription period start
 * @param {Date} periodEnd - Subscription period end
 * @param {number} oldPrice - Old tier price
 * @param {number} newPrice - New tier price
 * @returns {number} Prorated upgrade amount
 */
function calculateUpgradeAmount(periodStart, periodEnd, oldPrice, newPrice) {
  const now = new Date();
  const totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
  const remainingDays = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
  
  // Prorated difference
  const dailyDifference = (newPrice - oldPrice) / totalDays;
  const upgradeAmount = dailyDifference * remainingDays;
  
  // Round to 2 decimal places
  return Math.max(0.01, Math.round(upgradeAmount * 100) / 100);
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
    const now = new Date();
    
    logger.info('[Subscription] Checking for expired subscriptions...');
    
    // Get shops with payment due
    const shopsResult = await client.query(
      `SELECT id, name, tier, next_payment_due, grace_period_until, subscription_status
       FROM shops
       WHERE next_payment_due < $1
       AND subscription_status != 'inactive'`,
      [now]
    );
    
    let expired = 0;
    let gracePeriod = 0;
    let deactivated = 0;
    
    for (const shop of shopsResult.rows) {
      const { id, name, next_payment_due, grace_period_until, subscription_status } = shop;
      
      // Case 1: Active subscription expired → Start grace period
      if (subscription_status === 'active') {
        const gracePeriodEnd = new Date(next_payment_due.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
        
        await client.query(
          `UPDATE shops 
           SET subscription_status = 'grace_period',
               grace_period_until = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [gracePeriodEnd, id]
        );
        
        logger.warn(`[Subscription] Shop ${id} (${name}) entered grace period until ${gracePeriodEnd.toISOString()}`);
        gracePeriod++;
      }
      
      // Case 2: Grace period expired → Deactivate
      else if (subscription_status === 'grace_period' && grace_period_until && grace_period_until < now) {
        await deactivateShop(id, client);
        logger.error(`[Subscription] Shop ${id} (${name}) deactivated after grace period expiry`);
        deactivated++;
      }
    }
    
    // Mark expired subscription records
    const expiredSubsResult = await client.query(
      `UPDATE shop_subscriptions
       SET status = 'expired'
       WHERE period_end < $1
       AND status = 'active'
       RETURNING id`,
      [now]
    );
    
    expired = expiredSubsResult.rowCount || 0;
    
    logger.info(`[Subscription] Check complete: ${expired} subscriptions expired, ${gracePeriod} in grace period, ${deactivated} deactivated`);
    
    return { expired, gracePeriod, deactivated };
  } catch (error) {
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
 * Send expiration reminder notifications via Telegram
 * Run via cron job daily at 10:00
 * 
 * @param {object} bot - Telegram bot instance
 * @returns {Promise<{reminded: number}>}
 */
async function sendExpirationReminders(bot) {
  const client = await pool.connect();
  
  try {
    const now = new Date();
    
    // Reminders: 3 days before, 1 day before, and on expiration day
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow actually
    
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
    
    for (const shop of shopsResult.rows) {
      const { id, name, tier, next_payment_due, telegram_id, first_name } = shop;
      const daysUntilExpiry = Math.ceil((next_payment_due - now) / (1000 * 60 * 60 * 24));
      
      let message = `🔔 <b>Напоминание о подписке</b>\n\n`;
      message += `Магазин: <b>${name}</b>\n`;
      message += `Tier: ${tier === 'pro' ? 'PRO' : 'Free'}\n`;
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
        logger.info(`[Subscription] Reminder sent to shop ${id} (${name}), ${daysUntilExpiry} days until expiry`);
      } catch (error) {
        logger.error(`[Subscription] Failed to send reminder to shop ${id}:`, error.message);
      }
    }
    
    logger.info(`[Subscription] Reminders sent: ${reminded}`);
    
    return { reminded };
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
  const client = await pool.connect();
  
  try {
    const shopResult = await client.query(
      `SELECT id, tier, subscription_status, next_payment_due, grace_period_until, is_active
       FROM shops
       WHERE id = $1`,
      [shopId]
    );
    
    if (shopResult.rows.length === 0) {
      throw new Error('Shop not found');
    }
    
    const shop = shopResult.rows[0];
    
    // Get current subscription
    const subResult = await client.query(
      `SELECT * FROM shop_subscriptions
       WHERE shop_id = $1
       AND status = 'active'
       AND period_end > NOW()
       ORDER BY period_end DESC
       LIMIT 1`,
      [shopId]
    );
    
    const currentSubscription = subResult.rows[0] || null;
    
    return {
      shopId: shop.id,
      tier: shop.tier,
      status: shop.subscription_status,
      isActive: shop.is_active,
      nextPaymentDue: shop.next_payment_due,
      gracePeriodUntil: shop.grace_period_until,
      currentSubscription,
      price: SUBSCRIPTION_PRICES[shop.tier]
    };
  } catch (error) {
    logger.error('[Subscription] Error getting subscription status:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get subscription payment history for a shop
 * 
 * @param {number} shopId - Shop ID
 * @param {number} limit - Number of records to return
 * @returns {Promise<array>} Payment history
 */
async function getSubscriptionHistory(shopId, limit = 10) {
  const client = await pool.connect();
  
  try {
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
  const client = await pool.connect();
  
  try {
    const shopResult = await client.query(
      'SELECT tier FROM shops WHERE id = $1',
      [shopId]
    );
    
    if (shopResult.rows.length === 0) {
      throw new Error('Shop not found');
    }
    
    const shop = shopResult.rows[0];
    
    if (shop.tier === 'pro') {
      return {
        alreadyPro: true,
        amount: 0
      };
    }
    
    // Get current subscription
    const subResult = await client.query(
      `SELECT * FROM shop_subscriptions
       WHERE shop_id = $1
       AND status = 'active'
       AND period_end > NOW()
       ORDER BY period_end DESC
       LIMIT 1`,
      [shopId]
    );
    
    if (subResult.rows.length === 0) {
      throw new Error('No active subscription found');
    }
    
    const currentSub = subResult.rows[0];
    
    const amount = calculateUpgradeAmount(
      currentSub.period_start,
      currentSub.period_end,
      SUBSCRIPTION_PRICES.free,
      SUBSCRIPTION_PRICES.pro
    );
    
    return {
      alreadyPro: false,
      amount,
      currentTier: 'free',
      newTier: 'pro',
      periodStart: currentSub.period_start,
      periodEnd: currentSub.period_end,
      remainingDays: Math.ceil((currentSub.period_end - new Date()) / (1000 * 60 * 60 * 24))
    };
  } catch (error) {
    logger.error('[Subscription] Error calculating upgrade cost:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get user subscriptions (buyer view)
 * Returns all shops the user is subscribed to
 *
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of subscriptions
 */
async function getUserSubscriptions(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT
         s.id as shop_id,
         s.name as shop_name,
         s.tier,
         u.username as seller_username,
         u.first_name as seller_first_name,
         sub.created_at as subscribed_at
       FROM subscriptions sub
       JOIN shops s ON sub.shop_id = s.id
       JOIN users u ON s.owner_id = u.id
       WHERE sub.user_id = $1
       ORDER BY sub.created_at DESC`,
      [userId]
    );

    return rows;
  } catch (error) {
    logger.error('[Subscription] Error getting user subscriptions:', error);
    throw error;
  }
}

export {
  processSubscriptionPayment,
  upgradeShopToPro,
  checkExpiredSubscriptions,
  deactivateShop,
  sendExpirationReminders,
  getSubscriptionStatus,
  getSubscriptionHistory,
  calculateUpgradeCost,
  calculateUpgradeAmount,
  getUserSubscriptions,
  SUBSCRIPTION_PRICES,
  GRACE_PERIOD_DAYS
};
