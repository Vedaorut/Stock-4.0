/**
 * Authorization Tests
 *
 * Tests for IDOR (Insecure Direct Object Reference) vulnerabilities
 * Ensures users can only access/modify their own resources
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server.js';
import { config } from '../../src/config/env.js';
import { userQueries, shopQueries, productQueries } from '../../src/database/queries/index.js';
import { getClient } from '../../src/config/database.js';

describe('Authorization - IDOR Prevention Tests', () => {
  let user1, user2;
  let token1, token2;
  let shop1, shop2;
  let follow1, follow2;
  let _product1, _product2;

  beforeAll(async () => {
    // Create two test users
    user1 = await userQueries.create({
      telegram_id: Math.floor(Math.random() * 1000000),
      username: 'testuser1',
      first_name: 'Test',
      last_name: 'User1',
    });

    user2 = await userQueries.create({
      telegram_id: Math.floor(Math.random() * 1000000),
      username: 'testuser2',
      first_name: 'Test',
      last_name: 'User2',
    });

    // Generate tokens
    token1 = jwt.sign(
      { id: user1.id, telegramId: user1.telegram_id, username: user1.username },
      config.jwt.secret,
      { expiresIn: '1d' }
    );

    token2 = jwt.sign(
      { id: user2.id, telegramId: user2.telegram_id, username: user2.username },
      config.jwt.secret,
      { expiresIn: '1d' }
    );

    // Create shops for both users
    shop1 = await shopQueries.create({
      owner_id: user1.id,
      name: 'testshop1',
      description: 'Test Shop 1',
      subscription_tier: 'pro',
      subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    shop2 = await shopQueries.create({
      owner_id: user2.id,
      name: 'testshop2',
      description: 'Test Shop 2',
      subscription_tier: 'pro',
      subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Create products for both shops
    _product1 = await productQueries.create({
      shop_id: shop1.id,
      name: 'Test Product 1',
      description: 'Description 1',
      price: 100,
      currency: 'USD',
      stock: 10,
    });

    _product2 = await productQueries.create({
      shop_id: shop2.id,
      name: 'Test Product 2',
      description: 'Description 2',
      price: 200,
      currency: 'USD',
      stock: 20,
    });

    // Create follows
    const client = await getClient();
    try {
      // Shop1 follows Shop2
      const result1 = await client.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
         VALUES ($1, $2, 'resell', 'active')
         RETURNING *`,
        [shop1.id, shop2.id]
      );
      follow1 = result1.rows[0];

      // Shop2 follows Shop1
      const result2 = await client.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
         VALUES ($1, $2, 'resell', 'active')
         RETURNING *`,
        [shop2.id, shop1.id]
      );
      follow2 = result2.rows[0];
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    // Cleanup
    const client = await getClient();
    try {
      await client.query('DELETE FROM shop_follows WHERE follower_shop_id IN ($1, $2)', [
        shop1.id,
        shop2.id,
      ]);
      await client.query('DELETE FROM products WHERE shop_id IN ($1, $2)', [shop1.id, shop2.id]);
      await client.query('DELETE FROM shops WHERE id IN ($1, $2)', [shop1.id, shop2.id]);
      await client.query('DELETE FROM users WHERE id IN ($1, $2)', [user1.id, user2.id]);
    } finally {
      client.release();
    }
  });

  describe('P0-API-2: Follow Endpoints Authorization', () => {
    test('Should ALLOW user to update their own follow markup', async () => {
      const response = await request(app)
        .put(`/api/shop-follows/${follow1.id}/markup`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ markup_percentage: 15 });

      expect(response.status).toBe(200);
    });

    test("Should DENY user from updating another user's follow markup", async () => {
      const response = await request(app)
        .put(`/api/shop-follows/${follow2.id}/markup`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ markup_percentage: 15 });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/not authorized/i);
    });

    test('Should ALLOW user to switch their own follow mode', async () => {
      const response = await request(app)
        .put(`/api/shop-follows/${follow1.id}/mode`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ mode: 'showcase' });

      expect(response.status).toBe(200);
    });

    test("Should DENY user from switching another user's follow mode", async () => {
      const response = await request(app)
        .put(`/api/shop-follows/${follow2.id}/mode`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ mode: 'showcase' });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/not authorized/i);
    });

    test('Should ALLOW user to delete their own follow', async () => {
      // Create temporary follow to delete
      const client = await getClient();
      let tempFollow;
      try {
        const result = await client.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
           VALUES ($1, $2, 'resell', 'active')
           RETURNING *`,
          [shop1.id, shop2.id]
        );
        tempFollow = result.rows[0];
      } finally {
        client.release();
      }

      const response = await request(app)
        .delete(`/api/shop-follows/${tempFollow.id}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
    });

    test("Should DENY user from deleting another user's follow", async () => {
      const response = await request(app)
        .delete(`/api/shop-follows/${follow2.id}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/not authorized/i);
    });
  });

  describe('P0-API-3: Migration Endpoints Authorization', () => {
    test('Should ALLOW shop owner to check migration eligibility', async () => {
      const response = await request(app)
        .get(`/api/shops/${shop1.id}/migration/check`)
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
    });

    test('Should DENY non-owner from checking migration eligibility', async () => {
      const response = await request(app)
        .get(`/api/shops/${shop1.id}/migration/check`)
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/owner/i);
    });

    test('Should DENY non-owner from initiating migration', async () => {
      const response = await request(app)
        .post(`/api/shops/${shop1.id}/migration`)
        .set('Authorization', `Bearer ${token2}`)
        .send({
          targetChannelId: '@testchannel',
          message: 'Test migration',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/owner/i);
    });

    test('Should DENY non-owner from viewing migration history', async () => {
      const response = await request(app)
        .get(`/api/shops/${shop1.id}/migration/history`)
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/owner/i);
    });
  });

  describe('Generic Shop Authorization', () => {
    test('Should ALLOW shop owner to update shop', async () => {
      const response = await request(app)
        .put(`/api/shops/${shop1.id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ description: 'Updated description' });

      expect(response.status).toBe(200);
    });

    test('Should DENY non-owner from updating shop', async () => {
      const response = await request(app)
        .put(`/api/shops/${shop1.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ description: 'Hacked description' });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/owner/i);
    });

    test('Should DENY non-owner from deleting shop', async () => {
      const response = await request(app)
        .delete(`/api/shops/${shop1.id}`)
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/owner/i);
    });

    test('Should DENY non-owner from updating shop wallets', async () => {
      const response = await request(app)
        .put(`/api/shops/${shop1.id}/wallets`)
        .set('Authorization', `Bearer ${token2}`)
        .send({
          walletBtc: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/owner/i);
    });
  });

  describe('Invalid Resource IDs', () => {
    test('Should return 404 for non-existent follow', async () => {
      const response = await request(app)
        .put('/api/shop-follows/999999/markup')
        .set('Authorization', `Bearer ${token1}`)
        .send({ markup_percentage: 15 });

      expect(response.status).toBe(404);
    });

    test('Should return 404 for non-existent shop', async () => {
      const response = await request(app)
        .put('/api/shops/999999')
        .set('Authorization', `Bearer ${token1}`)
        .send({ description: 'Test' });

      expect(response.status).toBe(404);
    });

    test('Should return 400 for invalid follow ID format', async () => {
      const response = await request(app)
        .put('/api/shop-follows/invalid/markup')
        .set('Authorization', `Bearer ${token1}`)
        .send({ markup_percentage: 15 });

      expect(response.status).toBe(400);
    });
  });

  describe('Missing Authentication', () => {
    test('Should return 401 when no token provided', async () => {
      const response = await request(app)
        .put(`/api/shop-follows/${follow1.id}/markup`)
        .send({ markup_percentage: 15 });

      expect(response.status).toBe(401);
    });

    test('Should return 401 when invalid token provided', async () => {
      const response = await request(app)
        .put(`/api/shop-follows/${follow1.id}/markup`)
        .set('Authorization', 'Bearer invalid_token')
        .send({ markup_percentage: 15 });

      expect(response.status).toBe(401);
    });
  });
});
