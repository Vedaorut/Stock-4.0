/**
 * Subscription Payment Processor
 *
 * Two-phase payment processing:
 *
 * PHASE 1 (Outside transaction):
 * - Invoice lookup via pool (fast, no locks)
 * - Preliminary status checks (optimistic exit)
 * - CrystalPay verification (trust gateway)
 * - Non-CrystalPay returns UNSUPPORTED_CHAIN
 *
 * PHASE 2 (Atomic transaction):
 * - Lock subscription (FOR UPDATE)
 * - Re-lock and validate invoice
 * - Guard TX reuse
 * - Attach payment record
 * - Check confirmations
 * - Finalize subscription payment
 * - Notify (OUTSIDE transaction)
 *
 * CRITICAL: Money-handling code. Changes require thorough review.
 *
 * @module invoicePayment/processors/subscriptionProcessor
 */

import { getClient, query } from '../../../config/database.js';
import { validateAndLockSubscription } from '../validators/index.js';
import {
  ensureInvoiceActive,
  guardTxReuse,
  attachPaymentRecord,
  markInvoicePaid,
} from '../utils/index.js';
import { finalizeSubscriptionPayment } from '../finalizers/index.js';
import { notifySubscriptionActivated } from '../notifications/index.js';
import { INVOICE_PURPOSES, INVOICE_STATES } from '../../../constants/invoice.js';
import { ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import { broadcast } from '../../../utils/websocket.js';

/**
 * Process crypto payment for a shop subscription using invoice as single source of truth.
 *
 * @param {Object} params - Payment parameters
 * @param {number} params.subscriptionId - Subscription ID to process payment for
 * @param {string} [params.txHash] - Transaction hash (if available)
 * @param {string} [params.paymentLink] - Payment link (unused, kept for API compat)
 * @param {number} [params.actorUserId] - User performing the action
 * @param {string} [params.mode] - Payment mode: 'subscription' or 'upgrade'
 * @param {number} [params.invoiceId] - Specific invoice ID to process
 * @param {string} [params.purpose] - Invoice purpose filter
 * @param {boolean} [params.webhookVerified] - True if called from verified webhook (signature checked)
 * @returns {Promise<Object>} Payment result with ok, state, and optional message
 */
export async function processSubscriptionPayment({
  subscriptionId,
  txHash,
  paymentLink: _paymentLink,
  actorUserId,
  mode = null,
  invoiceId = null,
  purpose = null,
  webhookVerified = false,
}) {
  // =========================================================================
  // PHASE 1: VERIFICATION (Outside transaction, no locks)
  // =========================================================================

  // 1.1. Find relevant Invoice using pool (query) for fast lookup
  let invoiceFilter = 'subscription_id = $1';
  const invoiceParams = [subscriptionId];

  if (invoiceId) {
    invoiceFilter += ` AND id = $${invoiceParams.length + 1}`;
    invoiceParams.push(invoiceId);
  } else if (purpose) {
    invoiceFilter += ` AND purpose = $${invoiceParams.length + 1}`;
    invoiceParams.push(purpose);
  }

  // Using query() from pool (NOT client.query in transaction)
  const invoiceResult = await query(
    `SELECT * FROM invoices WHERE ${invoiceFilter} ORDER BY created_at DESC LIMIT 1`,
    invoiceParams
  );

  if (invoiceResult.rows.length === 0) {
    throw new ValidationError('Invoice not found');
  }

  const invoice = invoiceResult.rows[0];
  const invoicePurpose = invoice.purpose || INVOICE_PURPOSES.SUBSCRIPTION;
  const effectiveMode =
    mode || (invoicePurpose === INVOICE_PURPOSES.UPGRADE ? 'upgrade' : 'subscription');

  if (mode && mode === 'upgrade' && invoicePurpose !== INVOICE_PURPOSES.UPGRADE) {
    throw new ValidationError('Upgrade payment requested but invoice purpose mismatches');
  }

  // 1.2. Preliminary status check (Optimistic exit)
  if (invoice.status !== INVOICE_STATES.PENDING) {
    return {
      ok: true,
      state: 'already_processed',
      message: `Invoice status is ${invoice.status}`,
    };
  }

  // Preliminary expiration check
  if (new Date(invoice.expires_at) < new Date()) {
    return {
      ok: false,
      state: 'expired',
      code: 'INVOICE_EXPIRED',
      message: 'Invoice expired',
    };
  }

  // 1.3. CrystalPay verification: MUST come from verified webhook OR have paid status
  const isCrystalPay = invoice.chain === 'CRYSTALPAY';
  const verifiedTxHash = txHash;
  let verification;

  if (isCrystalPay) {
    // SECURITY: CrystalPay payments require verification from one of two sources:
    // 1. webhookVerified=true - Called from webhook handler after signature verification
    // 2. invoice.status='paid' - Already processed by webhook previously
    //
    // Without this guard, attacker could call manual confirmation endpoint with
    // {"txHash": "fake"} and get free subscription activation.
    const isWebhookCall = webhookVerified === true;
    const isAlreadyPaid = invoice.status === INVOICE_STATES.PAID;

    if (!isWebhookCall && !isAlreadyPaid) {
      logger.warn(
        `[InvoicePayment] SECURITY: CrystalPay invoice ${invoice.id} - blocked manual confirmation attempt. ` +
        `webhookVerified=${webhookVerified}, status=${invoice.status}`
      );
      return {
        ok: false,
        state: 'pending',
        code: 'PAYMENT_NOT_VERIFIED',
        message: 'CrystalPay payment must be confirmed by webhook. Please wait or check payment status.',
      };
    }

    // Safe to proceed - either webhook call or already paid
    logger.info(
      `[InvoicePayment] CrystalPay invoice ${invoice.id} - verification passed ` +
      `(webhookVerified=${isWebhookCall}, status=${invoice.status})`
    );

    // Create verification object
    verification = {
      verified: true,
      txHash: invoice.tx_hash || verifiedTxHash || txHash,
      amount: parseFloat(invoice.crypto_amount) || parseFloat(invoice.expected_amount),
      currency: invoice.currency || invoice.chain,
      status: 'confirmed',
      confirmations: 0,
    };
  } else {
    // HD wallet blockchain verification removed - only CrystalPay payments supported
    logger.error(
      `[InvoicePayment] Non-CrystalPay invoice ${invoice.id} - blockchain verification not available`
    );
    return {
      ok: false,
      state: 'failed',
      code: 'UNSUPPORTED_CHAIN',
      message: 'Direct blockchain payments not supported. Use CrystalPay.',
    };
  }

  // =========================================================================
  // PHASE 2: FINALIZATION (Atomic transaction with locks)
  // =========================================================================

  logger.info(`[InvoicePayment] Phase 2: Starting transaction for invoice ${invoice.id}...`);
  const client = await getClient();

  try {
    // Using READ COMMITTED (default). SERIALIZABLE was overkill.
    await client.query('BEGIN');

    // 2.1. Set short lock_timeout ("Fail Fast")
    // If we can't get lock within 5 seconds, better to quickly return error
    await client.query("SET LOCAL lock_timeout = '5s'");

    // 2.2. Lock and get subscription (FOR UPDATE)
    const subscription = await validateAndLockSubscription(client, subscriptionId, actorUserId);

    // 2.3. CRITICAL: Lock and re-check Invoice status
    // While we were verifying (Phase 1), another process may have processed this invoice
    const currentInvoiceResult = await client.query(
      'SELECT * FROM invoices WHERE id = $1 FOR UPDATE',
      [invoice.id]
    );
    const currentInvoice = currentInvoiceResult.rows[0];

    // Check activity and handle expiration atomically
    const activity = await ensureInvoiceActive(currentInvoice, client);

    if (!activity.active) {
      // If invoice already paid - rollback and return success (idempotency)
      // If expired - commit the EXPIRED status update and return error
      if (activity.reason === 'already_paid') {
        await client.query('ROLLBACK');
        return {
          ok: true,
          state: 'already_processed',
          idempotent: true,
          message: 'Invoice processed concurrently',
        };
      } else {
        await client.query('COMMIT');
        return {
          ok: false,
          state: 'expired',
          code: 'INVOICE_EXPIRED',
          message: 'Invoice expired during processing',
        };
      }
    }

    // 2.4. Check TX Hash reuse (must be inside transaction)
    const guardedPayment = await guardTxReuse(client, verifiedTxHash, { subscriptionId });

    if (guardedPayment && guardedPayment.status === 'confirmed') {
      // Processed by another process with same txHash
      await markInvoicePaid(client, invoice.id, guardedPayment.tx_hash);
      await client.query('COMMIT');
      return { ok: true, state: 'confirmed', idempotent: true };
    }

    // 2.5. Create payment record
    const payment = await attachPaymentRecord(client, {
      invoice,
      verification: { ...verification, txHash: verifiedTxHash },
      subscriptionId,
      orderId: null,
    });

    // 2.6. Check confirmations
    if (verification.status !== 'confirmed') {
      await client.query(
        `UPDATE invoices SET tx_hash = COALESCE($2, tx_hash), updated_at = NOW() WHERE id = $1`,
        [invoice.id, verifiedTxHash]
      );
      await client.query('COMMIT');
      return {
        ok: true,
        state: 'pending',
        payment,
        message: 'Payment received, waiting for confirmations',
      };
    }

    // 2.7. FINALIZE - Activate subscription, create shop
    const finalizeResult = await finalizeSubscriptionPayment(client, {
      subscription,
      invoice: { ...currentInvoice, tx_hash: verifiedTxHash },
      verification: { ...verification, txHash: verifiedTxHash },
      payment,
      mode: effectiveMode,
    });

    await client.query('COMMIT');
    logger.info(
      `[InvoicePayment] Phase 2: Transaction committed successfully for invoice ${invoice.id}.`
    );

    // CRITICAL: Notification OUTSIDE transaction
    if (finalizeResult.ok && finalizeResult.state === 'confirmed') {
      await notifySubscriptionActivated(subscriptionId);

      // Emit WebSocket event for real-time UI updates
      broadcast('subscription_payment_confirmed', {
        subscriptionId,
        userId: subscription.user_id,
        shopId: subscription.shop_id,
        tier: subscription.tier,
      });
    }

    return finalizeResult;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('[InvoicePayment] Rollback error:', rollbackError);
    }

    // Handle lock_timeout error (PostgreSQL code 55P03)
    if (error.code === '55P03') {
      logger.warn(
        `[InvoicePayment] Lock contention for subscription ${subscriptionId}. Failed to acquire lock within 5s.`
      );
      throw new ValidationError('System is busy (Lock Timeout), please try again shortly.');
    }

    logger.error('[InvoicePayment] Subscription payment failed:', {
      subscriptionId,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  } finally {
    client.release();
  }
}
