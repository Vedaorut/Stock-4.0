/**
 * Subscription Invoice Service
 *
 * Handles invoice generation for shop subscription payments via CrystalPay.
 * CrystalPay is a hosted payment gateway - no wallet addresses needed.
 */

import logger from '../utils/logger.js';
import * as crystalPayService from './crystalPayService.js';
import { invoiceQueries } from '../database/queries/index.js';
import { query } from '../config/database.js';
import { SUBSCRIPTION_PRICES } from '../config/subscriptionPricing.js';
import { INVOICE_PURPOSES } from '../constants/invoice.js';


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
         (status = 'pending' AND expires_at > NOW())
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
    logger.error('[SubscriptionInvoice] Error finding active invoice:', {
      error: error.message,
      stack: error.stack,
      subscriptionId,
    });
    return null;
  }
}

/**
 * Create CrystalPay invoice for subscription payment
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

  // 1. Create our internal invoice record first
  const invoice = await invoiceQueries.createForCrystalPay({
    subscriptionId,
    purpose,
    currency: 'USD',
    amount: amountUsd,
  });

  try {
    // 2. Create CrystalPay invoice
    // NOTE: CrystalPay lifetime is in MINUTES, not seconds!
    const crystalInvoice = await crystalPayService.createInvoice({
      amount: amountUsd,
      method,
      description: `Subscription #${subscriptionId} - ${purpose}`,
      extra: String(invoice.id), // Link back to our invoice
      lifetime: 60 // 60 minutes = 1 hour
    });

    // 3. Update our invoice with CrystalPay ID
    await invoiceQueries.setCrystalPayId(invoice.id, crystalInvoice.id);

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
    // If CrystalPay fails, mark our invoice as failed
    logger.error('[SubscriptionInvoice] CrystalPay invoice creation failed', {
      invoiceId: invoice.id,
      error: error.message
    });
    throw error;
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
