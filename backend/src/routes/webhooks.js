import express from 'express';
import * as blockCypherService from '../services/blockCypherService.js';
import { paymentQueries, invoiceQueries, orderQueries, processedWebhookQueries } from '../models/db.js';
import { getClient } from '../config/database.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Legacy Tatum webhook удалён; используются BlockCypher и polling сервисы.

/**
 * Helper: Update order status
 */
async function updateOrderStatus(orderId, status) {
  await orderQueries.updateStatus(orderId, status);
  logger.info(`[Webhook] Order ${orderId} status updated to ${status}`);
}

/**
 * Helper: Send Telegram notification to buyer
 */
async function sendTelegramNotification(orderId, status) {
  try {
    const order = await orderQueries.findById(orderId);
    if (!order) {
      logger.warn(`[Webhook] Order not found: ${orderId}`);
      return;
    }

    if (status === 'confirmed') {
      await telegramService.notifyPaymentConfirmed(order.buyer_telegram_id, {
        id: order.id,
        product_name: order.product_name,
        total_price: order.total_price,
        currency: order.currency
      });
    }
  } catch (error) {
    logger.error('[Webhook] Failed to send Telegram notification:', {
      error: error.message,
      orderId
    });
  }
}

/**
 * BlockCypher Webhook Endpoint
 *
 * Receives tx-confirmation notifications for BTC and LTC payments
 * Automatically updates order status when payment reaches threshold confirmations
 *
 * Security features:
 * - CVE-PS-001: Secret token verification
 * - CVE-PS-002: Replay attack protection
 * - CVE-PS-003: Database transactions
 */
router.post('/blockcypher', async (req, res) => {
  const client = await getClient(); // Get DB client for transaction

  try {
    // CVE-PS-001: Verify secret token (query parameter)
    const webhookSecret = process.env.BLOCKCYPHER_WEBHOOK_SECRET;
    if (webhookSecret) {
      const providedToken = req.query.token || req.headers['x-webhook-token'];

      if (!providedToken || providedToken !== webhookSecret) {
        logger.warn('[Webhook] BlockCypher: Invalid or missing webhook token', {
          ip: req.ip,
          providedToken: providedToken ? '***' : 'none'
        });
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const payload = req.body;

    logger.info('[Webhook] BlockCypher notification received:', {
      txHash: payload.hash,
      confirmations: payload.confirmations,
      blockHeight: payload.block_height
    });

    // Parse webhook payload
    const paymentData = blockCypherService.parseWebhookPayload(payload);

    // CVE-PS-002: Check for replay attacks
    const webhookId = `blockcypher_${paymentData.txHash}_${payload.confirmations}`;
    const isAlreadyProcessed = await processedWebhookQueries.isProcessed(webhookId);

    if (isAlreadyProcessed) {
      logger.warn('[Webhook] Replay attack detected - webhook already processed', {
        webhookId,
        txHash: paymentData.txHash
      });
      return res.status(200).json({ status: 'already_processed' });
    }

    // CVE-PS-003: Start database transaction
    await client.query('BEGIN');

    try {
      // Mark webhook as processed (replay protection)
      await processedWebhookQueries.markAsProcessed({
        webhookId,
        source: 'blockcypher',
        txHash: paymentData.txHash,
        payload: payload
      });

      // Find invoice by checking all outputs
      let invoice = null;
      for (const output of paymentData.outputs) {
        if (output.addresses && output.addresses.length > 0) {
          for (const address of output.addresses) {
            invoice = await invoiceQueries.findByAddress(address);
            if (invoice) {break;}
          }
          if (invoice) {break;}
        }
      }

      if (!invoice) {
        logger.warn('[Webhook] No invoice found for transaction outputs');
        await client.query('COMMIT'); // Commit anyway to mark webhook as processed
        return res.status(404).json({ error: 'Invoice not found' });
      }

      logger.info(`[Webhook] Invoice found: ${invoice.id} for order ${invoice.order_id}`);

      // Check if payment already exists
      const existingPayment = await paymentQueries.findByTxHash(paymentData.txHash);

      // Determine status based on confirmations
      const chain = invoice.chain.toUpperCase();
      const confirmationThreshold = parseInt(process.env[`CONFIRMATIONS_${chain}`] || '3');
      const status = paymentData.confirmations >= confirmationThreshold ? 'confirmed' : 'pending';

      if (existingPayment) {
        // Update existing payment
        await paymentQueries.updateStatus(
          existingPayment.id,
          status,
          paymentData.confirmations
        );

        // If newly confirmed, update order
        if (status === 'confirmed' && existingPayment.status !== 'confirmed') {
          await updateOrderStatus(invoice.order_id, 'confirmed');
          await invoiceQueries.updateStatus(invoice.id, 'paid');

          // Commit transaction before sending Telegram notification
          await client.query('COMMIT');

          await sendTelegramNotification(invoice.order_id, 'confirmed');

          logger.info(`[Webhook] Order ${invoice.order_id} confirmed via BlockCypher!`);
        } else {
          await client.query('COMMIT');
        }

        return res.json({
          status: 'updated',
          confirmations: paymentData.confirmations,
          confirmed: status === 'confirmed'
        });
      }

      // Create new payment record
      const payment = await paymentQueries.create({
        orderId: invoice.order_id,
        txHash: paymentData.txHash,
        amount: paymentData.total,
        currency: invoice.currency,
        status: status
      });

      // Update payment with confirmations
      await paymentQueries.updateStatus(payment.id, status, paymentData.confirmations);

      logger.info(`[Webhook] Payment created: ${payment.id} with ${paymentData.confirmations} confirmations`);

      // If already confirmed, update order
      if (status === 'confirmed') {
        await updateOrderStatus(invoice.order_id, 'confirmed');
        await invoiceQueries.updateStatus(invoice.id, 'paid');

        // Commit transaction before sending Telegram notification
        await client.query('COMMIT');

        await sendTelegramNotification(invoice.order_id, 'confirmed');

        logger.info(`[Webhook] Order ${invoice.order_id} confirmed via BlockCypher!`);
      } else {
        await client.query('COMMIT');
      }

      return res.json({
        status: 'success',
        payment_id: payment.id,
        confirmations: paymentData.confirmations,
        confirmed: status === 'confirmed'
      });
    } catch (innerError) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw innerError;
    }
  } catch (error) {
    logger.error('[Webhook] Error processing BlockCypher webhook:', {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    // Release client back to pool
    client.release();
  }
});

export default router;
