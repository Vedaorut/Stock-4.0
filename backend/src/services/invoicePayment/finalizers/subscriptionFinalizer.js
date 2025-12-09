/**
 * Subscription Payment Finalizer
 *
 * Handles the finalization of subscription payments after verification.
 * This is a CRITICAL money-handling module - changes require careful review.
 *
 * Responsibilities:
 * - Handle upgrade idempotency (tier=pro -> skip)
 * - Handle regular subscription idempotency (status=active/paid -> skip)
 * - Calculate subscription period (periodStart/periodEnd)
 * - Process upgrade path: UPDATE shops tier + subscription
 * - Process regular path with shop_id: UPDATE shops + subscription
 * - Process regular path without shop_id: auto-create shop (race condition safe)
 * - Mark invoice as paid
 * - Update payment status
 *
 * @module invoicePayment/finalizers/subscriptionFinalizer
 */

import { paymentQueries } from '../../../database/queries/index.js';
import { markInvoicePaid } from '../utils/paymentRecords.js';
import { SUBSCRIPTION_PERIOD_DAYS } from '../../../config/subscriptionPricing.js';
import logger from '../../../utils/logger.js';

/**
 * Finalizes a subscription payment after successful verification.
 *
 * This function handles multiple payment scenarios:
 * 1. **Upgrade path**: Upgrades existing shop to 'pro' tier
 * 2. **Regular with shop**: Activates subscription for existing shop
 * 3. **Regular without shop**: Auto-creates shop to prevent money loss
 *
 * Idempotency is ensured - calling multiple times with same data is safe.
 *
 * @param {Object} client - PostgreSQL client (must be in active transaction)
 * @param {Object} options - Finalization options
 * @param {Object} options.subscription - Subscription record
 * @param {number} options.subscription.id - Subscription ID
 * @param {number|null} options.subscription.shop_id - Associated shop ID (may be null)
 * @param {number} options.subscription.user_id - Owner user ID
 * @param {string} options.subscription.tier - Subscription tier ('pro' or 'max')
 * @param {string} options.subscription.status - Current status
 * @param {Object} options.invoice - Invoice record
 * @param {number} options.invoice.id - Invoice ID
 * @param {string} options.invoice.currency - Payment currency
 * @param {number} options.invoice.expected_amount - Expected payment amount
 * @param {Object} options.verification - Payment verification result
 * @param {string} options.verification.txHash - Transaction hash
 * @param {number} options.verification.confirmations - Number of confirmations
 * @param {Object|null} options.payment - Payment record (may be null)
 * @param {string} [options.mode='subscription'] - Payment mode ('subscription' or 'upgrade')
 * @returns {Promise<Object>} Result object with ok, state, and optional error details
 *
 * @example
 * // Regular subscription activation
 * const result = await finalizeSubscriptionPayment(client, {
 *   subscription: { id: 1, shop_id: 10, user_id: 5, tier: 'pro', status: 'pending' },
 *   invoice: { id: 100, currency: 'USDT', expected_amount: 10 },
 *   verification: { txHash: '0x...', confirmations: 6 },
 *   payment: { id: 50, status: 'pending' },
 *   mode: 'subscription'
 * });
 *
 * @example
 * // Upgrade to pro tier
 * const result = await finalizeSubscriptionPayment(client, {
 *   subscription: { id: 1, shop_id: 10, user_id: 5, tier: 'pro', status: 'active' },
 *   invoice: { id: 101, currency: 'USDT', expected_amount: 25 },
 *   verification: { txHash: '0x...', confirmations: 6 },
 *   payment: { id: 51, status: 'pending' },
 *   mode: 'upgrade'
 * });
 */
export async function finalizeSubscriptionPayment(client, { subscription, invoice, verification, payment, mode = 'subscription' }) {
  const isUpgrade = mode === 'upgrade';

  // =========================================================================
  // IDEMPOTENCY CHECK: Upgrade already completed
  // =========================================================================
  if (isUpgrade && subscription.tier === 'max') {
    await markInvoicePaid(client, invoice.id, verification.txHash);
    if (payment?.id && payment.status !== 'confirmed') {
      await paymentQueries.updateStatus(payment.id, 'confirmed', verification.confirmations, client);
    }
    return { ok: true, state: 'confirmed', idempotent: true };
  }

  // =========================================================================
  // IDEMPOTENCY CHECK: Regular subscription already processed
  // =========================================================================
  if (!isUpgrade && ['active', 'paid'].includes(subscription.status)) {
    await markInvoicePaid(client, invoice.id, verification.txHash);
    return { ok: true, state: 'confirmed', idempotent: true };
  }

  // =========================================================================
  // CALCULATE NEW SUBSCRIPTION PERIOD
  // NEW PAYMENT = NEW PERIOD (always start from NOW for subscription payments)
  // =========================================================================
  const now = new Date();
  const currentPeriodEnd = subscription.period_end ? new Date(subscription.period_end) : null;
  const periodStart = currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now;
  if (currentPeriodEnd && currentPeriodEnd > now) {
    logger.info('[SubscriptionPayment] Aligning new period start to current end to prevent overlap', {
      subscriptionId: subscription.id,
      currentPeriodEnd,
      newPeriodStart: periodStart,
    });
  }
  const periodEnd = new Date(
    periodStart.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000
  );

  // =========================================================================
  // UPGRADE PATH: Upgrade existing shop to 'max' tier
  // =========================================================================
  if (isUpgrade) {
    if (!subscription.shop_id) {
      return {
        ok: false,
        state: 'failed',
        code: 'SHOP_NOT_FOUND',
        message: 'Cannot upgrade subscription without an attached shop',
      };
    }

    // Update shop to MAX tier (upgrade is always to MAX)
    // Also clear trial flags in case upgrading from trial
    await client.query(
      `UPDATE shops
          SET tier = 'max',
              subscription_status = 'active',
              next_payment_due = $1,
              grace_period_until = NULL,
              registration_paid = true,
              is_active = true,
              is_trial = false,
              trial_ends_at = NULL,
              updated_at = NOW()
        WHERE id = $2`,
      [periodEnd, subscription.shop_id]
    );

    // Update subscription record to MAX tier
    await client.query(
      `UPDATE shop_subscriptions
          SET status = 'active',
              tier = 'max',
              verified_at = NOW(),
              period_start = $1,
              period_end = $2,
              tx_hash = COALESCE($4, tx_hash),
              currency = $5,
              amount = COALESCE($6, amount)
        WHERE id = $3`,
      [
        periodStart,
        periodEnd,
        subscription.id,
        verification.txHash,
        invoice.currency,
        invoice.expected_amount,
      ]
    );

    await markInvoicePaid(client, invoice.id, verification.txHash);

    if (payment?.id && payment.status !== 'confirmed') {
      await paymentQueries.updateStatus(payment.id, 'confirmed', verification.confirmations, client);
    }

    return { ok: true, state: 'confirmed' };
  }

  // =========================================================================
  // REGULAR PATH: Shop exists - activate subscription
  // (Handles both regular renewal AND trial-to-paid conversion)
  // =========================================================================
  if (subscription.shop_id) {
    // Update shop subscription status
    // is_trial = false converts trial shop to paid
    // trial_ends_at = NULL clears trial expiration
    await client.query(
      `UPDATE shops
          SET tier = $1,
              subscription_status = 'active',
              next_payment_due = $2,
              grace_period_until = NULL,
              registration_paid = true,
              is_active = true,
              is_trial = false,
              trial_ends_at = NULL,
              updated_at = NOW()
        WHERE id = $3`,
      [subscription.tier, periodEnd, subscription.shop_id]
    );

    // Update subscription record
    await client.query(
      `UPDATE shop_subscriptions
          SET status = 'active',
              verified_at = NOW(),
              period_start = $1,
              period_end = $2,
              tx_hash = COALESCE($4, tx_hash),
              currency = $5,
              amount = COALESCE($6, amount)
        WHERE id = $3`,
      [
        periodStart,
        periodEnd,
        subscription.id,
        verification.txHash,
        invoice.currency,
        invoice.expected_amount,
      ]
    );
  } else {
    // =========================================================================
    // REGULAR PATH: No shop - auto-create to avoid money loss
    // =========================================================================

    // Fetch user data for shop name generation
    const userResult = await client.query('SELECT telegram_id, username FROM users WHERE id = $1', [
      subscription.user_id,
    ]);
    const user = userResult.rows[0];
    if (!user) {
      return {
        ok: false,
        state: 'failed',
        code: 'USER_NOT_FOUND',
        message: 'User not found for subscription',
      };
    }

    // =========================================================================
    // RACE CONDITION FIX: Check if user already has an active shop
    // Another concurrent payment might have created a shop already
    // =========================================================================
    const existingShopResult = await client.query(
      `SELECT id, name FROM shops WHERE owner_id = $1 AND is_active = true LIMIT 1`,
      [subscription.user_id]
    );

    let newShop;
    if (existingShopResult.rows.length > 0) {
      // Use existing shop instead of creating duplicate
      newShop = existingShopResult.rows[0];
      logger.info(`[SubscriptionPayment] Using existing shop: ${newShop.id} for user ${subscription.user_id}`);
    } else {
      // Create new shop only if none exists
      const shopName = `Shop_${user.username || user.telegram_id}_${Date.now()}`;
      const shopResult = await client.query(
        `INSERT INTO shops (name, owner_id, tier, subscription_status, registration_paid, is_active)
           VALUES ($1, $2, $3, 'active', true, true)
           RETURNING id, name`,
        [shopName, subscription.user_id, subscription.tier]
      );
      newShop = shopResult.rows[0];
      logger.info(`[SubscriptionPayment] Created new shop: ${newShop.id} for user ${subscription.user_id}`);
    }

    // Update subscription with the shop reference
    await client.query(
      `UPDATE shop_subscriptions
          SET shop_id = $1,
              status = 'active',
              period_start = $2,
              period_end = $3,
              tx_hash = COALESCE($5, tx_hash),
              currency = $6,
              amount = COALESCE($7, amount)
        WHERE id = $4`,
      [
        newShop.id,
        periodStart,
        periodEnd,
        subscription.id,
        verification.txHash,
        invoice.currency,
        invoice.expected_amount,
      ]
    );

    // Update shop's next payment due
    await client.query(
      `UPDATE shops SET next_payment_due = $1, updated_at = NOW() WHERE id = $2`,
      [periodEnd, newShop.id]
    );
  }

  // =========================================================================
  // FINALIZE: Mark invoice as paid and update payment status
  // =========================================================================
  await markInvoicePaid(client, invoice.id, verification.txHash);

  if (payment?.id && payment.status !== 'confirmed') {
    await paymentQueries.updateStatus(payment.id, 'confirmed', verification.confirmations, client);
  }

  return { ok: true, state: 'confirmed' };
}
