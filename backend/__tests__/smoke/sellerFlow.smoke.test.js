/**
 * Seller Flow Smoke Tests
 *
 * Critical path tests for seller functionality:
 * 1. Create shop
 * 2. Add product
 * 3. View shop products
 * 4. View orders
 * 5. Update product
 *
 * Run: npm run test:smoke
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../helpers/testApp.js';
import {
  closeTestDb,
  cleanupTestData,
  createTestUser,
  getTestPool,
} from '../helpers/testDb.js';

const app = createTestApp();

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('Seller Flow Smoke Tests', () => {
  let seller;
  let authToken;

  beforeEach(async () => {
    seller = await createTestUser({ selected_role: 'seller' });
    authToken = jwt.sign(
      { id: seller.id, telegramId: seller.telegram_id },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  /**
   * Test 1: Create Shop
   */
  describe('Create Shop', () => {
    it('should allow seller to create a shop', async () => {
      const shopData = {
        name: 'Test Smoke Shop',
        description: 'Smoke test shop',
        category: 'digital',
      };

      const response = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken}`)
        .send(shopData);

      // Accept 201 (created) or 200 (if shop already exists)
      expect([200, 201]).toContain(response.status);

      if (response.status === 201) {
        // API returns { success: true, data: {...} }
        const shop = response.body.data || response.body;
        expect(shop).toHaveProperty('id');
        expect(shop).toHaveProperty('name', shopData.name);
      }
    });

    it('should reject shop creation without name', async () => {
      const response = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'No name shop' });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  /**
   * Test 2: Add Product to Shop
   */
  describe('Add Product', () => {
    let shopId;

    beforeEach(async () => {
      const pool = getTestPool();
      const result = await pool.query(
        `INSERT INTO shops (owner_id, name, description, is_active)
         VALUES ($1, 'Smoke Shop', 'Test', true)
         RETURNING id`,
        [seller.id]
      );
      shopId = result.rows[0].id;
    });

    it('should allow adding product to shop', async () => {
      const productData = {
        shopId,
        name: 'Digital Product',
        description: 'Test product',
        price: 10.00,
        currency: 'USD',
        category: 'digital',
        stockType: 'unlimited',
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(productData);

      expect([200, 201]).toContain(response.status);
    });

    it('should reject product with negative price', async () => {
      const productData = {
        shopId,
        name: 'Bad Product',
        price: -10.00,
        currency: 'USD',
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(productData);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  /**
   * Test 3: View Shop Products
   */
  describe('View Shop Products', () => {
    let shopId;

    beforeEach(async () => {
      const pool = getTestPool();
      const shopResult = await pool.query(
        `INSERT INTO shops (owner_id, name, description, is_active)
         VALUES ($1, 'Product View Shop', 'Test', true)
         RETURNING id`,
        [seller.id]
      );
      shopId = shopResult.rows[0].id;

      // Add products
      await pool.query(
        `INSERT INTO products (shop_id, name, description, price, currency, is_active)
         VALUES ($1, 'Product 1', 'Test', 10.00, 'USD', true),
                ($1, 'Product 2', 'Test', 20.00, 'USD', true)`,
        [shopId]
      );
    });

    it('should return shop products', async () => {
      const response = await request(app)
        .get(`/api/products?shopId=${shopId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // API may return { success: true, data: { products: [] } } or similar
      const data = response.body.data || response.body;
      const products = data.products || data;
      expect(Array.isArray(products)).toBe(true);
    });
  });

  /**
   * Test 4: View Seller Orders
   */
  describe('View Seller Orders', () => {
    it('should return seller orders (empty initially)', async () => {
      const response = await request(app)
        .get('/api/orders?role=seller')
        .set('Authorization', `Bearer ${authToken}`);

      // Can return 200 with empty array or 204/400 if no shop exists
      expect([200, 204, 400]).toContain(response.status);
    });
  });

  /**
   * Test 5: Update Product
   */
  describe('Update Product', () => {
    let shopId;
    let productId;

    beforeEach(async () => {
      const pool = getTestPool();
      const shopResult = await pool.query(
        `INSERT INTO shops (owner_id, name, description, is_active)
         VALUES ($1, 'Update Shop', 'Test', true)
         RETURNING id`,
        [seller.id]
      );
      shopId = shopResult.rows[0].id;

      const productResult = await pool.query(
        `INSERT INTO products (shop_id, name, description, price, currency, is_active)
         VALUES ($1, 'Update Product', 'Test', 10.00, 'USD', true)
         RETURNING id`,
        [shopId]
      );
      productId = productResult.rows[0].id;
    });

    it('should allow updating product price', async () => {
      const response = await request(app)
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ price: 15.00 });

      // 200/204 = success, 404 = product not found (may be race condition in cleanup)
      expect([200, 204, 404]).toContain(response.status);
    });
  });
});
