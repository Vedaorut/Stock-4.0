/**
 * Integration tests for bulk order status update endpoint
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server.js';
import { getClient } from '../../src/config/database.js';
import { config } from '../../src/config/env.js';

describe('POST /api/orders/bulk-status', () => {
  let client;
  let testUserId;
  let otherUserId;
  let shopId;
  let productId;
  let orderIds;
  let testUserToken;
  let otherUserToken;
  let testTelegramId1;
  let testTelegramId2;

  beforeAll(async () => {
    client = await getClient();

    // Generate unique identifiers for this test run (test range: 9000000000+)
    const uniqueSuffix = Date.now() % 1000000;
    testTelegramId1 = 9000888001 + uniqueSuffix;
    testTelegramId2 = 9000888002 + uniqueSuffix;
    const shopName = `bulktest_shop_${uniqueSuffix}`;

    // Clean up any existing test data (both old hardcoded and new dynamic)
    // First delete dependent data, then parent data
    await client.query(`DELETE FROM orders WHERE product_id IN (SELECT id FROM products WHERE shop_id IN (SELECT id FROM shops WHERE name LIKE 'bulktest_shop%'))`);
    await client.query(`DELETE FROM products WHERE shop_id IN (SELECT id FROM shops WHERE name LIKE 'bulktest_shop%')`);
    await client.query(`DELETE FROM shops WHERE name LIKE 'bulktest_shop%'`);
    await client.query('DELETE FROM users WHERE telegram_id IN ($1, $2)', [testTelegramId1, testTelegramId2]);
    await client.query(`DELETE FROM users WHERE username IN ('bulktest_seller', 'bulktest_buyer')`);

    // Create test users
    const user1 = await client.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name)
       VALUES ($1, 'bulktest_seller', 'Bulk', 'Seller')
       RETURNING id`,
      [testTelegramId1]
    );
    testUserId = user1.rows[0].id;

    const user2 = await client.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name)
       VALUES ($1, 'bulktest_buyer', 'Bulk', 'Buyer')
       RETURNING id`,
      [testTelegramId2]
    );
    otherUserId = user2.rows[0].id;

    // Create test shop with unique name
    const shop = await client.query(
      `INSERT INTO shops (owner_id, name, description, registration_paid)
       VALUES ($1, $2, 'Test shop for bulk operations', true)
       RETURNING id`,
      [testUserId, shopName]
    );
    shopId = shop.rows[0].id;

    // Create test product
    const product = await client.query(
      `INSERT INTO products (shop_id, name, description, price, currency, stock_quantity)
       VALUES ($1, 'Test Product', 'Product for bulk test', 10.00, 'USD', 100)
       RETURNING id`,
      [shopId]
    );
    productId = product.rows[0].id;

    // Create 3 test orders
    const order1 = await client.query(
      `INSERT INTO orders (buyer_id, product_id, quantity, total_price, currency, status)
       VALUES ($1, $2, 1, 10.00, 'USD', 'pending')
       RETURNING id`,
      [otherUserId, productId]
    );

    const order2 = await client.query(
      `INSERT INTO orders (buyer_id, product_id, quantity, total_price, currency, status)
       VALUES ($1, $2, 2, 20.00, 'USD', 'pending')
       RETURNING id`,
      [otherUserId, productId]
    );

    const order3 = await client.query(
      `INSERT INTO orders (buyer_id, product_id, quantity, total_price, currency, status)
       VALUES ($1, $2, 1, 10.00, 'USD', 'confirmed')
       RETURNING id`,
      [otherUserId, productId]
    );

    orderIds = [order1.rows[0].id, order2.rows[0].id, order3.rows[0].id];

    // Generate real JWT tokens
    testUserToken = jwt.sign(
      { id: testUserId, telegramId: testTelegramId1, username: 'bulktest_seller' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    otherUserToken = jwt.sign(
      { id: otherUserId, telegramId: testTelegramId2, username: 'bulktest_buyer' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  });

  afterAll(async () => {
    // Cleanup
    await client.query('DELETE FROM orders WHERE buyer_id = $1', [otherUserId]);
    await client.query('DELETE FROM products WHERE shop_id = $1', [shopId]);
    await client.query('DELETE FROM shops WHERE id = $1', [shopId]);
    await client.query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId, otherUserId]);
    client.release();
  });

  describe('Authentication', () => {
    test('should return 401 when no token provided', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .send({
          order_ids: [1, 2],
          status: 'shipped',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No token provided');
    });

    test('should return 401 when invalid token provided', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', 'Bearer invalid_token')
        .send({
          order_ids: [1, 2],
          status: 'shipped',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Validation', () => {
    test('should return 400 when order_ids is empty', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: [],
          status: 'shipped',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should return 400 when order_ids is not an array', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: 'not-an-array',
          status: 'shipped',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should return 400 when order_ids contains invalid values', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: [1, 'abc', -5],
          status: 'shipped',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should return 400 when status is invalid', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: [1, 2],
          status: 'invalid_status',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should accept all valid statuses', async () => {
      const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

      for (const status of validStatuses) {
        const response = await request(app)
          .post('/api/orders/bulk-status')
          .set('Authorization', `Bearer ${testUserToken}`)
          .send({
            order_ids: orderIds,
            status,
          });

        // Should not be validation error (400)
        // May be 403/404/200 depending on data
        expect(response.status).not.toBe(400);
      }
    });
  });

  describe('Authorization', () => {
    test('should return 404 when orders do not exist', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: [999999, 999998],
          status: 'shipped',
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('One or more orders not found');
    });

    test('should return 403 when user does not own the shop', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          order_ids: orderIds,
          status: 'shipped',
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('permission');
    });
  });

  describe('Successful bulk update', () => {
    // Reset order statuses to 'pending' before each test in this section
    // because previous tests may have changed them to terminal states
    beforeEach(async () => {
      await client.query(`UPDATE orders SET status = 'pending' WHERE id = ANY($1::int[])`, [orderIds]);
    });

    test('should successfully update multiple orders status', async () => {
      // State machine: pending -> confirmed (valid transition)
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: orderIds,
          status: 'confirmed',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('updated_count');
      expect(response.body.data.updated_count).toBe(orderIds.length);
      expect(response.body.data).toHaveProperty('orders');
      expect(response.body.data.orders).toHaveLength(orderIds.length);

      // Verify each order in response
      response.body.data.orders.forEach((order) => {
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('status', 'confirmed');
        expect(order).toHaveProperty('product_name', 'Test Product');
        expect(order).toHaveProperty('buyer_username', 'bulktest_buyer');
        expect(order).toHaveProperty('quantity');
        expect(order).toHaveProperty('total_price');
        expect(order).toHaveProperty('currency', 'USD');
      });
    });

    test('should update database records', async () => {
      // State machine: pending -> confirmed (valid transition)
      await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: orderIds,
          status: 'confirmed',
        });

      // Verify in database
      const result = await client.query('SELECT id, status FROM orders WHERE id = ANY($1::int[])', [
        orderIds,
      ]);

      expect(result.rows).toHaveLength(orderIds.length);
      result.rows.forEach((row) => {
        expect(row.status).toBe('confirmed');
      });
    });

    test('should handle partial order list', async () => {
      // Update only first 2 orders
      const partialIds = orderIds.slice(0, 2);

      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: partialIds,
          status: 'confirmed',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.updated_count).toBe(2);
      expect(response.body.data.orders).toHaveLength(2);
    });

    test('should handle single order', async () => {
      // State machine: pending -> confirmed (valid transition)
      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: [orderIds[0]],
          status: 'confirmed',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.updated_count).toBe(1);
      expect(response.body.data.orders).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    test('should handle duplicate order IDs', async () => {
      const duplicateIds = [orderIds[0], orderIds[0], orderIds[1]];

      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: duplicateIds,
          status: 'confirmed',
        });

      expect(response.status).toBe(404);
      // Database won't find 3 orders because only 2 unique exist
    });

    test('should handle mix of valid and invalid order IDs', async () => {
      const mixedIds = [orderIds[0], 999999];

      const response = await request(app)
        .post('/api/orders/bulk-status')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          order_ids: mixedIds,
          status: 'shipped',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('One or more orders not found');
    });
  });
});
