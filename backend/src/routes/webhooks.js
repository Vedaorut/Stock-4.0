import express from 'express';
import * as blockCypherService from '../services/blockCypherService.js';
import {
  paymentQueries,
  invoiceQueries,
  orderQueries,
  processedWebhookQueries,
  productQueries,
  shopQueries,
  userQueries,
} from '../database/queries/index.js';
import { getClient } from '../config/database.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';
import { amountsMatchWithTolerance } from '../utils/paymentTolerance.js';
import invoicePaymentService from '../services/invoicePaymentService.js';

const router = express.Router();

// Webhook routes for payment verification (BlockCypher for BTC/LTC)
// ETH/USDT/TRON use polling service instead

/**
 * Helper: Update order status
 */
async function updateOrderStatus(orderId, status) {
  await orderQueries.updateStatus(orderId, status);
  logger.info(`[Webhook] Order ${orderId} status updated to ${status}`);
}

/**
 * Helper: Send Telegram notifications to buyer and seller
 */
async function sendTelegramNotification(orderId, status) {
  try {
    const order = await orderQueries.findById(orderId);
    if (!order) {
      logger.warn(`[Webhook] Order not found: ${orderId}`);
      return;
    }

    if (status === 'confirmed') {
      // Get product, shop, buyer, and seller info
      const [product, buyer] = await Promise.all([
        productQueries.findById(order.product_id),
        userQueries.findById(order.buyer_id),
      ]);

      const shop = await shopQueries.findById(product.shop_id);
      const seller = await userQueries.findById(shop.owner_id);

      // Notify buyer
      try {
        await telegramService.notifyPaymentConfirmed(order.buyer_telegram_id, {
          id: order.id,
          product_name: order.product_name,
          quantity: order.quantity,
          total_price: order.total_price,
          currency: order.currency,
          seller_username: seller.username,
          shop_name: shop.name,
        });
      } catch (notifError) {
        logger.error('[Webhook] Buyer notification error', {
          error: notifError.message,
          orderId,
        });
      }

      // Notify seller
      try {
        await telegramService.notifyPaymentConfirmedSeller(seller.telegram_id, {
          orderId: order.id,
          productName: product.name,
          quantity: order.quantity,
          totalPrice: order.total_price,
          currency: order.currency,
          buyerUsername: buyer.username || 'Anonymous',
          buyerTelegramId: buyer.telegram_id,
        });
      } catch (notifError) {
        logger.error('[Webhook] Seller notification error', {
          error: notifError.message,
          orderId,
        });
      }
    }
  } catch (error) {
    logger.error('[Webhook] Failed to send Telegram notification:', {
      error: error.message,
      orderId,
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
 * - P0-SEC-7: Always verify transactions against blockchain API
 *
 * SECURITY NOTE: BlockCypher webhooks don't support HMAC signatures.
 * We ALWAYS re-verify transactions against the blockchain API to prevent fake webhooks.
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
          providedToken: providedToken ? '***' : 'none',
        });
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const payload = req.body;

    logger.info('[Webhook] BlockCypher notification received:', {
      txHash: payload.hash,
      confirmations: payload.confirmations,
      blockHeight: payload.block_height,
    });

    // Parse webhook payload
    const paymentData = blockCypherService.parseWebhookPayload(payload);

    // CVE-PS-002: Check for replay attacks
    const webhookId = `blockcypher_${paymentData.txHash}_${payload.confirmations}`;
    const isAlreadyProcessed = await processedWebhookQueries.isProcessed(webhookId);

    if (isAlreadyProcessed) {
      logger.warn('[Webhook] Replay attack detected - webhook already processed', {
        webhookId,
        txHash: paymentData.txHash,
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
        payload: payload,
      });

      // Find invoice by checking all outputs
      let invoice = null;
      for (const output of paymentData.outputs) {
        if (output.addresses && output.addresses.length > 0) {
          for (const address of output.addresses) {
            invoice = await invoiceQueries.findByAddress(address);
            if (invoice) {
              break;
            }
          }
          if (invoice) {
            break;
          }
        }
      }

      if (!invoice) {
        logger.warn('[Webhook] No invoice found for transaction outputs');
        await client.query('COMMIT'); // Commit anyway to mark webhook as processed
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Determine invoice type
      const isOrderPayment = !!invoice.order_id;
      const isSubscriptionPayment = !!invoice.subscription_id;
      const invoiceType = isOrderPayment ? 'order' : 'subscription';

      logger.info(
        `[Webhook] Invoice found: ${invoice.id} for ${invoiceType} ${invoice.order_id || invoice.subscription_id}`
      );

      // SECURITY (P0-SEC-7): Always verify transaction against blockchain API
      // This prevents attackers from sending fake webhook payloads
      const chain = invoice.chain.toUpperCase();
      try {
        const verifiedTx = await blockCypherService.getTransaction(chain, paymentData.txHash);
        if (!verifiedTx) {
          logger.error('[Webhook] Transaction not found on blockchain', {
            txHash: paymentData.txHash,
            chain,
          });
          await client.query('COMMIT'); // Commit to mark webhook as processed
          return res.status(400).json({ error: 'Transaction not found on blockchain' });
        }

        // Verify transaction data matches webhook payload
        if (verifiedTx.confirmations !== payload.confirmations) {
          logger.warn('[Webhook] Confirmation count mismatch - using blockchain value', {
            webhook: payload.confirmations,
            blockchain: verifiedTx.confirmations,
            txHash: paymentData.txHash,
          });
          // Use blockchain value as source of truth
          paymentData.confirmations = verifiedTx.confirmations;
        }

        // Verify amount if it's an order payment
        if (isOrderPayment) {
          const expectedAmount = parseFloat(invoice.crypto_amount || invoice.expected_amount);
          
          // Find output to invoice address (instead of using total)
          const invoiceOutput = verifiedTx.outputs.find(
            (out) => out.addresses && out.addresses.includes(invoice.address)
          );
          
          if (!invoiceOutput) {
            logger.error('[Webhook] Invoice address not found in tx outputs', {
              invoiceAddress: invoice.address,
              txHash: paymentData.txHash,
              outputs: verifiedTx.outputs.map(o => o.addresses),
            });
            await client.query('COMMIT');
            return res.status(400).json({ error: 'Invoice address not in transaction outputs' });
          }
          
          const receivedAmount = invoiceOutput.value / 100000000; // Convert satoshis to BTC/LTC
          const chain = invoice.chain.toUpperCase();

          if (!amountsMatchWithTolerance(receivedAmount, expectedAmount, undefined, chain)) {
            logger.error('[Webhook] Amount mismatch', {
              expected: expectedAmount,
              received: receivedAmount,
              txHash: paymentData.txHash,
              chain,
            });
            await client.query('COMMIT'); // Commit to mark webhook as processed
            return res.status(400).json({ error: 'Payment amount does not match invoice' });
          }
        }
      } catch (verifyError) {
        logger.error('[Webhook] Blockchain verification failed', {
          error: verifyError.message,
          txHash: paymentData.txHash,
          chain,
        });
        await client.query('ROLLBACK');
        return res.status(500).json({ error: 'Failed to verify transaction on blockchain' });
      }

      // Check if payment already exists
      const existingPayment = await paymentQueries.findByTxHash(paymentData.txHash);

      // Determine status based on confirmations (chain already defined above)
      const confirmationThreshold = parseInt(process.env[`CONFIRMATIONS_${chain}`] || '3');
      const status = paymentData.confirmations >= confirmationThreshold ? 'confirmed' : 'pending';

      if (existingPayment) {
        // Update existing payment
        await paymentQueries.updateStatus(existingPayment.id, status, paymentData.confirmations, client);

        // If newly confirmed, update order or subscription
        if (status === 'confirmed' && existingPayment.status !== 'confirmed') {
          if (isSubscriptionPayment) {
            // COMMIT current transaction before delegating to invoicePaymentService
            // invoicePaymentService has its own transaction management
            await client.query('COMMIT');

            // Delegate to invoicePaymentService (single source of truth)
            const result = await invoicePaymentService.processSubscriptionPayment({
              subscriptionId: invoice.subscription_id,
              txHash: paymentData.txHash,
              invoiceId: invoice.id,
              purpose: invoice.purpose,
              mode: invoice.purpose === 'subscription_upgrade' ? 'upgrade' : null,
            });

            if (result.ok) {
              logger.info(
                `[Webhook] Subscription ${invoice.subscription_id} activated via BlockCypher (delegated to invoicePaymentService)!`
              );
            } else if (result.state !== 'already_processed') {
              logger.error('[Webhook] invoicePaymentService failed:', {
                result,
                invoiceId: invoice.id,
              });
            }
          } else {
            await updateOrderStatus(invoice.order_id, 'confirmed');
            await invoiceQueries.updateStatus(invoice.id, 'paid', paymentData.txHash);

            // Commit transaction before sending Telegram notification
            await client.query('COMMIT');

            await sendTelegramNotification(invoice.order_id, 'confirmed');

            logger.info(`[Webhook] Order ${invoice.order_id} confirmed via BlockCypher!`);
          }
        } else {
          await client.query('COMMIT');
        }

        return res.json({
          status: 'updated',
          confirmations: paymentData.confirmations,
          confirmed: status === 'confirmed',
        });
      }

      // Handle subscription payments - delegate to invoicePaymentService
      if (isSubscriptionPayment) {
        // COMMIT current transaction before delegating
        await client.query('COMMIT');

        if (status === 'confirmed') {
          // Delegate to invoicePaymentService (single source of truth)
          const result = await invoicePaymentService.processSubscriptionPayment({
            subscriptionId: invoice.subscription_id,
            txHash: paymentData.txHash,
            invoiceId: invoice.id,
            purpose: invoice.purpose,
            mode: invoice.purpose === 'subscription_upgrade' ? 'upgrade' : null,
          });

          if (result.ok) {
            logger.info(
              `[Webhook] Subscription ${invoice.subscription_id} activated via BlockCypher (delegated to invoicePaymentService)!`
            );
          } else if (result.state !== 'already_processed') {
            logger.error('[Webhook] invoicePaymentService failed:', {
              result,
              invoiceId: invoice.id,
            });
          }
        } else {
          logger.info(
            `[Webhook] Subscription payment pending (${paymentData.confirmations} confirmations)`
          );
        }

        return res.json({
          status: 'success',
          confirmations: paymentData.confirmations,
          confirmed: status === 'confirmed',
        });
      }

      // Create new payment record (for order payments only)
      const payment = await paymentQueries.create({
        orderId: invoice.order_id,
        txHash: paymentData.txHash,
        amount: paymentData.total,
        currency: invoice.currency,
        status: status,
      });

      // Update payment with confirmations
      await paymentQueries.updateStatus(payment.id, status, paymentData.confirmations, client);

      logger.info(
        `[Webhook] Payment created: ${payment.id} with ${paymentData.confirmations} confirmations`
      );

      // If already confirmed, update order
      if (status === 'confirmed') {
        await updateOrderStatus(invoice.order_id, 'confirmed');
        await invoiceQueries.updateStatus(invoice.id, 'paid', paymentData.txHash);

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
        confirmed: status === 'confirmed',
      });
    } catch (innerError) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw innerError;
    }
  } catch (error) {
    logger.error('[Webhook] Error processing BlockCypher webhook:', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    // Release client back to pool
    client.release();
  }
});

export default router;
