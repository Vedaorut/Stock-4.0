import express from 'express';
import * as crystalPayService from '../services/crystalPayService.js';
import {
  invoiceQueries,
  processedWebhookQueries,
} from '../database/queries/index.js';
import { getClient } from '../config/database.js';
import logger from '../utils/logger.js';
import invoicePaymentService from '../services/invoicePaymentService.js';
import metricsCollector from '../services/metricsCollector.js';
import { webhookLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * CrystalPay Webhook
 * POST /webhooks/crystalpay
 *
 * Handles payment notifications from CrystalPay gateway.
 * Used for subscription payments (BTC/LTC via CrystalPay hosted page).
 */
// DOS-WEBHOOK-001 FIX: Apply rate limiter to prevent DoS attacks
router.post('/crystalpay', webhookLimiter, async (req, res) => {
  const payload = req.body;

  logger.info('[Webhook] CrystalPay received', {
    id: payload.id,
    state: payload.state,
    method: payload.method
  });

  // DOS-WEBHOOK-001 FIX: Validate signature BEFORE acquiring DB connection
  // This prevents attackers from exhausting DB connections with invalid requests
  if (!crystalPayService.verifySignature(payload)) {
    logger.warn('[Webhook] CrystalPay: Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Only acquire DB connection after signature validation passes
  const client = await getClient();

  try {

    // 2. Replay protection
    const webhookId = `crystalpay_${payload.id}_${payload.state}`;

    await client.query('BEGIN');

    // PAY-P0-002 FIX: Atomic deduplication - try to insert first, check result
    // markAsProcessed uses INSERT ... ON CONFLICT DO NOTHING RETURNING *
    // If result is null, another request already processed this webhook
    const inserted = await processedWebhookQueries.markAsProcessed({
      webhookId,
      source: 'crystalpay',
      txHash: payload.id,
      payload
    }, client);

    if (!inserted) {
      // Another request already processed this webhook
      await client.query('ROLLBACK');
      return res.json({ status: 'already_processed' });
    }

    // 3. Find invoice by crystalpay_id
    const invoice = await invoiceQueries.findByCrystalPayId(payload.id, client);

    if (!invoice) {
      logger.warn('[Webhook] CrystalPay: Invoice not found', { crystalPayId: payload.id });
      await client.query('COMMIT');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.expires_at && new Date(invoice.expires_at) < new Date()) {
      logger.warn('[Webhook] CrystalPay: Invoice expired', {
        invoiceId: invoice.id,
        crystalPayId: payload.id,
        expiresAt: invoice.expires_at,
      });
      await client.query('COMMIT');
      return res.status(400).json({ error: 'Invoice expired' });
    }

    // 4. Only process 'payed' state
    if (payload.state !== 'payed') {
      logger.info('[Webhook] CrystalPay: Non-payment state', { state: payload.state });
      await client.query('COMMIT');
      return res.json({ status: 'skipped', state: payload.state });
    }

    // 5. SECURITY: Verify payment amount matches expected amount
    const paidAmount = parseFloat(payload.amount);
    const expectedAmount = parseFloat(invoice.expected_amount);

    if (isNaN(paidAmount) || paidAmount <= 0) {
      logger.warn('[Webhook] CrystalPay: Invalid paid amount in payload', {
        invoiceId: invoice.id,
        crystalPayId: payload.id,
        rawAmount: payload.amount
      });
      await client.query('COMMIT');
      return res.status(400).json({ 
        error: 'Invalid amount',
        message: 'Paid amount is invalid or missing'
      });
    }

    // Check for underpayment (reject)
    if (paidAmount < expectedAmount) {
      logger.warn('[Webhook] CrystalPay: UNDERPAYMENT DETECTED', {
        invoiceId: invoice.id,
        crystalPayId: payload.id,
        expected: expectedAmount,
        received: paidAmount,
        difference: expectedAmount - paidAmount,
        currency: invoice.currency
      });
      await client.query('COMMIT');
      return res.status(400).json({ 
        error: 'Amount mismatch',
        message: 'Paid amount is less than expected',
        expected: expectedAmount,
        received: paidAmount
      });
    }

    // Log overpayment (allow but record)
    if (paidAmount > expectedAmount) {
      logger.info('[Webhook] CrystalPay: Overpayment detected (allowed)', {
        invoiceId: invoice.id,
        crystalPayId: payload.id,
        expected: expectedAmount,
        received: paidAmount,
        overpayment: paidAmount - expectedAmount,
        currency: invoice.currency
      });
    }

    // 6. SECURITY: Verify currency matches - MUST reject mismatches
    // This prevents attacks where someone pays 25 RUB instead of 25 USD
    if (invoice.currency && payload.currency) {
      const expectedCurrency = invoice.currency.toUpperCase();
      const receivedCurrency = payload.currency.toUpperCase();

      if (receivedCurrency !== expectedCurrency) {
        logger.error('[Webhook] CrystalPay: CURRENCY MISMATCH - REJECTING', {
          invoiceId: invoice.id,
          crystalPayId: payload.id,
          expectedCurrency,
          receivedCurrency,
          expectedAmount: expectedAmount,
          paidAmount: paidAmount,
          securityNote: 'Possible currency exploitation attempt'
        });
        await client.query('COMMIT');
        return res.status(400).json({
          error: 'Currency mismatch',
          message: `Expected ${expectedCurrency}, received ${receivedCurrency}`,
          expected: expectedCurrency,
          received: receivedCurrency
        });
      }
    }

    // 7. Process payment based on invoice type
    if (invoice.subscription_id) {
      // Handle subscription payment INSIDE transaction
      // SECURITY: webhookVerified=true indicates this call comes from verified webhook
      // (signature already checked above), allowing processor to skip manual verification block
      const result = await invoicePaymentService.processSubscriptionPayment({
        subscriptionId: invoice.subscription_id,
        txHash: `crystalpay_${payload.id}`,
        invoiceId: invoice.id,
        purpose: invoice.purpose,
        webhookVerified: true,
      });

      // COMMIT only after successful payment processing
      await client.query('COMMIT');

      logger.info('[Webhook] CrystalPay: Subscription payment processed', {
        invoiceId: invoice.id,
        result: result.ok
      });

      return res.json({ status: 'success', confirmed: result.ok });

    } else {
      await client.query('COMMIT');
      logger.warn('[Webhook] CrystalPay: Invoice has no subscription', {
        invoiceId: invoice.id
      });
      return res.status(400).json({ error: 'Invalid invoice type' });
    }

  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      logger.error('[Webhook] ROLLBACK failed:', rollbackErr);
    });
    // Record webhook failure metric
    metricsCollector.recordWebhookFailure('crystalpay', error);
    logger.error('[Webhook] CrystalPay error', { error: error.message });
    return res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

export default router;
