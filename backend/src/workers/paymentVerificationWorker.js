/**
 * Payment Verification Worker
 *
 * Background process that polls blockchain APIs every 30 seconds
 * to verify pending crypto payments.
 *
 * PAY-P1-2 TODO: Implement blockchain reorg protection
 * Currently, confirmed payments are NOT re-verified. In rare cases of blockchain
 * reorganization (reorg), a confirmed transaction could be rolled back.
 *
 * Recommended solution for high-value transactions:
 * 1. Add periodic re-verification for recently confirmed payments (<24h)
 * 2. Alert if confirmations decrease (indicates potential reorg)
 * 3. For amounts >$1000, require more confirmations (2x normal)
 *
 * Risk: Low (reorgs are rare), Impact: High (money loss if it happens)
 */

import { getClient, query } from '../config/database.js';
import * as blockchainVerificationService from '../services/blockchainVerificationService.js';
import * as crystalPayService from '../services/crystalPayService.js';
import { processSubscriptionPayment } from '../services/invoicePayment/index.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';
import { alertPaymentVerificationFailed, alertStockDeductionFailed, alertLatePaymentReceived } from '../utils/alerts.js';
import { logPaymentStatusChange, logOrderStatusChange } from '../utils/statusLogger.js';
import { INVOICE_EXPIRY_SECONDS } from '../config/payments.js';
import metricsCollector from '../services/metricsCollector.js';

const POLL_INTERVAL = 30 * 1000; // 30 seconds (in milliseconds)
// 72 hours to accommodate slow BTC/LTC confirmations during network congestion
const MAX_AGE_HOURS = 72;
const BATCH_SIZE = 50;
const STUCK_PAYMENT_TIMEOUT_MINUTES = 5; // Recovery timeout for stuck 'processing' payments
const RECOVERY_INTERVAL = 5 * 60 * 1000; // Run recovery every 5 minutes

// CrystalPay subscription polling settings
const CRYSTALPAY_POLL_BATCH_SIZE = 10; // Max invoices per poll cycle
const CRYSTALPAY_POLL_DELAY_MS = 200; // 200ms between API calls (5 req/sec max)
const CRYSTALPAY_POLL_INTERVAL_SEC = 30; // Check each invoice every 30 seconds

let workerInterval = null;
let isProcessing = false; // Guard against overlapping executions
let recoveryInterval = null;

/**
 * Start the payment verification worker
 */
export function startPaymentVerificationWorker() {
  if (workerInterval) {
    logger.warn('[PaymentWorker] Already running');
    return;
  }

  logger.info('======================================');
  logger.info('Payment Verification Worker Started');
  logger.info('======================================');
  logger.info(`  - Poll interval: ${POLL_INTERVAL / 1000} seconds`);
  logger.info(`  - Max payment age: ${MAX_AGE_HOURS} hours`);
  logger.info(`  - Batch size: ${BATCH_SIZE} payments`);
  logger.info(`  - Stuck payment recovery: every ${RECOVERY_INTERVAL / 60000} minutes`);
  logger.info(`  - CrystalPay subscription polling: enabled (batch=${CRYSTALPAY_POLL_BATCH_SIZE}, delay=${CRYSTALPAY_POLL_DELAY_MS}ms)`);

  // Run immediately on start
  processPendingPayments().catch((err) => {
    logger.error('[PaymentWorker] Initial run failed:', err);
  });

  // Run CrystalPay subscription polling immediately
  processPendingCrystalPaySubscriptions().catch((err) => {
    logger.error('[PaymentWorker] Initial CrystalPay poll failed:', err);
  });

  // Run recovery for stuck payments immediately and periodically
  recoverStuckPayments().catch((err) => {
    logger.error('[PaymentWorker] Initial recovery failed:', err);
  });

  // Schedule recurring checks with overlap protection
  workerInterval = setInterval(async () => {
    if (isProcessing) {
      logger.debug('[PaymentWorker] Skipping - previous run still in progress');
      return;
    }
    isProcessing = true;
    try {
      // Run both payment types in parallel
      await Promise.all([
        processPendingPayments(),
        processPendingCrystalPaySubscriptions(),
      ]);
    } catch (error) {
      logger.error('[PaymentWorker] Unhandled error:', error);
    } finally {
      isProcessing = false;
    }
  }, POLL_INTERVAL);

  // Schedule stuck payment recovery (every 5 minutes)
  recoveryInterval = setInterval(async () => {
    try {
      await recoverStuckPayments();
    } catch (error) {
      logger.error('[PaymentWorker] Recovery error:', error);
    }
  }, RECOVERY_INTERVAL);
}

/**
 * Stop the payment verification worker
 */
export function stopPaymentVerificationWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
  }
  logger.info('[PaymentWorker] Stopped');
}

/**
 * Recover stuck payments that are in 'processing' status for too long
 * This prevents payments from being stuck forever if worker crashes mid-processing
 */
async function recoverStuckPayments() {
  try {
    // FIX: Use parameterized query to prevent SQL injection
    const result = await query(
      `UPDATE payments
       SET status = 'pending', updated_at = NOW()
       WHERE status = 'processing'
         AND updated_at < NOW() - make_interval(mins => $1)
       RETURNING id, order_id, currency`,
      [STUCK_PAYMENT_TIMEOUT_MINUTES]
    );

    if (result.rows.length > 0) {
      logger.warn(`[PaymentWorker] Recovered ${result.rows.length} stuck payments`, {
        paymentIds: result.rows.map(r => r.id),
      });
    }
  } catch (error) {
    // HIGH #6 FIX: Add structured logging and re-throw for visibility
    logger.error('[PaymentWorker] Failed to recover stuck payments', {
      error: error.message,
      stack: error.stack,
    });
    // Don't throw - this is called from interval, throwing would crash the worker
    // But ensure this is visible in monitoring
  }
}

/**
 * Process all pending payments
 * Uses Atomic Claim Pattern to prevent race conditions
 */
/**
 * Process all pending payments
 * Uses Atomic Claim Pattern to prevent race conditions
 * Implements Smart Polling to respect API rate limits
 */
async function processPendingPayments() {
  const client = await getClient();

  try {
    // 1. Atomically claim AND mark payments as 'processing'
    // OPTIMIZATION: Added last_checked_at filters to prevent API rate limit exhaustion
    // BTC/LTC: Check every 10 minutes (matches block time + saves API calls)
    // ETH/USDT: Check every 2 minutes (faster blocks)
    await client.query('BEGIN');

    // FIX: Use parameterized query for all dynamic values
    const pendingResult = await client.query(
      `UPDATE payments p
       SET status = 'processing', updated_at = NOW()
       FROM (
         SELECT p2.id
         FROM payments p2
         JOIN orders o ON p2.order_id = o.id
         WHERE p2.status = 'pending'
           AND p2.subscription_id IS NULL
           AND o.status = 'pending'
           AND p2.created_at > NOW() - make_interval(hours => $1)
           AND (
             p2.last_checked_at IS NULL
             OR (p2.currency IN ('BTC', 'LTC') AND p2.last_checked_at < NOW() - INTERVAL '10 minutes')
             OR (p2.currency NOT IN ('BTC', 'LTC') AND p2.last_checked_at < NOW() - INTERVAL '2 minutes')
           )
         ORDER BY p2.created_at ASC
         LIMIT $2
         FOR UPDATE OF p2 SKIP LOCKED
       ) selected
       WHERE p.id = selected.id
       RETURNING p.id, p.order_id, p.tx_hash, p.currency, p.amount,
                 p.recipient_address, p.expected_crypto_amount,
                 p.blockchain_confirmations`,
      [MAX_AGE_HOURS, BATCH_SIZE]
    );

    await client.query('COMMIT');

    const pendingPayments = pendingResult.rows;

    if (pendingPayments.length === 0) {
      // No payments need checking right now
      return;
    }

    logger.info(`[PaymentWorker] Processing ${pendingPayments.length} pending payments (Smart Polling)`);

    // 2. Process OUTSIDE transaction - each payment separately
    for (const payment of pendingPayments) {
      try {
        await verifyAndProcessPaymentSafe(payment);
        // Small delay to avoid rate limiting
        await sleep(1000); // Increased to 1s for safety
      } catch (error) {
        // Revert status to pending on error
        await query(
          `UPDATE payments SET status = 'pending', updated_at = NOW() WHERE id = $1`,
          [payment.id]
        );
        // Record worker error metric
        metricsCollector.recordWorkerError('payment_verification', error);
        logger.error(`[PaymentWorker] Error processing payment ${payment.id}:`, {
          error: error.message
        });
      }
    }

  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      logger.error('[PaymentVerification] ROLLBACK failed:', rollbackErr);
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process pending CrystalPay subscription invoices
 *
 * Polls CrystalPay API for subscription payments that may have been missed by webhooks
 * (e.g., if Cloudflare tunnel URL changed). This is a backup mechanism - webhooks are still
 * the primary payment confirmation method.
 *
 * Uses Atomic Claim Pattern similar to processPendingPayments.
 */
async function processPendingCrystalPaySubscriptions() {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Atomically claim invoices for processing
    // Query: pending CrystalPay invoices for subscriptions that haven't been checked recently
    const invoiceResult = await client.query(
      `UPDATE invoices
       SET last_checked_at = NOW(), updated_at = NOW()
       FROM (
         SELECT i.id
         FROM invoices i
         WHERE i.chain = 'CRYSTALPAY'
           AND i.status = 'pending'
           AND i.subscription_id IS NOT NULL
           AND i.expires_at > NOW()
           AND i.created_at > NOW() - make_interval(hours => $1)
           AND (i.last_checked_at IS NULL OR i.last_checked_at < NOW() - make_interval(secs => $2))
         ORDER BY i.created_at ASC
         LIMIT $3
         FOR UPDATE OF i SKIP LOCKED
       ) selected
       WHERE invoices.id = selected.id
       RETURNING invoices.id, invoices.subscription_id, invoices.crystalpay_id,
                 invoices.expected_amount, invoices.currency`,
      [MAX_AGE_HOURS, CRYSTALPAY_POLL_INTERVAL_SEC, CRYSTALPAY_POLL_BATCH_SIZE]
    );

    await client.query('COMMIT');

    const pendingInvoices = invoiceResult.rows;

    if (pendingInvoices.length === 0) {
      return;
    }

    logger.info(`[PaymentWorker] Processing ${pendingInvoices.length} pending CrystalPay subscription invoices`);

    // Process each invoice OUTSIDE transaction
    for (const invoice of pendingInvoices) {
      try {
        await processCrystalPayInvoice(invoice);
        // Respect rate limits: 200ms delay = max 5 requests/second
        await sleep(CRYSTALPAY_POLL_DELAY_MS);
      } catch (error) {
        // Log error but don't crash - continue with next invoice
        metricsCollector.recordWorkerError('crystalpay_poll', error);
        logger.error(`[PaymentWorker] Error processing CrystalPay invoice ${invoice.id}:`, {
          error: error.message,
          subscriptionId: invoice.subscription_id,
        });
      }
    }
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      logger.error('[PaymentWorker] CrystalPay poll ROLLBACK failed:', rollbackErr);
    });
    logger.error('[PaymentWorker] CrystalPay subscription poll failed:', error);
  } finally {
    client.release();
  }
}

/**
 * Process a single CrystalPay subscription invoice
 *
 * @param {Object} invoice - Invoice row from database
 */
async function processCrystalPayInvoice(invoice) {
  const { id: invoiceId, subscription_id: subscriptionId, crystalpay_id: crystalpayId } = invoice;

  if (!crystalpayId) {
    logger.warn(`[PaymentWorker] Invoice ${invoiceId} has no crystalpay_id, skipping`);
    return;
  }

  logger.debug(`[PaymentWorker] Checking CrystalPay invoice ${invoiceId}`, {
    subscriptionId,
    crystalpayId: crystalpayId.substring(0, 20) + '...',
  });

  // Call CrystalPay API to get invoice status
  let invoiceInfo;
  try {
    invoiceInfo = await crystalPayService.getInvoiceInfo(crystalpayId);
  } catch (apiError) {
    // API error - will be retried on next poll cycle
    logger.warn(`[PaymentWorker] CrystalPay API error for invoice ${invoiceId}:`, {
      error: apiError.message,
    });
    return;
  }

  const state = invoiceInfo.state;
  logger.debug(`[PaymentWorker] CrystalPay invoice ${invoiceId} state: ${state}`);

  // Handle different states
  if (crystalPayService.isPaymentSuccessful(state)) {
    // Payment confirmed - process subscription payment
    logger.info(`[PaymentWorker] CrystalPay invoice ${invoiceId} is PAID, processing subscription...`);

    try {
      const result = await processSubscriptionPayment({
        subscriptionId,
        invoiceId,
        webhookVerified: true, // Trust the poll result as we verified via API
      });

      if (result.ok) {
        logger.info(`[PaymentWorker] Subscription ${subscriptionId} activated via polling`, {
          invoiceId,
          state: result.state,
        });
      } else {
        logger.warn(`[PaymentWorker] Subscription payment processing returned not ok`, {
          subscriptionId,
          invoiceId,
          result,
        });
      }
    } catch (processError) {
      logger.error(`[PaymentWorker] Failed to process subscription payment`, {
        subscriptionId,
        invoiceId,
        error: processError.message,
      });
    }
  } else if (crystalPayService.isPaymentFailed(state)) {
    // Payment failed or unavailable - mark invoice as expired/cancelled
    logger.info(`[PaymentWorker] CrystalPay invoice ${invoiceId} failed with state: ${state}`);

    await query(
      `UPDATE invoices
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [invoiceId]
    );
  }
  // For pending states (created, notpayed, processing) - do nothing, will check again next cycle
}

/**
 * Verify single payment and update status (safe - no client parameter)
 */
async function verifyAndProcessPaymentSafe(payment) {
  const {
    id: paymentId,
    order_id: orderId,
    tx_hash: txHash,
    currency,
    recipient_address: recipientAddress,
    expected_crypto_amount: expectedAmount
  } = payment;

  logger.debug(`[PaymentWorker] Verifying payment ${paymentId}`, {
    orderId,
    txHash: txHash.substring(0, 20) + '...',
    currency
  });

  // Call blockchain verification service
  const result = await blockchainVerificationService.verifyPayment(
    txHash,
    currency,
    recipientAddress,
    parseFloat(expectedAmount)
  );

  logger.debug(`[PaymentWorker] Verification result for ${paymentId}:`, {
    verified: result.verified,
    status: result.status,
    resultStatus: result.resultStatus,
    confirmations: result.confirmations,
    error: result.error
  });

  // Update confirmations and check_count (simple query, no transaction needed)
  await query(
    `UPDATE payments
     SET blockchain_confirmations = $1,
         last_checked_at = NOW(),
         check_count = COALESCE(check_count, 0) + 1,
         updated_at = NOW()
     WHERE id = $2`,
    [result.confirmations || 0, paymentId]
  );

  // If verified - check invoice expiry before confirming
  if (result.verified) {
    // Check if invoice has expired (late payment protection)
    const orderInfo = await query(
      `SELECT created_at FROM orders WHERE id = $1`,
      [orderId]
    );

    if (orderInfo.rows.length > 0) {
      const invoiceAge = (Date.now() - new Date(orderInfo.rows[0].created_at).getTime()) / 1000;

      if (invoiceAge > INVOICE_EXPIRY_SECONDS) {
        const requestId = `worker-${orderId}-${Date.now()}`;

        // Late payment - mark for manual review, DO NOT auto-confirm
        await query(
          `UPDATE payments
           SET status = 'needs_review',
               verification_status = 'late_confirmed',
               verification_error = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [paymentId, `Late payment: ${Math.round(invoiceAge / 60)} minutes after invoice`]
        );

        logPaymentStatusChange({
          paymentId,
          orderId,
          statusFrom: 'processing',
          statusTo: 'needs_review',
          reason: 'late_payment',
          requestId,
          extra: { invoiceAgeMinutes: Math.round(invoiceAge / 60) },
        });

        // Record needs_review metric
        metricsCollector.recordNeedsReviewOrder(orderId);

        alertLatePaymentReceived(orderId, paymentId, invoiceAge);

        // Notify buyer and seller about late payment
        // HIGH #5 FIX: Add structured logging for late payment notification failures
        notifyLatePaymentReceived(orderId, paymentId, invoiceAge).catch(err => {
          logger.error('[PaymentWorker] CRITICAL: Late payment notification failed - manual review required', {
            orderId,
            paymentId,
            invoiceAgeMinutes: Math.round(invoiceAge / 60),
            error: err.message,
          });
        });

        logger.warn(`[PaymentWorker] Late payment detected`, {
          orderId,
          paymentId,
          invoiceAgeMinutes: Math.round(invoiceAge / 60),
          thresholdMinutes: INVOICE_EXPIRY_SECONDS / 60
        });

        return; // DO NOT auto-confirm late payments
      }
    }

    // Invoice still valid - proceed with confirmation
    await confirmOrderPayment(orderId, paymentId, result);
    return;
  }

  // Handle different error statuses:
  // - API_ERROR: Network/API issues - keep as pending, will retry automatically
  // - TX_NOT_FOUND: Transaction not found - keep as pending, may appear later
  // - TX_INVALID: Permanent failure (invalid address, failed tx, wrong amount) - mark as failed
  if (result.resultStatus === blockchainVerificationService.VERIFICATION_STATUS.API_ERROR) {
    // Network/API error - return to pending for automatic retry
    await query(
      `UPDATE payments
       SET status = 'pending', last_checked_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [paymentId]
    );
    logger.warn(`[PaymentWorker] Payment ${paymentId} API error (will retry): ${result.error}`);
    return;
  }

  if (result.resultStatus === blockchainVerificationService.VERIFICATION_STATUS.TX_NOT_FOUND) {
    const MAX_TX_NOT_FOUND_CHECKS = 50; // ~8-25 hours depending on currency

    // Check current count
    const countResult = await query(
      `SELECT check_count FROM payments WHERE id = $1`,
      [paymentId]
    );
    const checkCount = countResult.rows[0]?.check_count || 0;

    if (checkCount >= MAX_TX_NOT_FOUND_CHECKS) {
      // Mark as failed - transaction never found
      await query(
        `UPDATE payments
         SET status = 'failed',
             verification_status = 'tx_not_found',
             verification_error = 'Transaction not found after maximum retries',
             updated_at = NOW()
         WHERE id = $1`,
        [paymentId]
      );
      // Alert admin about verification failure
      alertPaymentVerificationFailed(orderId, paymentId, 'Transaction not found after maximum retries');
      logger.warn(`[PaymentWorker] Payment ${paymentId} failed: TX never found after ${checkCount} checks`);
      return;
    }

    // Continue retry
    await query(
      `UPDATE payments
       SET status = 'pending', last_checked_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [paymentId]
    );
    logger.debug(`[PaymentWorker] Payment ${paymentId} not found yet (check ${checkCount + 1}/${MAX_TX_NOT_FOUND_CHECKS})`);
    return;
  }

  if (result.resultStatus === blockchainVerificationService.VERIFICATION_STATUS.TX_INVALID) {
    const requestId = `worker-${orderId}-${Date.now()}`;

    // Permanent failure - don't retry
    await query(
      `UPDATE payments
       SET status = 'failed', verification_status = 'failed', verification_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [paymentId, result.error]
    );

    logPaymentStatusChange({
      paymentId,
      orderId,
      statusFrom: 'processing',
      statusTo: 'failed',
      reason: 'tx_invalid',
      requestId,
      extra: { error: result.error },
    });

    logger.warn(`[PaymentWorker] Payment ${paymentId} failed permanently: ${result.error}`);

    // Alert admin about permanent payment failure
    alertPaymentVerificationFailed(orderId, paymentId, result.error);
    return;
  }

  // Fallback for SUCCESS status but not yet verified (waiting for more confirmations)
  // Return status back to 'pending' for next polling iteration
  if (result.resultStatus === blockchainVerificationService.VERIFICATION_STATUS.SUCCESS && !result.verified) {
    await query(
      `UPDATE payments
       SET status = 'pending', last_checked_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [paymentId]
    );
    logger.debug(`[PaymentWorker] Payment ${paymentId} returned to pending (${result.confirmations || 0} confirmations)`);
    return;
  }

  // Unexpected state - log and return to pending
  logger.warn(`[PaymentWorker] Payment ${paymentId} in unexpected state:`, {
    resultStatus: result.resultStatus,
    verified: result.verified,
    status: result.status
  });
  await query(
    `UPDATE payments
     SET status = 'pending', last_checked_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [paymentId]
  );
}

/**
 * Confirm order after successful payment verification
 * Uses its own client - no nested transactions
 */
async function confirmOrderPayment(orderId, paymentId, verificationResult) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Lock order
    const orderResult = await client.query(
      `SELECT o.*, oi.product_id, oi.quantity
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1 
       FOR UPDATE OF o`,
      [orderId]
    );

    const order = orderResult.rows[0];
    if (!order || order.status !== 'pending') {
      await client.query('ROLLBACK');

      // FIX: Update payment status to prevent stuck 'processing' payments
      if (!order) {
        // Order not found - return payment to pending for retry
        await query(
          `UPDATE payments SET status = 'pending', updated_at = NOW() WHERE id = $1`,
          [paymentId]
        );
        logger.warn(`[PaymentWorker] Order ${orderId} not found, payment ${paymentId} returned to pending`);
      } else if (order.status === 'paid' || order.status === 'confirmed') {
        // Order already paid - sync payment status (backward compat: check both 'paid' and legacy 'confirmed')
        await query(
          `UPDATE payments SET status = 'confirmed', verification_status = 'confirmed', updated_at = NOW() WHERE id = $1`,
          [paymentId]
        );
        logger.info(`[PaymentWorker] Order ${orderId} already paid, synced payment ${paymentId}`);
      } else {
        // Order cancelled/failed - mark payment accordingly
        await query(
          `UPDATE payments SET status = 'failed', verification_status = 'failed', verification_error = $2, updated_at = NOW() WHERE id = $1`,
          [paymentId, `Order status: ${order.status}`]
        );
        logger.warn(`[PaymentWorker] Order ${orderId} is ${order.status}, payment ${paymentId} marked failed`);
      }
      return;
    }

    // 2. Deduct stock for all items
    const itemsResult = await client.query(
      `SELECT oi.product_id, oi.quantity, p.stock_quantity, p.is_preorder
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1
       FOR UPDATE OF p`,
      [orderId]
    );

    // Batch update stock for all non-preorder items (fixes N+1 query issue)
    const nonPreorderItems = itemsResult.rows.filter(item => !item.is_preorder);

    if (nonPreorderItems.length > 0) {
      // Check stock for ALL items BEFORE any deduction - prevent overselling
      for (const item of nonPreorderItems) {
        if (item.stock_quantity < item.quantity) {
          logger.error(
            `[PaymentWorker] Insufficient stock for product ${item.product_id}: available=${item.stock_quantity}, requested=${item.quantity}`
          );
          await client.query('ROLLBACK');

          // Mark as failed - requires manual resolution (refund or restock)
          // DO NOT set to 'pending' - creates infinite loop as worker retries every 30s
          await query(
            `UPDATE payments SET status = 'failed', verification_error = $2, updated_at = NOW() WHERE id = $1`,
            [paymentId, `Insufficient stock: ${item.stock_quantity} available < ${item.quantity} ordered. Manual resolution required.`]
          );

          // Alert admin about stock issue
          alertStockDeductionFailed(orderId, item.product_id, `Insufficient stock: ${item.stock_quantity} < ${item.quantity}`);
          return; // Don't confirm the order
        }
      }

      // Safe to deduct - all items have sufficient stock
      const productIds = nonPreorderItems.map(item => item.product_id);
      const quantities = nonPreorderItems.map(item => item.quantity);

      await client.query(
        `UPDATE products p
         SET stock_quantity = p.stock_quantity - u.quantity,
             reserved_quantity = GREATEST(0, p.reserved_quantity - u.quantity),
             updated_at = NOW()
         FROM unnest($1::int[], $2::int[]) AS u(product_id, quantity)
         WHERE p.id = u.product_id`,
        [productIds, quantities]
      );

      // Mark items as stock_deducted (for proper stock return on cancellation)
      await client.query(
        `UPDATE order_items SET stock_deducted = true WHERE order_id = $1`,
        [orderId]
      );
    }

    // 3. Update order status to 'paid'
    await client.query(
      `UPDATE orders
       SET status = 'paid',
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );

    // 4. Update payment status
    await client.query(
      `UPDATE payments 
       SET status = 'confirmed',
           verification_status = 'confirmed',
           updated_at = NOW()
       WHERE id = $1`,
      [paymentId]
    );

    await client.query('COMMIT');

    // Broadcast WebSocket event for real-time UI update
    // HIGH #4 FIX: Add structured logging for WebSocket failures
    try {
      const { broadcast } = await import('../utils/websocket.js');
      broadcast('order_status', {
        orderId,
        status: 'paid',
        shopId: order.shop_id,
      });
    } catch (wsError) {
      logger.error('[PaymentWorker] WebSocket broadcast failed - user UI may not update', {
        orderId,
        shopId: order.shop_id,
        paymentId,
        error: wsError.message,
        stack: wsError.stack,
      });
      // Non-critical: payment is confirmed, user can refresh
      // TODO: Consider adding metric tracking: metricsCollector.recordWebsocketFailure()
    }

    const requestId = `worker-${orderId}-${Date.now()}`;

    logOrderStatusChange({
      orderId,
      statusFrom: 'pending',
      statusTo: 'paid',
      reason: 'payment_verified',
      requestId,
      extra: { paymentId, confirmations: verificationResult.confirmations },
    });

    logPaymentStatusChange({
      paymentId,
      orderId,
      statusFrom: 'processing',
      statusTo: 'confirmed',
      reason: 'blockchain_verified',
      requestId,
      extra: { confirmations: verificationResult.confirmations },
    });

    logger.info(`[PaymentWorker] Order ${orderId} paid`, {
      paymentId,
      txHash: verificationResult.txHash,
      confirmations: verificationResult.confirmations
    });

    // 5. Notify seller (async, outside transaction)
    // CRITICAL #3 FIX: Add structured logging for notification failures
    notifySellerPaymentReceived(orderId).catch(err => {
      logger.error('[PaymentWorker] Seller notification failed - seller may miss payment', {
        orderId,
        paymentId,
        error: err.message,
        code: err.code,
      });
      // TODO: Queue for retry or alert admin about missed notification
    });

  } catch (error) {
    // FIX: Update payment status to 'pending' before rollback to prevent stuck 'processing' payments
    await query(
      `UPDATE payments SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [paymentId]
    ).catch(updateErr => {
      logger.error('[PaymentWorker] Failed to reset payment status before rollback:', updateErr);
    });
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Escape HTML special characters for Telegram HTML parse_mode
 */
function escapeHtml(text) {
  if (!text) {return '';}
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Notify seller about received payment
 */
async function notifySellerPaymentReceived(orderId) {
  try {
    const result = await query(
      `SELECT
         o.id as order_id,
         o.total_price,
         o.currency,
         p.name as product_name,
         oi.quantity,
         pay.currency as crypto_currency,
         pay.expected_crypto_amount,
         u.telegram_id as seller_telegram_id,
         u.username as seller_username,
         u.first_name as seller_first_name,
         buyer.telegram_id as buyer_telegram_id,
         buyer.username as buyer_username,
         buyer.first_name as buyer_first_name,
         s.name as shop_name
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
       JOIN users u ON s.owner_id = u.id
       LEFT JOIN users buyer ON o.buyer_id = buyer.id
       LEFT JOIN payments pay ON pay.order_id = o.id AND pay.status = 'confirmed'
       WHERE o.id = $1
       LIMIT 1`,
      [orderId]
    );

    if (result.rows.length === 0) { return; }

    const order = result.rows[0];

    // Format price - remove trailing zeros
    const formatPrice = (price) => {
      const num = parseFloat(price);
      return num % 1 === 0 ? num.toFixed(0) : num.toFixed(2);
    };

    // Format crypto amount - max 8 decimals, no trailing zeros
    const formatCrypto = (amount) => {
      const num = parseFloat(amount);
      return num.toFixed(8).replace(/\.?0+$/, '');
    };

    // Format date
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Notify seller
    if (order.seller_telegram_id) {
      const buyerContact = order.buyer_username
        ? `@${order.buyer_username}`
        : order.buyer_first_name || 'Покупатель';

      const sellerMessage = [
        '💰 <b>Новый заказ оплачен!</b>',
        '',
        `🧾 Заказ #${order.order_id}`,
        `📅 ${dateStr}`,
        '',
        `📦 ${escapeHtml(order.product_name)} × ${order.quantity || 1}`,
        `💵 ${formatPrice(order.total_price)} ${order.currency}`,
        `💎 ${formatCrypto(order.expected_crypto_amount)} ${order.crypto_currency}`,
        '',
        `👤 Покупатель: ${buyerContact}`,
        '',
        '⚡️ <i>Свяжитесь с покупателем и выдайте товар</i>',
      ].filter(Boolean).join('\n');

      await telegramService.sendMessage(order.seller_telegram_id, sellerMessage, {
        parse_mode: 'HTML'
      });
    }

    // Notify buyer
    if (order.buyer_telegram_id) {
      const sellerContact = order.seller_username
        ? `@${order.seller_username}`
        : order.seller_first_name || 'Продавец';

      const buyerMessage = [
        '✅ <b>Платёж подтверждён!</b>',
        '',
        `🧾 Заказ #${order.order_id}`,
        `📅 ${dateStr}`,
        '',
        `📦 ${escapeHtml(order.product_name)}`,
        `💵 ${formatPrice(order.total_price)} ${order.currency}`,
        `💎 ${formatCrypto(order.expected_crypto_amount)} ${order.crypto_currency}`,
        '',
        `🏪 Магазин: ${escapeHtml(order.shop_name)}`,
        `👤 Продавец: ${sellerContact}`,
        '',
        '⏳ <i>Продавец скоро свяжется с вами</i>',
      ].join('\n');

      await telegramService.sendMessage(order.buyer_telegram_id, buyerMessage, {
        parse_mode: 'HTML'
      });
    }

  } catch (error) {
    logger.error('[PaymentWorker] notifySellerPaymentReceived error:', error);
  }
}

/**
 * Notify buyer and seller about late payment requiring review
 */
async function notifyLatePaymentReceived(orderId, paymentId, invoiceAgeSeconds) {
  try {
    const result = await query(
      `SELECT
         o.id as order_id,
         o.total_price,
         o.currency,
         p.name as product_name,
         pay.currency as crypto_currency,
         pay.expected_crypto_amount,
         buyer.telegram_id as buyer_telegram_id,
         buyer.username as buyer_username,
         seller.telegram_id as seller_telegram_id,
         seller.username as seller_username,
         s.name as shop_name
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       JOIN shops s ON o.shop_id = s.id
       JOIN users seller ON s.owner_id = seller.id
       LEFT JOIN users buyer ON o.buyer_id = buyer.id
       LEFT JOIN payments pay ON pay.order_id = o.id AND pay.id = $2
       WHERE o.id = $1
       LIMIT 1`,
      [orderId, paymentId]
    );

    if (result.rows.length === 0) {return;}
    const order = result.rows[0];

    const delayMinutes = Math.round(invoiceAgeSeconds / 60);
    const dateStr = new Date().toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    // Notify buyer
    if (order.buyer_telegram_id) {
      const buyerMessage = [
        '⚠️ <b>Платёж получен с задержкой</b>',
        '',
        `🧾 Заказ #${order.order_id}`,
        `📦 ${escapeHtml(order.product_name)}`,
        `💵 ${order.total_price} ${order.currency}`,
        '',
        `⏱ Задержка: ${delayMinutes} минут`,
        '',
        '📋 <i>Ваш платёж подтверждён на блокчейне, но поступил после истечения срока оплаты.</i>',
        '<i>Заказ передан на ручную проверку администратору.</i>',
        '<i>Мы свяжемся с вами в ближайшее время.</i>',
      ].join('\n');

      await telegramService.sendMessage(order.buyer_telegram_id, buyerMessage, {
        parse_mode: 'HTML'
      });
    }

    // Notify seller
    if (order.seller_telegram_id) {
      const sellerMessage = [
        '⚠️ <b>Поздний платёж требует проверки</b>',
        '',
        `🧾 Заказ #${order.order_id}`,
        `📅 ${dateStr}`,
        '',
        `📦 ${escapeHtml(order.product_name)}`,
        `💵 ${order.total_price} ${order.currency}`,
        '',
        `⏱ Платёж поступил через ${delayMinutes} минут после создания заказа`,
        '',
        '📋 <i>Платёж подтверждён на блокчейне, но курс мог измениться.</i>',
        '<i>Администратор рассмотрит заказ и примет решение.</i>',
      ].join('\n');

      await telegramService.sendMessage(order.seller_telegram_id, sellerMessage, {
        parse_mode: 'HTML'
      });
    }

    logger.info('[PaymentWorker] Late payment notifications sent', {
      orderId,
      paymentId,
      delayMinutes,
    });

  } catch (error) {
    logger.error('[PaymentWorker] notifyLatePaymentReceived error:', error);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for testing
export { processPendingPayments, verifyAndProcessPaymentSafe };

export default { startPaymentVerificationWorker, stopPaymentVerificationWorker };
