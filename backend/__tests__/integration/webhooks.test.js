/**
 * Integration Tests: Webhooks
 * Tests security fixes:
 * - CVE-PS-001: Secret token verification
 * - CVE-PS-002: Replay attack protection
 * - CVE-PS-003: Database transactions
 */

import request from 'supertest';
import express from 'express';
import webhookRoutes from '../../src/routes/webhooks.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import {
  getTestPool,
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop,
  createTestProduct
} from '../helpers/testDb.js';

// Create minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/webhooks', webhookRoutes);
  app.use(errorHandler);
  return app;
};

describe('Webhooks - Integration Tests', () => {
  let app;
  let pool;
  let user;
  let shop;
  let product;
  let order;
  let invoice;

  // Set webhook secret for tests
  const WEBHOOK_SECRET = 'test-webhook-secret-token';

  beforeAll(async () => {
    app = createTestApp();
    pool = getTestPool();

    // Set environment variable for webhook secret
    process.env.BLOCKCYPHER_WEBHOOK_SECRET = WEBHOOK_SECRET;

    // Ensure required tables exist (in case migrations haven't been run in test DB)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        chain VARCHAR(20) NOT NULL,
        address VARCHAR(255) UNIQUE NOT NULL,
        address_index INTEGER DEFAULT 0,
        expected_amount DECIMAL(18, 8) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        tatum_subscription_id VARCHAR(255),
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS processed_webhooks (
        id SERIAL PRIMARY KEY,
        webhook_id VARCHAR(255) UNIQUE NOT NULL,
        source VARCHAR(50) NOT NULL CHECK (source IN ('blockcypher', 'etherscan', 'trongrid')),
        tx_hash VARCHAR(255) NOT NULL,
        processed_at TIMESTAMP DEFAULT NOW(),
        payload JSONB
      );
    `);
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Clean up processed_webhooks table
    await pool.query('DELETE FROM processed_webhooks');

    // Create test data
    user = await createTestUser({
      telegramId: '9000003001',
      username: 'webhookuser'
    });

    shop = await createTestShop(user.id, {
      name: 'Webhook Test Shop'
    });

    product = await createTestProduct(shop.id, {
      name: 'Webhook Product',
      price: '100.00'
    });

    // Create order
    const orderResult = await pool.query(
      `INSERT INTO orders (buyer_id, product_id, quantity, total_price, currency, status)
       VALUES ($1, $2, 1, 100.00, 'BTC', 'pending')
       RETURNING *`,
      [user.id, product.id]
    );
    order = orderResult.rows[0];

    // Create invoice
    const invoiceResult = await pool.query(
      `INSERT INTO invoices (order_id, currency, chain, expected_amount, address, status)
       VALUES ($1, 'BTC', 'btc', 0.001, 'bc1test123456789', 'pending')
       RETURNING *`,
      [order.id]
    );
    invoice = invoiceResult.rows[0];
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.query('DELETE FROM processed_webhooks');
    await closeTestDb();
    delete process.env.BLOCKCYPHER_WEBHOOK_SECRET;
  });

  describe('POST /webhooks/blockcypher', () => {
    const createWebhookPayload = (confirmations = 3) => ({
      hash: 'test_tx_hash_' + Date.now(),
      confirmations,
      block_height: 700000,
      total: 100000, // satoshis
      outputs: [
        {
          addresses: [invoice.address],
          value: 100000
        }
      ]
    });

    describe('CVE-PS-001: Secret token verification', () => {
      it('should accept webhook with valid token in query parameter', async () => {
        const payload = createWebhookPayload();

        const response = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200);

        expect(response.body.status).toBe('success');
      });

      it('should accept webhook with valid token in header', async () => {
        const payload = createWebhookPayload();

        const response = await request(app)
          .post('/webhooks/blockcypher')
          .set('x-webhook-token', WEBHOOK_SECRET)
          .send(payload)
          .expect(200);

        expect(response.body.status).toBe('success');
      });

      it('should reject webhook with invalid token', async () => {
        const payload = createWebhookPayload();

        const response = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: 'wrong-token' })
          .send(payload)
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');

        // Verify no payment was created
        const payments = await pool.query(
          'SELECT * FROM payments WHERE tx_hash = $1',
          [payload.hash]
        );
        expect(payments.rows).toHaveLength(0);
      });

      it('should reject webhook with missing token', async () => {
        const payload = createWebhookPayload();

        const response = await request(app)
          .post('/webhooks/blockcypher')
          .send(payload)
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
      });

      it('should allow webhook if BLOCKCYPHER_WEBHOOK_SECRET not set', async () => {
        // Temporarily remove secret
        const originalSecret = process.env.BLOCKCYPHER_WEBHOOK_SECRET;
        delete process.env.BLOCKCYPHER_WEBHOOK_SECRET;

        const payload = createWebhookPayload();

        const response = await request(app)
          .post('/webhooks/blockcypher')
          .send(payload)
          .expect(200);

        expect(response.body.status).toBe('success');

        // Restore secret
        process.env.BLOCKCYPHER_WEBHOOK_SECRET = originalSecret;
      });
    });

    describe('CVE-PS-002: Replay attack protection', () => {
      it('should process webhook first time', async () => {
        const payload = createWebhookPayload();

        const response = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200);

        expect(response.body.status).toBe('success');
        expect(response.body.payment_id).toBeDefined();

        // Verify processed webhook recorded
        const webhookId = `blockcypher_${payload.hash}_${payload.confirmations}`;
        const processed = await pool.query(
          'SELECT * FROM processed_webhooks WHERE webhook_id = $1',
          [webhookId]
        );
        expect(processed.rows).toHaveLength(1);
        expect(processed.rows[0].source).toBe('blockcypher');
        expect(processed.rows[0].tx_hash).toBe(payload.hash);
      });

      it('should reject replay of same webhook (same confirmations)', async () => {
        const payload = createWebhookPayload();

        // First request - should succeed
        const response1 = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200);

        expect(response1.body.status).toBe('success');

        // Second request - should be rejected as replay
        const response2 = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200); // Returns 200 but with already_processed status

        expect(response2.body.status).toBe('already_processed');

        // Verify only one payment created
        const payments = await pool.query(
          'SELECT * FROM payments WHERE tx_hash = $1',
          [payload.hash]
        );
        expect(payments.rows).toHaveLength(1);
      });

      it('should allow same tx with different confirmations', async () => {
        const txHash = 'test_tx_hash_' + Date.now();

        // First webhook with 1 confirmation
        const payload1 = {
          hash: txHash,
          confirmations: 1,
          block_height: 700000,
          total: 100000,
          outputs: [{ addresses: [invoice.address], value: 100000 }]
        };

        const response1 = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload1)
          .expect(200);

        expect(response1.body.status).toBe('success');

        // Second webhook with 3 confirmations (different webhook_id)
        const payload2 = {
          ...payload1,
          confirmations: 3
        };

        const response2 = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload2)
          .expect(200);

        expect(response2.body.status).toBe('updated'); // Payment already exists, just updating

        // Verify both webhooks recorded as processed
        const processed = await pool.query(
          'SELECT * FROM processed_webhooks WHERE tx_hash = $1 ORDER BY created_at',
          [txHash]
        );
        expect(processed.rows).toHaveLength(2);
      });

      it('should store complete webhook payload for forensics', async () => {
        const payload = createWebhookPayload();

        await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200);

        const webhookId = `blockcypher_${payload.hash}_${payload.confirmations}`;
        const processed = await pool.query(
          'SELECT * FROM processed_webhooks WHERE webhook_id = $1',
          [webhookId]
        );

        expect(processed.rows[0].payload).toBeDefined();
        expect(processed.rows[0].payload.hash).toBe(payload.hash);
        expect(processed.rows[0].payload.confirmations).toBe(payload.confirmations);
      });
    });

    describe('CVE-PS-003: Database transactions', () => {
      it('should commit transaction on success', async () => {
        const payload = createWebhookPayload();

        const response = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200);

        expect(response.body.status).toBe('success');

        // Verify both payment AND processed_webhook were created
        const payments = await pool.query(
          'SELECT * FROM payments WHERE tx_hash = $1',
          [payload.hash]
        );
        expect(payments.rows).toHaveLength(1);

        const webhookId = `blockcypher_${payload.hash}_${payload.confirmations}`;
        const processed = await pool.query(
          'SELECT * FROM processed_webhooks WHERE webhook_id = $1',
          [webhookId]
        );
        expect(processed.rows).toHaveLength(1);
      });

      it('should rollback transaction on error', async () => {
        // Create payload with invalid invoice address
        const payload = {
          hash: 'test_tx_rollback_' + Date.now(),
          confirmations: 3,
          block_height: 700000,
          total: 100000,
          outputs: [
            {
              addresses: ['bc1_nonexistent_address_12345'],
              value: 100000
            }
          ]
        };

        const response = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(404); // Invoice not found

        expect(response.body.error).toBe('Invoice not found');

        // Verify NOTHING was created due to rollback
        const payments = await pool.query(
          'SELECT * FROM payments WHERE tx_hash = $1',
          [payload.hash]
        );
        expect(payments.rows).toHaveLength(0);

        // Webhook should still be marked as processed to prevent retries
        const webhookId = `blockcypher_${payload.hash}_${payload.confirmations}`;
        const processed = await pool.query(
          'SELECT * FROM processed_webhooks WHERE webhook_id = $1',
          [webhookId]
        );
        expect(processed.rows).toHaveLength(1); // Committed before error
      });

      it('should update order status when payment confirmed', async () => {
        const payload = createWebhookPayload(3); // 3 confirmations = confirmed

        await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200);

        // Verify order status updated
        const orderResult = await pool.query(
          'SELECT * FROM orders WHERE id = $1',
          [order.id]
        );
        expect(orderResult.rows[0].status).toBe('confirmed');

        // Verify invoice status updated
        const invoiceResult = await pool.query(
          'SELECT * FROM invoices WHERE id = $1',
          [invoice.id]
        );
        expect(invoiceResult.rows[0].status).toBe('paid');

        // Verify payment created with confirmed status
        const payments = await pool.query(
          'SELECT * FROM payments WHERE tx_hash = $1',
          [payload.hash]
        );
        expect(payments.rows[0].status).toBe('confirmed');
      });

      it('should keep order pending if confirmations insufficient', async () => {
        const payload = createWebhookPayload(1); // Only 1 confirmation

        await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200);

        // Verify order status still pending
        const orderResult = await pool.query(
          'SELECT * FROM orders WHERE id = $1',
          [order.id]
        );
        expect(orderResult.rows[0].status).toBe('pending');

        // Verify payment created with pending status
        const payments = await pool.query(
          'SELECT * FROM payments WHERE tx_hash = $1',
          [payload.hash]
        );
        expect(payments.rows[0].status).toBe('pending');
      });

      it('should handle confirmation threshold from environment', async () => {
        // Set custom threshold
        process.env.CONFIRMATIONS_BTC = '5';

        const payload = createWebhookPayload(3); // 3 confirmations, but threshold is 5

        await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200);

        // Verify payment is pending (3 < 5)
        const payments = await pool.query(
          'SELECT * FROM payments WHERE tx_hash = $1',
          [payload.hash]
        );
        expect(payments.rows[0].status).toBe('pending');

        // Reset to default
        process.env.CONFIRMATIONS_BTC = '3';
      });
    });

    describe('Edge cases and validation', () => {
      it('should handle multiple outputs correctly', async () => {
        const payload = {
          hash: 'test_tx_multi_output_' + Date.now(),
          confirmations: 3,
          block_height: 700000,
          total: 200000,
          outputs: [
            {
              addresses: ['bc1_other_address'],
              value: 100000
            },
            {
              addresses: [invoice.address], // Our address in second output
              value: 100000
            }
          ]
        };

        const response = await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload)
          .expect(200);

        expect(response.body.status).toBe('success');
      });

      it('should update existing payment confirmations', async () => {
        const txHash = 'test_tx_update_' + Date.now();

        // First webhook with 1 confirmation
        const payload1 = {
          hash: txHash,
          confirmations: 1,
          block_height: 700000,
          total: 100000,
          outputs: [{ addresses: [invoice.address], value: 100000 }]
        };

        await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload1)
          .expect(200);

        // Verify payment created with pending status
        let payments = await pool.query(
          'SELECT * FROM payments WHERE tx_hash = $1',
          [txHash]
        );
        expect(payments.rows[0].status).toBe('pending');

        // Second webhook with 3 confirmations
        const payload2 = {
          ...payload1,
          confirmations: 3
        };

        await request(app)
          .post('/webhooks/blockcypher')
          .query({ token: WEBHOOK_SECRET })
          .send(payload2)
          .expect(200);

        // Verify payment updated to confirmed
        payments = await pool.query(
          'SELECT * FROM payments WHERE tx_hash = $1',
          [txHash]
        );
        expect(payments.rows[0].status).toBe('confirmed');
        expect(payments.rows[0].confirmations).toBe(3);
      });
    });
  });
});
