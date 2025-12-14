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
import { workerQueries } from '../../../models/workerQueries.js';

// TX hash validation patterns by currency
const TX_HASH_PATTERNS = {
  BTC: /^[a-fA-F0-9]{64}$/,
  LTC: /^[a-fA-F0-9]{64}$/,
  ETH: /^0x[a-fA-F0-9]{64}$/,
  USDT: /^[a-fA-F0-9]{64}$/,  // TRC20 format
};

/**
 * Validate transaction hash format for the given currency
 * @param {string} txHash - Transaction hash to validate
 * @param {string} currency - Currency code (BTC, LTC, ETH, USDT)
 * @returns {boolean} True if valid
 */
function isValidTxHash(txHash, currency) {
  if (!txHash || typeof txHash !== 'string') {return false;}
  const pattern = TX_HASH_PATTERNS[currency?.toUpperCase()];
  if (!pattern) {
    // Unknown currency - accept any hex string 32-128 chars
    return /^(0x)?[a-fA-F0-9]{32,128}$/.test(txHash);
  }
  return pattern.test(txHash);
}

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
  // SECURITY: Validate txHash format before storing in DB
  // CrystalPay uses internal IDs (format: crystalpay_<id>) - skip validation for them
  // =========================================================================
  const isCrystalPay = invoice.chain === 'CRYSTALPAY' || verification.txHash?.startsWith('crystalpay_');

  if (verification.txHash && !isCrystalPay && !isValidTxHash(verification.txHash, invoice.currency)) {
    logger.warn('[SubscriptionPayment] SECURITY: Invalid txHash format rejected', {
      subscriptionId: subscription.id,
      currency: invoice.currency,
      txHashLength: verification.txHash?.length,
      txHashPrefix: verification.txHash?.substring(0, 10),
    });
    return {
      ok: false,
      state: 'failed',
      code: 'INVALID_TX_HASH',
      message: 'Transaction hash format is invalid for the payment currency',
    };
  }

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

    // ISSUE-1 FIX: Check admin_deactivated before upgrade
    const upgradeShopCheck = await client.query(
      'SELECT admin_deactivated FROM shops WHERE id = $1',
      [subscription.shop_id]
    );
    if (upgradeShopCheck.rows[0]?.admin_deactivated === true) {
      logger.warn('[SubscriptionPayment] ISSUE-1 FIX: Upgrade rejected - shop admin deactivated', {
        shopId: subscription.shop_id,
        subscriptionId: subscription.id,
      });
      await markInvoicePaid(client, invoice.id, verification.txHash);
      return {
        ok: false,
        state: 'rejected',
        code: 'SHOP_ADMIN_DEACTIVATED',
        message: 'Shop was forcibly deactivated by admin. Upgrade payment received but not applied. Contact support.',
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
    // BUG-002 FIX: Check if shop was forcibly deactivated by admin
    // If admin_deactivated = true, reject payment reactivation
    const shopResult = await client.query(
      'SELECT tier, is_active, subscription_status, admin_deactivated FROM shops WHERE id = $1',
      [subscription.shop_id]
    );

    if (shopResult.rows.length === 0) {
      return {
        ok: false,
        state: 'failed',
        code: 'SHOP_NOT_FOUND',
        message: `Shop ${subscription.shop_id} not found`,
      };
    }

    const shop = shopResult.rows[0];

    // BUG-002 FIX: Reject if admin forcibly deactivated this shop
    // Late payments after grace period are OK to reactivate, but admin blocks are permanent
    // NOTE: admin_deactivated column is optional - if not present, this check is skipped
    if (shop.admin_deactivated === true) {
      logger.warn('[SubscriptionPayment] BUG-002 FIX: Payment rejected - shop was forcibly deactivated by admin', {
        shopId: subscription.shop_id,
        subscriptionId: subscription.id,
      });

      // Mark invoice as paid (money received) but don't activate
      await markInvoicePaid(client, invoice.id, verification.txHash);

      return {
        ok: false,
        state: 'rejected',
        code: 'SHOP_ADMIN_DEACTIVATED',
        message: 'Shop was forcibly deactivated by admin. Payment received but subscription not activated. Contact support.',
      };
    }

    const currentTier = shop.tier;

    // Log if reactivating after grace period expiry
    if (shop.subscription_status === 'inactive' && shop.is_active === false) {
      logger.info('[SubscriptionPayment] BUG-002 FIX: Reactivating shop after grace period expiry', {
        shopId: subscription.shop_id,
        previousStatus: shop.subscription_status,
      });
    }

    // SECURITY: Check for tier downgrade (MAX -> PRO) and remove workers
    // Workers are only allowed on MAX tier, so they must be removed on downgrade

    if (currentTier === 'max' && subscription.tier === 'pro') {
      logger.info(`[SubscriptionPayment] SECURITY: Tier downgrade detected (MAX -> PRO) for shop ${subscription.shop_id}`);
      try {
        const removedWorkers = await workerQueries.removeAllByShop(subscription.shop_id, client);
        if (removedWorkers.length > 0) {
          logger.info(
            `[SubscriptionPayment] SECURITY: Removed ${removedWorkers.length} workers from shop ${subscription.shop_id} on tier downgrade`
          );
        }
      } catch (workerError) {
        // CRITICAL #2 FIX: Log with SECURITY tag and structured data for alerting
        logger.error('[SubscriptionPayment] SECURITY: Failed to remove workers on downgrade', {
          shopId: subscription.shop_id,
          subscriptionId: subscription.id,
          tier: subscription.tier,
          error: workerError.message,
          stack: workerError.stack,
        });
        // Don't fail the payment - workers will still be blocked by tier check in auth middleware
        // But this needs manual review - workers may have unauthorized access until middleware blocks them
      }
    }

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
    // REGULAR PATH: No shop - activate subscription WITHOUT auto-creating shop
    // User will be prompted to create shop via wizard (better UX)
    // =========================================================================

    // Check if user already has ANY shop that we can link to
    // ISSUE-2 FIX: Include admin_deactivated in SELECT
    const existingShopResult = await client.query(
      `SELECT id, name, is_active, admin_deactivated FROM shops WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [subscription.user_id]
    );

    if (existingShopResult.rows.length > 0) {
      // Use existing shop
      const existingShop = existingShopResult.rows[0];

      // ISSUE-2 FIX: Check admin_deactivated before linking
      if (existingShop.admin_deactivated === true) {
        logger.warn('[SubscriptionPayment] ISSUE-2 FIX: Linking rejected - existing shop admin deactivated', {
          shopId: existingShop.id,
          subscriptionId: subscription.id,
          userId: subscription.user_id,
        });
        await markInvoicePaid(client, invoice.id, verification.txHash);
        return {
          ok: false,
          state: 'rejected',
          code: 'SHOP_ADMIN_DEACTIVATED',
          message: 'Your existing shop was forcibly deactivated by admin. Payment received but subscription not linked. Contact support.',
        };
      }

      logger.info(`[SubscriptionPayment] Linking existing shop ${existingShop.id} to subscription ${subscription.id}`);

      // Update subscription with shop reference
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
          existingShop.id,
          periodStart,
          periodEnd,
          subscription.id,
          verification.txHash,
          invoice.currency,
          invoice.expected_amount,
        ]
      );

      // Update shop's subscription status
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
        [subscription.tier, periodEnd, existingShop.id]
      );
    } else {
      // NO SHOP EXISTS - just activate subscription, let user create shop via wizard
      // This triggers notification with "Setup Shop" button
      logger.info(`[SubscriptionPayment] No shop for user ${subscription.user_id}, activating subscription without shop. User will create via wizard.`);

      await client.query(
        `UPDATE shop_subscriptions
            SET status = 'active',
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
    }
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
