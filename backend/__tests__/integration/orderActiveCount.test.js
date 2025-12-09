/**
 * Integration Test: P1-004 - Orders active count with deleted products
 *
 * Tests that GET /api/orders/active/count correctly returns the count of
 * confirmed orders even when the associated product has been deleted.
 *
 * This validates the fix in statusHandlers.js that uses o.shop_id directly
 * instead of JOIN products, ensuring orders remain visible when products
 * are soft-deleted (is_active=false) or hard-deleted.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import orderRoutes from '../../src/routes/orders.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { config } from '../../src/config/env.js';
import {
  getTestPool,
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop,
  createTestProduct,
  createTestOrder,
} from '../helpers/testDb.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRoutes);
  app.use(errorHandler);
  return app;
};

describe('P1-004: Orders active count with deleted products', () => {
  let app;
  let pool;
  let seller;
  let buyer;
  let shop;
  let product;
  let order;
  let token;

  beforeAll(async () => {
    app = createTestApp();
    pool = getTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create seller user
    seller = await createTestUser({
      telegramId: '9200000001',
      username: 'p1004seller',
      selectedRole: 'seller',
    });

    // Create buyer user
    buyer = await createTestUser({
      telegramId: '9200000002',
      username: 'p1004buyer',
      selectedRole: 'buyer',
    });

    // Create shop
    shop = await createTestShop(seller.id, {
      name: 'P1-004 Test Shop',
    });

    // Create product
    product = await createTestProduct(shop.id, {
      name: 'Test Product For Deletion',
      price: '100.00',
      stock_quantity: 10,
    });

    // Generate JWT token for seller
    token = jwt.sign({ id: seller.id, telegramId: seller.telegram_id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    // Create confirmed order (this is an "active" order)
    order = await createTestOrder(buyer.id, product.id, shop.id, {
      status: 'confirmed',
      total_price: '100.00',
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeTestDb();
  });

  const authGet = (url) =>
    request(app).get(url).set('Authorization', `Bearer ${token}`).set('Accept', 'application/json');

  describe('GET /api/orders/active/count', () => {
    it('returns count=1 for confirmed order with existing product', async () => {
      const response = await authGet(`/api/orders/active/count?shop_id=${shop.id}`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(1);
    });

    it('returns count=1 after product is soft-deleted (is_active=false)', async () => {
      // Verify initial count
      const beforeResponse = await authGet(`/api/orders/active/count?shop_id=${shop.id}`).expect(
        200
      );
      expect(beforeResponse.body.data.count).toBe(1);

      // Soft-delete the product (set is_active=false)
      await pool.query('UPDATE products SET is_active = false WHERE id = $1', [product.id]);

      // Verify order count is STILL 1 after soft-delete
      const afterResponse = await authGet(`/api/orders/active/count?shop_id=${shop.id}`).expect(
        200
      );

      expect(afterResponse.body.success).toBe(true);
      expect(afterResponse.body.data.count).toBe(1);
    });

    it('returns count=1 after product is hard-deleted', async () => {
      // Verify initial count
      const beforeResponse = await authGet(`/api/orders/active/count?shop_id=${shop.id}`).expect(
        200
      );
      expect(beforeResponse.body.data.count).toBe(1);

      // Hard-delete the product
      // First, set product_id to NULL in order (to avoid FK violation)
      // This simulates ON DELETE SET NULL behavior
      await pool.query('UPDATE orders SET product_id = NULL WHERE id = $1', [order.id]);
      await pool.query('DELETE FROM products WHERE id = $1', [product.id]);

      // Verify product is deleted
      const productCheck = await pool.query('SELECT * FROM products WHERE id = $1', [product.id]);
      expect(productCheck.rows).toHaveLength(0);

      // Verify order count is STILL 1 after hard-delete
      // This works because the query uses o.shop_id directly
      const afterResponse = await authGet(`/api/orders/active/count?shop_id=${shop.id}`).expect(
        200
      );

      expect(afterResponse.body.success).toBe(true);
      expect(afterResponse.body.data.count).toBe(1);
    });

    it('returns count=0 when there are no confirmed orders', async () => {
      // Change order status to shipped (no longer "active")
      await pool.query("UPDATE orders SET status = 'shipped' WHERE id = $1", [order.id]);

      const response = await authGet(`/api/orders/active/count?shop_id=${shop.id}`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(0);
    });

    it('returns count=0 for different shop (no cross-shop leakage)', async () => {
      // Create another seller and shop
      const otherSeller = await createTestUser({
        telegramId: '9200000003',
        username: 'otherseller',
        selectedRole: 'seller',
      });
      const otherShop = await createTestShop(otherSeller.id, {
        name: 'Other Shop',
      });

      // Generate token for other seller
      const otherToken = jwt.sign(
        { id: otherSeller.id, telegramId: otherSeller.telegram_id },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Other shop should have 0 active orders
      const response = await request(app)
        .get(`/api/orders/active/count?shop_id=${otherShop.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(0);
    });

    it('returns 403 for unauthorized user', async () => {
      // Create unauthorized user
      const unauthorizedUser = await createTestUser({
        telegramId: '9200000004',
        username: 'unauthorized',
        selectedRole: 'buyer',
      });

      const unauthorizedToken = jwt.sign(
        { id: unauthorizedUser.id, telegramId: unauthorizedUser.telegram_id },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const response = await request(app)
        .get(`/api/orders/active/count?shop_id=${shop.id}`)
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('handles multiple confirmed orders with some products deleted', async () => {
      // Create another product
      const product2 = await createTestProduct(shop.id, {
        name: 'Second Product',
        price: '50.00',
        stock_quantity: 5,
      });

      // Create second confirmed order
      const order2 = await createTestOrder(buyer.id, product2.id, shop.id, {
        status: 'confirmed',
        total_price: '50.00',
      });

      // Verify count is 2
      const initialResponse = await authGet(`/api/orders/active/count?shop_id=${shop.id}`).expect(
        200
      );
      expect(initialResponse.body.data.count).toBe(2);

      // Soft-delete first product
      await pool.query('UPDATE products SET is_active = false WHERE id = $1', [product.id]);

      // Count should still be 2
      const afterSoftDelete = await authGet(`/api/orders/active/count?shop_id=${shop.id}`).expect(
        200
      );
      expect(afterSoftDelete.body.data.count).toBe(2);

      // Hard-delete second product
      await pool.query('UPDATE orders SET product_id = NULL WHERE id = $1', [order2.id]);
      await pool.query('DELETE FROM products WHERE id = $1', [product2.id]);

      // Count should still be 2
      const afterHardDelete = await authGet(`/api/orders/active/count?shop_id=${shop.id}`).expect(
        200
      );
      expect(afterHardDelete.body.data.count).toBe(2);
    });
  });
});
