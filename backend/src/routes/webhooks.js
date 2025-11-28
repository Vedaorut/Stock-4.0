import express from 'express';
import * as crystalPayService from '../services/crystalPayService.js';
import {
  invoiceQueries,
  processedWebhookQueries,
} from '../database/queries/index.js';
import { getClient } from '../config/database.js';
import logger from '../utils/logger.js';
import invoicePaymentService from '../services/invoicePaymentService.js';

const router = express.Router();

/**
 * CrystalPay Webhook
 * POST /webhooks/crystalpay
 *
 * Handles payment notifications from CrystalPay gateway.
 * Used for subscription payments (BTC/LTC via CrystalPay hosted page).
 */
router.post('/crystalpay', async (req, res) => {
  const client = await getClient();

  try {
    const payload = req.body;

    logger.info('[Webhook] CrystalPay received', {
      id: payload.id,
      state: payload.state,
      method: payload.method
    });

    // 1. Verify signature
    if (!crystalPayService.verifySignature(payload)) {
      logger.warn('[Webhook] CrystalPay: Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 2. Replay protection
    const webhookId = `crystalpay_${payload.id}_${payload.state}`;

    await client.query('BEGIN');

    const isProcessed = await processedWebhookQueries.isProcessed(webhookId, client);
    if (isProcessed) {
      await client.query('ROLLBACK');
      return res.json({ status: 'already_processed' });
    }

    await processedWebhookQueries.markAsProcessed({
      webhookId,
      source: 'crystalpay',
      txHash: payload.id,
      payload
    }, client);

    // 3. Find invoice by crystalpay_id
    const invoice = await invoiceQueries.findByCrystalPayId(payload.id, client);

    if (!invoice) {
      logger.warn('[Webhook] CrystalPay: Invoice not found', { crystalPayId: payload.id });
      await client.query('COMMIT');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // 4. Only process 'payed' state
    if (payload.state !== 'payed') {
      logger.info('[Webhook] CrystalPay: Non-payment state', { state: payload.state });
      await client.query('COMMIT');
      return res.json({ status: 'skipped', state: payload.state });
    }

    await client.query('COMMIT');

    // 5. Process payment based on invoice type
    if (invoice.subscription_id) {
      // Handle subscription payment
      const result = await invoicePaymentService.processSubscriptionPayment({
        subscriptionId: invoice.subscription_id,
        txHash: `crystalpay_${payload.id}`,
        invoiceId: invoice.id,
        purpose: invoice.purpose
      });

      logger.info('[Webhook] CrystalPay: Subscription payment processed', {
        invoiceId: invoice.id,
        result: result.ok
      });

      return res.json({ status: 'success', confirmed: result.ok });

    } else {
      logger.warn('[Webhook] CrystalPay: Invoice has no subscription', {
        invoiceId: invoice.id
      });
      return res.status(400).json({ error: 'Invalid invoice type' });
    }

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('[Webhook] CrystalPay error', { error: error.message });
    return res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

export default router;
