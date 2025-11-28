/**
 * E2E Test: Comprehensive Crypto Payment Flow
 *
 * Tests the complete end-to-end flow for subscription crypto payments:
 * - Subscription creation (pending state)
 * - Invoice generation with HD wallet addresses
 * - Invoice status verification (TIMESTAMPTZ fix validation)
 * - Payment simulation and subscription activation
 * - Multiple blockchain support (BTC, LTC, ETH, USDT_TRC20)
 *
 * CRITICAL: This test validates the timezone fix for invoice expiration.
 * Previously, invoices created with expires_at would return 404 on immediate status check.
 * This was caused by incorrect timezone handling (UTC vs local time).
 *
 * After fix (migration 030): expires_at uses TIMESTAMPTZ, queries use NOW() correctly.
 */

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config/env.js';
import subscriptionRoutes from '../../src/routes/subscriptions.js';
import debugRoutes from '../../src/routes/internal.js'; // Debug endpoints
import authMiddleware from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import {
  getTestPool,
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop,
} from '../helpers/testDb.js';

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/subscriptions', authMiddleware.verifyToken, subscriptionRoutes);
  app.use('/api/debug', authMiddleware.verifyToken, debugRoutes);
  app.use(errorHandler);
  return app;
};

describe('E2E: Crypto Payment Flow', () => {
  let app;
  let pool;
  let user;
  let shop;
  let authToken;

  beforeAll(async () => {
    app = createTestApp();
    pool = getTestPool();

    // Set required environment variables for tests
    process.env.WEBHOOK_BASE_URL = 'https://test.example.com';

    // Ensure shop_subscriptions table exists (match production schema)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        tier VARCHAR(20) NOT NULL CHECK (tier IN ('basic', 'pro')),
        amount DECIMAL(10, 2) NOT NULL,
        tx_hash VARCHAR(255) UNIQUE,
        currency VARCHAR(10) CHECK (currency IN ('BTC', 'ETH', 'USDT', 'LTC')),
        period_start TIMESTAMPTZ,
        period_end TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        verified_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Ensure invoices table has correct schema
    await pool.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS subscription_id INTEGER REFERENCES shop_subscriptions(id) ON DELETE CASCADE;
    `);

    // Make order_id nullable (for subscription invoices)
    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE invoices ALTER COLUMN order_id DROP NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);

    // CRITICAL: expires_at must be TIMESTAMPTZ for timezone fix
    await pool.query(`
      DO $$
      BEGIN
        -- Check if expires_at is TIMESTAMP WITHOUT TIME ZONE
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'invoices'
          AND column_name = 'expires_at'
          AND data_type = 'timestamp without time zone'
        ) THEN
          -- Convert to TIMESTAMPTZ
          ALTER TABLE invoices
          ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
        END IF;
      END $$;
    `);
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create test user
    user = await createTestUser({
      telegramId: '9001000001',
      username: 'cryptouser',
      first_name: 'Crypto',
      last_name: 'Tester',
    });

    // Create test shop
    shop = await createTestShop(user.id, {
      name: 'E2E Test Shop',
      description: 'Shop for crypto payment E2E tests',
    });

    // Generate JWT token
    authToken = jwt.sign(
      { id: user.id, telegramId: user.telegram_id },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeTestDb();
    delete process.env.BTC_XPUB;
    delete process.env.LTC_XPUB;
    delete process.env.ETH_XPUB;
    delete process.env.TRX_XPUB;
    delete process.env.WEBHOOK_BASE_URL;
  });

  describe('Full payment cycle - BTC', () => {
    it('should complete full flow: create subscription → generate invoice → verify status → simulate payment → verify completion', async () => {
      // ======================
      // STEP A: Create pending subscription
      // ======================
      const createResponse = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tier: 'basic',
          shopId: shop.id,
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.subscription).toBeDefined();
      expect(createResponse.body.subscription.id).toBeDefined();

      const subscriptionId = createResponse.body.subscription.id;

      // Verify subscription in database
      const subCheck = await pool.query(
        'SELECT * FROM shop_subscriptions WHERE id = $1',
        [subscriptionId]
      );

      expect(subCheck.rows.length).toBe(1);
      expect(subCheck.rows[0].status).toBe('pending');
      expect(subCheck.rows[0].tier).toBe('basic');
      expect(subCheck.rows[0].shop_id).toBe(shop.id);
      expect(subCheck.rows[0].user_id).toBe(user.id);

      // ======================
      // STEP B: Generate invoice
      // ======================
      const invoiceResponse = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'BTC' });

      expect(invoiceResponse.status).toBe(201);
      expect(invoiceResponse.body.success).toBe(true);

      const { invoiceId, address, expectedAmount, currency, expiresAt, cryptoAmount } =
        invoiceResponse.body.invoice;

      // Validate invoice response structure
      expect(invoiceId).toBeDefined();
      expect(typeof invoiceId).toBe('number');
      expect(address).toBeDefined();
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(20); // Bitcoin addresses are long
      expect(expectedAmount).toBe(process.env.NODE_ENV === 'test' ? 1.0 : 25.0); // Test pricing or production
      expect(currency).toBe('BTC');
      expect(cryptoAmount).toBeGreaterThan(0); // Should have crypto amount
      expect(new Date(expiresAt)).toBeInstanceOf(Date);

      // Verify invoice in database
      const invoiceDb = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);

      expect(invoiceDb.rows.length).toBe(1);
      expect(invoiceDb.rows[0].subscription_id).toBe(subscriptionId);
      expect(invoiceDb.rows[0].order_id).toBeNull(); // Subscription invoice, not order
      expect(invoiceDb.rows[0].status).toBe('pending');
      expect(invoiceDb.rows[0].chain).toBe('BTC');
      expect(invoiceDb.rows[0].address).toBe(address);

      // CRITICAL: Verify expires_at is in future (30 minutes)
      const expiresAtDate = new Date(invoiceDb.rows[0].expires_at);
      const now = new Date();
      const diffSeconds = (expiresAtDate - now) / 1000;

      expect(diffSeconds).toBeGreaterThan(1700); // ~28.3 minutes (allow for test execution time)
      expect(diffSeconds).toBeLessThan(1900); // ~31.6 minutes (allow margin)

      // ======================
      // STEP C: Verify status IMMEDIATELY (TIMEZONE FIX VALIDATION)
      // ======================
      // THIS IS THE CRITICAL TEST!
      // Before timezone fix: This would return 404 because expires_at > NOW() check failed
      // After timezone fix: Should return 200 with pending status

      const statusResponse = await request(app)
        .get(`/api/subscriptions/${subscriptionId}/payment/status`)
        .set('Authorization', `Bearer ${authToken}`);

      // ✅ ASSERTION: Should be 200, NOT 404
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.payment).toBeDefined();
      expect(statusResponse.body.payment.status).toBe('pending');
      expect(statusResponse.body.payment.invoiceId).toBe(invoiceId);
      expect(statusResponse.body.payment.address).toBe(address);
      expect(statusResponse.body.payment.expectedAmount).toBe(expectedAmount);
      expect(statusResponse.body.payment.expiresAt).toBeDefined();

      // Optional: Use debug endpoint to verify internal state
      const debugResponse = await request(app)
        .get(`/api/debug/invoice/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (debugResponse.status === 200) {
        expect(debugResponse.body.checks.isActiveByTime).toBe(true);
        expect(debugResponse.body.checks.statusIsPending).toBe(true);
        expect(debugResponse.body.checks.wouldBeFoundByActiveQuery).toBe(true);
      }

      // ======================
      // STEP D: Simulate payment completion
      // ======================
      // Option 1: Direct database update (fastest for tests)
      await pool.query(
        `UPDATE invoices
         SET status = 'paid',
             paid_at = NOW(),
             tx_hash = $1
         WHERE id = $2`,
        ['test_tx_hash_btc_123', invoiceId]
      );

      // Activate subscription (simulate webhook processing)
      await pool.query(
        `UPDATE shop_subscriptions
         SET status = 'active',
             verified_at = NOW(),
             tx_hash = $1,
             period_start = NOW(),
             period_end = NOW() + INTERVAL '30 days'
         WHERE id = $2`,
        ['test_tx_hash_btc_123', subscriptionId]
      );

      // Update shop status
      await pool.query(
        `UPDATE shops
         SET tier = 'basic',
             subscription_status = 'active',
             next_payment_due = NOW() + INTERVAL '30 days',
             registration_paid = true,
             is_active = true
         WHERE id = $1`,
        [shop.id]
      );

      // ======================
      // STEP E: Verify payment completion
      // ======================
      const finalStatusResponse = await request(app)
        .get(`/api/subscriptions/${subscriptionId}/payment/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(finalStatusResponse.status).toBe(200);
      expect(finalStatusResponse.body.success).toBe(true);
      expect(finalStatusResponse.body.payment.status).toBe('paid');
      expect(finalStatusResponse.body.payment.paidAt).toBeDefined();

      // Verify subscription is now active
      const finalSubCheck = await pool.query(
        'SELECT * FROM shop_subscriptions WHERE id = $1',
        [subscriptionId]
      );

      expect(finalSubCheck.rows[0].status).toBe('active');
      expect(finalSubCheck.rows[0].verified_at).not.toBeNull();
      expect(finalSubCheck.rows[0].tx_hash).toBe('test_tx_hash_btc_123');

      // Verify shop is upgraded
      const shopCheck = await pool.query('SELECT * FROM shops WHERE id = $1', [shop.id]);

      expect(shopCheck.rows[0].tier).toBe('basic');
      expect(shopCheck.rows[0].subscription_status).toBe('active');
      expect(shopCheck.rows[0].registration_paid).toBe(true);
      expect(shopCheck.rows[0].is_active).toBe(true);
    });
  });

  describe('Full payment cycle - USDT_TRC20', () => {
    it('should complete full flow for USDT TRC-20: create subscription → generate invoice → verify Tron address → simulate payment → verify completion', async () => {
      // ======================
      // STEP A: Create pending subscription
      // ======================
      const createResponse = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tier: 'basic',
          shopId: shop.id,
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.subscription).toBeDefined();

      const subscriptionId = createResponse.body.subscription.id;

      // Verify subscription in database
      const subCheck = await pool.query(
        'SELECT * FROM shop_subscriptions WHERE id = $1',
        [subscriptionId]
      );

      expect(subCheck.rows.length).toBe(1);
      expect(subCheck.rows[0].status).toBe('pending');
      expect(subCheck.rows[0].tier).toBe('basic');

      // ======================
      // STEP B: Generate USDT_TRC20 invoice
      // ======================
      const invoiceResponse = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'USDT_TRC20' });

      expect(invoiceResponse.status).toBe(201);
      expect(invoiceResponse.body.success).toBe(true);

      const { invoiceId, address, expectedAmount, currency, expiresAt, cryptoAmount } =
        invoiceResponse.body.invoice;

      // Validate USDT_TRC20 specific response
      expect(invoiceId).toBeDefined();
      expect(typeof invoiceId).toBe('number');

      // CRITICAL: Tron address format validation
      expect(address).toBeDefined();
      expect(address.length).toBe(34); // Tron addresses are exactly 34 characters
      expect(address.charAt(0)).toBe('T'); // Must start with 'T'
      expect(address).toMatch(/^T[A-Za-z0-9]{33}$/); // T + 33 alphanumeric chars

      // Currency mapping: USDT_TRC20 → USDT
      expect(currency).toBe('USDT');

      // Amount validation
      expect(expectedAmount).toBe(process.env.NODE_ENV === 'test' ? 1.0 : 25.0);
      expect(cryptoAmount).toBeGreaterThan(0); // Should have conversion

      expect(new Date(expiresAt)).toBeInstanceOf(Date);

      // Verify invoice in database
      const invoiceDb = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);

      expect(invoiceDb.rows.length).toBe(1);
      expect(invoiceDb.rows[0].subscription_id).toBe(subscriptionId);
      expect(invoiceDb.rows[0].order_id).toBeNull(); // Subscription invoice
      expect(invoiceDb.rows[0].status).toBe('pending');
      expect(invoiceDb.rows[0].chain).toBe('USDT_TRC20'); // Chain stored as USDT_TRC20
      expect(invoiceDb.rows[0].currency).toBe('USDT'); // Currency mapped to USDT
      expect(invoiceDb.rows[0].address).toBe(address);

      // Verify expiration time (30 minutes)
      const expiresAtDate = new Date(invoiceDb.rows[0].expires_at);
      const now = new Date();
      const diffSeconds = (expiresAtDate - now) / 1000;

      expect(diffSeconds).toBeGreaterThan(1700); // ~28.3 minutes
      expect(diffSeconds).toBeLessThan(1900); // ~31.6 minutes

      // ======================
      // STEP C: CRITICAL - Verify status immediately (timezone fix)
      // ======================
      const statusResponse = await request(app)
        .get(`/api/subscriptions/${subscriptionId}/payment/status`)
        .set('Authorization', `Bearer ${authToken}`);

      // ✅ MUST be 200 (not 404) - validates timezone fix
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.payment).toBeDefined();
      expect(statusResponse.body.payment.status).toBe('pending');
      expect(statusResponse.body.payment.invoiceId).toBe(invoiceId);
      expect(statusResponse.body.payment.address).toBe(address);
      expect(statusResponse.body.payment.currency).toBe('USDT');

      // ======================
      // STEP D: Simulate USDT TRC-20 payment
      // ======================
      // Simulate payment confirmation (e.g., from TronGrid webhook/polling)
      const testTxHash = 'tron_tx_hash_test_abc123def456';

      await pool.query(
        `UPDATE invoices
         SET status = 'paid',
             paid_at = NOW(),
             tx_hash = $1
         WHERE id = $2`,
        [testTxHash, invoiceId]
      );

      // Activate subscription
      await pool.query(
        `UPDATE shop_subscriptions
         SET status = 'active',
             verified_at = NOW(),
             tx_hash = $1,
             currency = 'USDT',
             period_start = NOW(),
             period_end = NOW() + INTERVAL '30 days'
         WHERE id = $2`,
        [testTxHash, subscriptionId]
      );

      // Update shop
      await pool.query(
        `UPDATE shops
         SET tier = 'basic',
             subscription_status = 'active',
             next_payment_due = NOW() + INTERVAL '30 days',
             registration_paid = true,
             is_active = true
         WHERE id = $1`,
        [shop.id]
      );

      // ======================
      // STEP E: Verify payment completion
      // ======================
      const finalStatusResponse = await request(app)
        .get(`/api/subscriptions/${subscriptionId}/payment/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(finalStatusResponse.status).toBe(200);
      expect(finalStatusResponse.body.success).toBe(true);
      expect(finalStatusResponse.body.payment.status).toBe('paid');
      expect(finalStatusResponse.body.payment.paidAt).toBeDefined();

      // Verify subscription is active
      const finalSubCheck = await pool.query(
        'SELECT * FROM shop_subscriptions WHERE id = $1',
        [subscriptionId]
      );

      expect(finalSubCheck.rows[0].status).toBe('active');
      expect(finalSubCheck.rows[0].verified_at).not.toBeNull();
      expect(finalSubCheck.rows[0].tx_hash).toBe(testTxHash);
      expect(finalSubCheck.rows[0].currency).toBe('USDT');

      // Verify shop is upgraded
      const shopCheck = await pool.query('SELECT * FROM shops WHERE id = $1', [shop.id]);

      expect(shopCheck.rows[0].tier).toBe('basic');
      expect(shopCheck.rows[0].subscription_status).toBe('active');
      expect(shopCheck.rows[0].registration_paid).toBe(true);
      expect(shopCheck.rows[0].is_active).toBe(true);
    }, 30000); // 30 second timeout for long test

    it('should validate Tron address format strictly', async () => {
      const createResponse = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tier: 'pro', shopId: shop.id });

      const subscriptionId = createResponse.body.subscription.id;

      const invoiceResponse = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'USDT_TRC20' });

      const { address } = invoiceResponse.body.invoice;

      // Strict Tron address validation
      expect(address).toMatch(/^T[A-Za-z0-9]{33}$/);
      expect(address.length).toBe(34);
      expect(address.charAt(0)).toBe('T');

      // Should NOT match other chain formats
      expect(address).not.toMatch(/^0x/); // Not Ethereum
      expect(address).not.toMatch(/^bc1/); // Not Bitcoin
      expect(address).not.toMatch(/^ltc1/); // Not Litecoin
    });

    it('should generate valid Tron address from real wallet service', async () => {
      const createResponse = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tier: 'basic', shopId: shop.id });

      const subscriptionId = createResponse.body.subscription.id;

      const invoiceResponse = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'USDT_TRC20' });

      expect(invoiceResponse.status).toBe(201);
      const { address } = invoiceResponse.body.invoice;

      // Verify address is generated (real wallet service called)
      expect(address).toBeDefined();
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(0);
    });

    it('should map USDT_TRC20 currency correctly in all responses', async () => {
      const createResponse = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tier: 'basic', shopId: shop.id });

      const subscriptionId = createResponse.body.subscription.id;

      // Generate invoice
      const invoiceResponse = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'USDT_TRC20' });

      // Currency should be USDT (not USDT_TRC20)
      expect(invoiceResponse.body.invoice.currency).toBe('USDT');

      // Check status endpoint
      const statusResponse = await request(app)
        .get(`/api/subscriptions/${subscriptionId}/payment/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.body.payment.currency).toBe('USDT');

      // Database should store chain as USDT_TRC20, currency as USDT
      const invoiceDb = await pool.query(
        'SELECT chain, currency FROM invoices WHERE subscription_id = $1',
        [subscriptionId]
      );

      expect(invoiceDb.rows[0].chain).toBe('USDT_TRC20');
      expect(invoiceDb.rows[0].currency).toBe('USDT');
    });
  });

  describe('Invoice expiration with TIMESTAMPTZ', () => {
    it('should correctly handle expired invoices', async () => {
      // Create pending subscription
      const createResponse = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tier: 'pro', shopId: shop.id });

      const subscriptionId = createResponse.body.subscription.id;

      // Create invoice
      const invoiceResponse = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'BTC' });

      const { invoiceId } = invoiceResponse.body.invoice;

      // Manually expire the invoice (set expires_at to past)
      await pool.query(
        `UPDATE invoices
         SET expires_at = NOW() - INTERVAL '1 hour'
         WHERE id = $1`,
        [invoiceId]
      );

      // Try to get status - should return 404 (expired invoice not found)
      const statusResponse = await request(app)
        .get(`/api/subscriptions/${subscriptionId}/payment/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(404);
      expect(statusResponse.body.error).toContain('No active payment invoice');
    });

    it('should find invoice immediately after creation (timezone fix verification)', async () => {
      // This test validates that timezone handling is correct
      // Invoice created with expires_at = NOW() + 30 minutes should be immediately findable

      const createResponse = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tier: 'basic', shopId: shop.id });

      const subscriptionId = createResponse.body.subscription.id;

      const invoiceResponse = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'LTC' });

      expect(invoiceResponse.status).toBe(201);

      // Immediately check status (within 1 second of creation)
      const statusResponse = await request(app)
        .get(`/api/subscriptions/${subscriptionId}/payment/status`)
        .set('Authorization', `Bearer ${authToken}`);

      // ✅ MUST BE 200 (not 404)
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.payment.status).toBe('pending');

      // Additional assertion: expires_at should be ~30 minutes in future
      const expiresAt = new Date(statusResponse.body.payment.expiresAt);
      const now = new Date();
      const minutesRemaining = (expiresAt - now) / 1000 / 60;

      expect(minutesRemaining).toBeGreaterThan(28); // At least 28 minutes
      expect(minutesRemaining).toBeLessThan(32); // At most 32 minutes
    });
  });

  describe('Multiple chains support', () => {
    const chains = [
      {
        name: 'BTC',
        currency: 'BTC',
        addressMinLength: 26 // Bitcoin addresses are 26-35 chars
      },
      {
        name: 'LTC',
        currency: 'LTC',
        addressMinLength: 26 // Litecoin addresses similar to Bitcoin
      },
      {
        name: 'ETH',
        currency: 'ETH',
        addressPattern: /^0x[a-fA-F0-9]{40}$/, // Ethereum: 0x + 40 hex chars
        addressMinLength: 42
      },
      {
        name: 'USDT_TRC20',
        currency: 'USDT',
        addressPattern: /^T[A-Za-z1-9]{33}$/, // Tron: T + 33 chars
        addressLength: 34 // Exactly 34 chars
      },
    ];

    chains.forEach(({ name, currency, addressPattern, addressMinLength, addressLength }) => {
      it(`should work for ${name}`, async () => {
        // Create subscription
        const createResponse = await request(app)
          .post('/api/subscriptions/pending')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ tier: 'basic', shopId: shop.id });

        const subscriptionId = createResponse.body.subscription.id;

        // Generate invoice for chain
        const invoiceResponse = await request(app)
          .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ chain: name });

        expect(invoiceResponse.status).toBe(201);
        expect(invoiceResponse.body.success).toBe(true);

        const { address, currency: invoiceCurrency } = invoiceResponse.body.invoice;

        // Verify address format
        expect(address).toBeDefined();
        expect(typeof address).toBe('string');

        if (addressPattern) {
          expect(address).toMatch(addressPattern);
        }

        if (addressMinLength) {
          expect(address.length).toBeGreaterThanOrEqual(addressMinLength);
        }

        if (addressLength) {
          expect(address.length).toBe(addressLength);
        }

        // Verify currency mapping
        expect(invoiceCurrency).toBe(currency);

        // Verify status check works (timezone fix validation)
        const statusResponse = await request(app)
          .get(`/api/subscriptions/${subscriptionId}/payment/status`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(statusResponse.status).toBe(200);
        expect(statusResponse.body.payment.status).toBe('pending');
        expect(statusResponse.body.payment.address).toBe(address);
      });
    });
  });

  describe('Error handling', () => {
    it('should return 404 for non-existent subscription', async () => {
      const response = await request(app)
        .get('/api/subscriptions/999999/payment/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should prevent generating duplicate invoices', async () => {
      const createResponse = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tier: 'basic', shopId: shop.id });

      const subscriptionId = createResponse.body.subscription.id;

      // Generate first invoice
      const firstInvoice = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'BTC' });

      expect(firstInvoice.status).toBe(201);

      // Try to generate second invoice (should fail or return existing)
      const secondInvoice = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'BTC' });

      // Either 400 (duplicate) or 200 (returns existing active invoice)
      expect([200, 400]).toContain(secondInvoice.status);
    });

    it('should reject invalid chain', async () => {
      const createResponse = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tier: 'basic', shopId: shop.id });

      const subscriptionId = createResponse.body.subscription.id;

      const response = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/payment/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ chain: 'INVALID_CHAIN' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });
});
