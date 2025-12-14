/**
 * Subscription Invoice Service
 *
 * Handles invoice generation for shop subscription payments via CrystalPay.
 * CrystalPay is a hosted payment gateway - no wallet addresses needed.
 */

import logger from '../utils/logger.js';
import * as crystalPayService from './crystalPayService.js';
import { query, pool } from '../config/database.js';
import { SUBSCRIPTION_PRICES } from '../config/subscriptionPricing.js';
import { INVOICE_PURPOSES } from '../constants/invoice.js';
import { INVOICE_EXPIRY_SECONDS } from '../config/payments.js';


/**
 * Find active (pending, not expired) invoice for subscription
 *
 * @param {number} subscriptionId - Shop subscription ID
 * @param {string|null} purpose - Optional invoice purpose filter
 * @returns {Promise<object|null>} Invoice or null
 */
export async function findActiveInvoiceForSubscription(subscriptionId, purpose = null) {
  try {
    logger.debug('[SubscriptionInvoice] Searching for active invoice', {
      subscriptionId,
      purpose,
      searchConditions: {
        status: 'pending',
        expires_at: 'must be > NOW()',
      },
    });

    const params = [subscriptionId];
    let purposeFilter = '';

    if (purpose) {
      purposeFilter = 'AND purpose = $2';
      params.push(purpose);
    }

    // Main query - Relaxed to include PAID invoices so the UI doesn't crash after payment
    const result = await query(
      `SELECT * FROM invoices
       WHERE subscription_id = $1
       ${purposeFilter}
       AND (
        (status = 'pending' AND expires_at > timezone('utc', NOW()))
         OR
         status IN ('paid', 'confirmed')
       )
       ORDER BY created_at DESC
       LIMIT 1`,
      params
    );

    if (result.rows.length === 0) {
      logger.warn('[SubscriptionInvoice] No active invoice found - running diagnostics', {
        subscriptionId,
      });

      // Diagnostic query: find ALL invoices for this subscription
      const diagnosticResult = await query(
        `SELECT 
          id, 
          status, 
          expires_at, 
          NOW() as current_time,
          (expires_at > NOW()) as is_valid,
          EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry,
          created_at
        FROM invoices 
        WHERE subscription_id = $1
        ${purposeFilter}
        ORDER BY created_at DESC
        LIMIT 5`,
        params
      );

      if (diagnosticResult.rows.length === 0) {
        logger.warn('[SubscriptionInvoice] No invoices exist for this subscription', {
          subscriptionId,
          reason: 'No invoices created yet',
        });
      } else {
        // Analyze why invoice didn't pass conditions
        diagnosticResult.rows.forEach((inv, index) => {
          const reasons = [];
          if (inv.status !== 'pending') {
            reasons.push(`status=${inv.status} (not 'pending')`);
          }
          if (!inv.is_valid) {
            reasons.push(`expired ${Math.abs(inv.seconds_until_expiry).toFixed(0)}s ago`);
          }

          logger.warn('[SubscriptionInvoice] Invoice found but not active', {
            subscriptionId,
            invoiceId: inv.id,
            index,
            status: inv.status,
            expiresAt: inv.expires_at,
            currentTime: inv.current_time,
            isValid: inv.is_valid,
            secondsUntilExpiry: parseFloat(inv.seconds_until_expiry).toFixed(2),
            createdAt: inv.created_at,
            reasons: reasons.length > 0 ? reasons.join(', ') : 'Active and valid',
          });
        });
      }

      return null;
    }

    const invoice = result.rows[0];

    logger.info('[SubscriptionInvoice] Found active invoice', {
      subscriptionId,
      invoiceId: invoice.id,
      address: invoice.address,
      expiresAt: invoice.expires_at,
      status: invoice.status,
    });

    return invoice;
  } catch (error) {
    // P0-5 FIX: Throw error instead of silent null return
    logger.error('[SubscriptionInvoice] Error finding active invoice:', {
      error: error.message,
      stack: error.stack,
      subscriptionId,
    });
    // Re-throw so caller knows there was a DB error (not "no invoice")
    throw error;
  }
}

/**
 * Create CrystalPay invoice for subscription payment
 *
 * BUG-003 FIX: Uses FOR UPDATE lock and checks for existing pending invoice
 * to prevent duplicate invoices from concurrent requests.
 *
 * @param {Object} params
 * @param {number} params.subscriptionId - Subscription ID
 * @param {string} params.purpose - Payment purpose (subscription_new, subscription_renewal, subscription_upgrade)
 * @param {number} params.amountUsd - Amount in USD
 * @param {string} params.method - Payment method: 'BITCOIN' or 'LITECOIN'
 * @returns {Promise<{invoiceId: number, paymentUrl: string, crystalPayId: string}>}
 */
export async function createCrystalPayInvoice({ subscriptionId, purpose, amountUsd, method = 'BITCOIN' }) {
  // Validate method
  if (!['BITCOIN', 'LITECOIN'].includes(method)) {
    throw new Error(`Invalid payment method: ${method}`);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // BUG-003 FIX: Lock subscription row to serialize concurrent requests
    const lockResult = await client.query(
      'SELECT id FROM shop_subscriptions WHERE id = $1 FOR UPDATE',
      [subscriptionId]
    );

    if (lockResult.rows.length === 0) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    // BUG-003 FIX: Check for existing pending invoice with same purpose
    const existingInvoice = await client.query(
      `SELECT i.*, i.crystalpay_id
       FROM invoices i
       WHERE i.subscription_id = $1
       AND i.purpose = $2
       AND i.status = 'pending'
       AND i.expires_at > timezone('utc', NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [subscriptionId, purpose]
    );

    // If pending invoice exists and has CrystalPay ID, return it (idempotent)
    if (existingInvoice.rows.length > 0 && existingInvoice.rows[0].crystalpay_id) {
      const existing = existingInvoice.rows[0];
      await client.query('COMMIT');

      logger.info('[SubscriptionInvoice] Returning existing pending invoice (race condition prevented)', {
        subscriptionId,
        invoiceId: existing.id,
        crystalPayId: existing.crystalpay_id,
        purpose,
      });

      // Fetch payment URL from CrystalPay
      const crystalInfo = await crystalPayService.getInvoiceInfo(existing.crystalpay_id);

      return {
        invoiceId: existing.id,
        paymentUrl: crystalInfo.url,
        crystalPayId: existing.crystalpay_id,
        amount: existing.expected_amount,
        method,
        reused: true, // Flag to indicate this was an existing invoice
      };
    }

    // 1. Create our internal invoice record (within transaction)
    const invoiceResult = await client.query(
      `INSERT INTO invoices (subscription_id, chain, address, address_index,
       expected_amount, currency, expires_at, status, purpose)
       VALUES ($1, 'CRYSTALPAY', NULL, NULL, $2, $3, NOW() + make_interval(secs => $5), 'pending', $4)
       RETURNING *`,
      [subscriptionId, amountUsd, 'USD', purpose, INVOICE_EXPIRY_SECONDS]
    );
    const invoice = invoiceResult.rows[0];

    // 2. Create CrystalPay invoice
    // CrystalPay lifetime is in SECONDS (see crystalPayService.js docs)
    let crystalInvoice;
    try {
      crystalInvoice = await crystalPayService.createInvoice({
        amount: amountUsd,
        method,
        description: `Subscription #${subscriptionId} - ${purpose}`,
        extra: String(invoice.id), // Link back to our invoice
        lifetime: INVOICE_EXPIRY_SECONDS
      });
    } catch (crystalError) {
      // Mark invoice as failed before rollback
      await client.query(
        'UPDATE invoices SET status = $2 WHERE id = $1',
        [invoice.id, 'failed']
      );
      throw crystalError;
    }

    // 3. Update our invoice with CrystalPay ID
    await client.query(
      'UPDATE invoices SET crystalpay_id = $2 WHERE id = $1',
      [invoice.id, crystalInvoice.id]
    );

    await client.query('COMMIT');

    logger.info('[SubscriptionInvoice] CrystalPay invoice created', {
      invoiceId: invoice.id,
      crystalPayId: crystalInvoice.id,
      method,
      amountUsd
    });

    return {
      invoiceId: invoice.id,
      paymentUrl: crystalInvoice.url,
      crystalPayId: crystalInvoice.id,
      amount: amountUsd,
      method
    };

  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('[SubscriptionInvoice] Rollback error:', rollbackError);
    }

    logger.error('[SubscriptionInvoice] CrystalPay invoice creation failed', {
      subscriptionId,
      purpose,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
}

// Re-export INVOICE_PURPOSES for backward compatibility with controllers
export { INVOICE_PURPOSES };

// Re-export PAYMENT_METHODS from crystalPayService
export { PAYMENT_METHODS } from './crystalPayService.js';

export default {
  createCrystalPayInvoice,
  findActiveInvoiceForSubscription,
  SUBSCRIPTION_PRICES,
  INVOICE_PURPOSES,
};
