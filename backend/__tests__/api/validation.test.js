/**
 * Validation Tests
 *
 * Tests for input validation on endpoints
 * Prevents invalid data and injection attacks
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server.js';
import { config } from '../../src/config/env.js';
import { userQueries, shopQueries, productQueries } from '../../src/database/queries/index.js';
import { getClient } from '../../src/config/database.js';

describe('Validation Tests', () => {
  let user, token, shop, product;

  beforeAll(async () => {
    // Create test user
    user = await userQueries.create({
      telegram_id: Math.floor(Math.random() * 1000000),
      username: 'validationuser',
      first_name: 'Validation',
      last_name: 'Test',
    });

    // Generate token
    token = jwt.sign(
      { id: user.id, telegramId: user.telegram_id, username: user.username },
      config.jwt.secret,
      { expiresIn: '1d' }
    );

    // Create shop
    shop = await shopQueries.create({
      owner_id: user.id,
      name: 'validationshop',
      description: 'Test Shop',
      subscription_tier: 'pro',
      subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Create product
    product = await productQueries.create({
      shop_id: shop.id,
      name: 'Test Product',
      description: 'Test',
      price: 100,
      currency: 'USD',
      stock: 10,
    });
  });

  afterAll(async () => {
    // Cleanup
    const client = await getClient();
    try {
      await client.query('DELETE FROM products WHERE shop_id = $1', [shop.id]);
      await client.query('DELETE FROM shops WHERE id = $1', [shop.id]);
      await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    } finally {
      client.release();
    }
  });

  describe('P0-API-4: Wallet Address Validation', () => {
    // Note: Controller uses snake_case field names (wallet_btc, wallet_eth, etc.)
    test('Should accept valid BTC address', async () => {
      const response = await request(app)
        .put(`/api/shops/${shop.id}/wallets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          wallet_btc: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        });

      expect(response.status).toBe(200);
    });

    test('Should accept valid ETH address', async () => {
      const response = await request(app)
        .put(`/api/shops/${shop.id}/wallets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          // Valid ETH address: 0x + 40 hex characters
          wallet_eth: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        });

      expect(response.status).toBe(200);
    });

    test('Should accept valid USDT (ERC20) address', async () => {
      // Note: System expects USDT as ERC20 format (Ethereum address), not TRON
      const response = await request(app)
        .put(`/api/shops/${shop.id}/wallets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          wallet_usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        });

      expect(response.status).toBe(200);
    });

    test('Should accept valid LTC address', async () => {
      const response = await request(app)
        .put(`/api/shops/${shop.id}/wallets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          wallet_ltc: 'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL',
        });

      expect(response.status).toBe(200);
    });

    test('Should reject invalid BTC address', async () => {
      const response = await request(app)
        .put(`/api/shops/${shop.id}/wallets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          wallet_btc: 'invalid_btc_address',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/invalid.*bitcoin/i);
    });

    test('Should reject invalid ETH address', async () => {
      const response = await request(app)
        .put(`/api/shops/${shop.id}/wallets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          wallet_eth: '0xinvalid',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/invalid.*ethereum/i);
    });

    test('Should reject ETH address without 0x prefix', async () => {
      const response = await request(app)
        .put(`/api/shops/${shop.id}/wallets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          wallet_eth: '742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('P0-API-5: Bulk Operation Validation', () => {
    test('Should accept bulk delete with valid product IDs (under limit)', async () => {
      const productIds = Array(50).fill(product.id); // 50 items

      const response = await request(app)
        .post('/api/products/bulk-delete-by-ids')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shopId: shop.id,
          productIds,
        });

      // May fail for business logic, but should not fail validation
      expect(response.status).not.toBe(400);
    });

    test('Should reject bulk delete with too many items (>100)', async () => {
      const productIds = Array(101).fill(product.id); // 101 items - over limit

      const response = await request(app)
        .post('/api/products/bulk-delete-by-ids')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shopId: shop.id,
          productIds,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/validation|100/i);
    });

    test('Should reject bulk update with too many orders (>100)', async () => {
      const orderIds = Array(101).fill(1); // 101 order IDs

      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${token}`)
        .send({
          order_ids: orderIds,
          status: 'confirmed',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/validation|100/i);
    });

    test('Should reject bulk operation with invalid ID format', async () => {
      const response = await request(app)
        .post('/api/products/bulk-delete-by-ids')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shopId: shop.id,
          productIds: ['invalid', 'ids', 'here'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/validation/i);
    });

    test('Should reject bulk operation with empty array', async () => {
      const response = await request(app)
        .post('/api/products/bulk-delete-by-ids')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shopId: shop.id,
          productIds: [],
        });

      expect(response.status).toBe(400);
    });
  });

  describe('P0-API-8: AI Input Validation', () => {
    test('Should accept valid AI message', async () => {
      const response = await request(app)
        .post('/api/ai/products/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Add a new product',
          shopId: shop.id,
        });

      // May fail for business logic, but should not fail validation
      expect(response.status).not.toBe(400);
    });

    test('Should reject empty AI message', async () => {
      const response = await request(app)
        .post('/api/ai/products/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: '',
          shopId: shop.id,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/validation/i);
    });

    test('Should reject AI message exceeding 1000 characters', async () => {
      const longMessage = 'a'.repeat(1001);

      const response = await request(app)
        .post('/api/ai/products/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: longMessage,
          shopId: shop.id,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/validation|1000/i);
    });

    test('Should reject excessive conversation history (>50 messages)', async () => {
      const history = Array(51).fill({ role: 'user', content: 'test' });

      const response = await request(app)
        .post('/api/ai/products/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Test',
          shopId: shop.id,
          conversationHistory: history,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/validation|50/i);
    });

    test('Should accept conversation history under limit', async () => {
      const history = Array(30).fill({ role: 'user', content: 'test' });

      const response = await request(app)
        .post('/api/ai/products/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Test',
          shopId: shop.id,
          conversationHistory: history,
        });

      // Should not fail validation
      expect(response.status).not.toBe(400);
    });
  });
});
