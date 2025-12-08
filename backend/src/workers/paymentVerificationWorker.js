/**
 * Payment Verification Worker
 * 
 * Background process that polls blockchain APIs every 30 seconds
 * to verify pending crypto payments.
 */

import { getClient, query } from '../config/database.js';
import * as blockchainVerificationService from '../services/blockchainVerificationService.js';
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

let workerInterval = null;
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

  // Run immediately on start
  processPendingPayments().catch((err) => {
    logger.error('[PaymentWorker] Initial run failed:', err);
  });

  // Run recovery for stuck payments immediately and periodically
  recoverStuckPayments().catch((err) => {
    logger.error('[PaymentWorker] Initial recovery failed:', err);
  });

  // Schedule recurring checks
  workerInterval = setInterval(async () => {
    try {
      await processPendingPayments();
    } catch (error) {
      logger.error('[PaymentWorker] Unhandled error:', error);
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
    logger.error('[PaymentWorker] Failed to recover stuck payments:', error);
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

  // Update confirmations (simple query, no transaction needed)
  await query(
    `UPDATE payments 
     SET blockchain_confirmations = $1, last_checked_at = NOW(), updated_at = NOW()
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
        notifyLatePaymentReceived(orderId, paymentId, invoiceAge).catch(err => {
          logger.error('[PaymentWorker] Late payment notification error:', err);
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
    // Transaction not found - may appear later (for recently sent transactions)
    // Keep pending for retry
    await query(
      `UPDATE payments
       SET status = 'pending', last_checked_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [paymentId]
    );
    logger.debug(`[PaymentWorker] Payment ${paymentId} not found yet (will retry)`);
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
      } else if (order.status === 'confirmed') {
        // Order already confirmed - sync payment status
        await query(
          `UPDATE payments SET status = 'confirmed', verification_status = 'confirmed', updated_at = NOW() WHERE id = $1`,
          [paymentId]
        );
        logger.info(`[PaymentWorker] Order ${orderId} already confirmed, synced payment ${paymentId}`);
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
             updated_at = NOW()
         FROM unnest($1::int[], $2::int[]) AS u(product_id, quantity)
         WHERE p.id = u.product_id`,
        [productIds, quantities]
      );
    }

    // 3. Update order status
    await client.query(
      `UPDATE orders 
       SET status = 'confirmed', 
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

    const requestId = `worker-${orderId}-${Date.now()}`;

    logOrderStatusChange({
      orderId,
      statusFrom: 'pending',
      statusTo: 'confirmed',
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

    logger.info(`[PaymentWorker] Order ${orderId} confirmed`, {
      paymentId,
      txHash: verificationResult.txHash,
      confirmations: verificationResult.confirmations
    });

    // 5. Notify seller (async, outside transaction)
    notifySellerPaymentReceived(orderId).catch(err => {
      logger.error('[PaymentWorker] Notification error:', err);
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
       JOIN products p ON o.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
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
