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

const POLL_INTERVAL = 30 * 1000; // 30 seconds (in milliseconds)
const MAX_AGE_HOURS = 24;
const BATCH_SIZE = 50;

let workerInterval = null;

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
  
  // Run immediately on start
  processPendingPayments().catch((err) => {
    logger.error('[PaymentWorker] Initial run failed:', err);
  });

  // Schedule recurring checks
  workerInterval = setInterval(async () => {
    try {
      await processPendingPayments();
    } catch (error) {
      logger.error('[PaymentWorker] Unhandled error:', error);
    }
  }, POLL_INTERVAL);
}

/**
 * Stop the payment verification worker
 */
export function stopPaymentVerificationWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info('[PaymentWorker] Stopped');
  }
}

/**
 * Process all pending payments
 */
async function processPendingPayments() {
  const client = await getClient();
  
  try {
    // 1. Get pending payments with FOR UPDATE SKIP LOCKED
    const pendingResult = await client.query(
      `SELECT 
         p.id, p.order_id, p.tx_hash, p.currency, p.amount,
         p.recipient_address, p.expected_crypto_amount,
         p.blockchain_confirmations,
         o.crypto_amount, o.crypto_currency, o.payment_address, o.status as order_status
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.status = 'pending'
         AND p.subscription_id IS NULL
         AND o.status = 'pending'
         AND p.created_at > NOW() - INTERVAL '${MAX_AGE_HOURS} hours'
       ORDER BY p.created_at ASC
       LIMIT ${BATCH_SIZE}
       FOR UPDATE OF p SKIP LOCKED`
    );
    
    const pendingPayments = pendingResult.rows;
    
    if (pendingPayments.length === 0) {
      return;
    }
    
    logger.info(`[PaymentWorker] Processing ${pendingPayments.length} pending payments`);
    
    for (const payment of pendingPayments) {
      try {
        await verifyAndProcessPayment(payment, client);
        // Small delay to avoid rate limiting
        await sleep(500);
      } catch (error) {
        logger.error(`[PaymentWorker] Error processing payment ${payment.id}:`, {
          error: error.message
        });
      }
    }
    
  } finally {
    client.release();
  }
}

/**
 * Verify single payment and update status
 */
async function verifyAndProcessPayment(payment, client) {
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
    confirmations: result.confirmations
  });
  
  // Update confirmations
  await client.query(
    `UPDATE payments 
     SET blockchain_confirmations = $1,
         last_checked_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [result.confirmations || 0, paymentId]
  );
  
  // If verified - confirm order
  if (result.verified) {
    await confirmOrderPayment(orderId, paymentId, result, client);
    return;
  }
  
  // If failed - mark payment as failed
  if (result.status === 'failed' && result.error) {
    await failPayment(paymentId, result.error, client);
  }
}

/**
 * Confirm order after successful payment verification
 */
async function confirmOrderPayment(orderId, paymentId, verificationResult, client) {
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
      logger.info(`[PaymentWorker] Order ${orderId} already processed`);
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
    
    for (const item of itemsResult.rows) {
      if (!item.is_preorder) {
        if (item.stock_quantity < item.quantity) {
          // Insufficient stock - still confirm but log warning
          logger.warn(`[PaymentWorker] Insufficient stock for product ${item.product_id}`);
        }
        
        await client.query(
          `UPDATE products 
           SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW()
           WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }
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
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Mark payment as failed
 */
async function failPayment(paymentId, errorCode, client) {
  await client.query(
    `UPDATE payments 
     SET verification_status = 'failed',
         verification_error = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [paymentId, errorCode]
  );
  
  logger.warn(`[PaymentWorker] Payment ${paymentId} failed: ${errorCode}`);
}

/**
 * Notify seller about received payment
 */
async function notifySellerPaymentReceived(orderId) {
  try {
    const result = await query(
      `SELECT o.id as order_id, o.total_price, o.currency,
              p.name as product_name,
              u.telegram_id as seller_telegram_id,
              buyer.telegram_id as buyer_telegram_id
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
       JOIN users u ON s.owner_id = u.id
       LEFT JOIN users buyer ON o.buyer_id = buyer.id
       WHERE o.id = $1
       LIMIT 1`,
      [orderId]
    );
    
    if (result.rows.length === 0) return;
    
    const order = result.rows[0];
    
    // Notify seller
    if (order.seller_telegram_id) {
      const message = `💰 Получен платёж!\n\nЗаказ #${order.order_id}\n📦 ${order.product_name}\n💵 ${order.total_price} ${order.currency}\n\nСтатус: ✅ Подтверждён`;
      
      await telegramService.sendMessage(order.seller_telegram_id, message);
    }
    
    // Notify buyer
    if (order.buyer_telegram_id) {
      const message = `✅ Платёж подтверждён!\n\nЗаказ #${order.order_id}\n📦 ${order.product_name}\n\nПродавец уведомлён о вашем заказе.`;
      
      await telegramService.sendMessage(order.buyer_telegram_id, message);
    }
    
  } catch (error) {
    logger.error('[PaymentWorker] notifySellerPaymentReceived error:', error);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for testing
export { processPendingPayments, verifyAndProcessPayment };

export default { startPaymentVerificationWorker, stopPaymentVerificationWorker };
