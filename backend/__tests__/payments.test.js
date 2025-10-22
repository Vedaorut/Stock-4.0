/**
 * Payments Controller Tests
 * Tests for payment validation and NULL address prevention (P0-1)
 * 
 * Note: Blockchain verification tests are excluded due to ESM mocking limitations
 * Focus is on input validation which is the critical security fix
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from './helpers/testApp.js';
import { 
  getTestPool, 
  closeTestDb, 
  cleanupTestData,
  createTestUser,
  createTestShop,
  createTestProduct
} from './helpers/testDb.js';

const app = createTestApp();
let testPool;

beforeAll(() => {
  testPool = getTestPool();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('POST /api/payments/verify - Validation Tests', () => {
  it('should reject payment verification with NULL payment_address', async () => {
    // This test verifies P0-1 fix: Payment Address NULL

    const seller = await createTestUser({
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id, {
      wallet_btc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    });

    const product = await createTestProduct(shop.id, {
      price: '0.001',
      currency: 'BTC',
    });

    const buyer = await createTestUser();

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_id: product.id,
        quantity: 1,
      })
      .expect(201);

    const orderId = orderResponse.body.order.id;

    // Try to verify payment WITHOUT payment_address (null/undefined)
    const response = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        order_id: orderId,
        payment_address: null, // NULL address
        tx_hash: 'btc_tx_hash_null',
        crypto: 'BTC',
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toMatch(/payment_address.*required/i);
  });

  it('should reject payment verification with empty payment_address', async () => {
    const seller = await createTestUser({
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id, {
      wallet_btc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    });

    const product = await createTestProduct(shop.id, {
      price: '0.001',
      currency: 'BTC',
    });

    const buyer = await createTestUser();

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_id: product.id,
        quantity: 1,
      })
      .expect(201);

    const orderId = orderResponse.body.order.id;

    // Try to verify payment with EMPTY payment_address
    const response = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        order_id: orderId,
        payment_address: '', // Empty string
        tx_hash: 'btc_tx_hash_empty',
        crypto: 'BTC',
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject payment verification with invalid crypto type', async () => {
    const buyer = await createTestUser();

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        order_id: 1,
        payment_address: 'some_address',
        tx_hash: 'some_hash',
        crypto: 'INVALID_CRYPTO', // Invalid crypto type
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject payment verification without authentication', async () => {
    const response = await request(app)
      .post('/api/payments/verify')
      .send({
        order_id: 1,
        payment_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        tx_hash: 'btc_tx_hash',
        crypto: 'BTC',
      })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject payment verification for non-existent order', async () => {
    const buyer = await createTestUser();

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        order_id: 999999, // Non-existent order
        payment_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        tx_hash: 'btc_tx_hash',
        crypto: 'BTC',
      })
      .expect(404);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject payment verification with missing tx_hash', async () => {
    const buyer = await createTestUser();

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        order_id: 1,
        payment_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        // tx_hash missing
        crypto: 'BTC',
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });
});
