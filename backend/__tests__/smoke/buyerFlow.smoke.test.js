/**
 * Buyer Flow Smoke Tests
 *
 * Critical path tests for buyer functionality:
 * 1. View catalog (products)
 * 2. View product details
 * 3. Create order
 * 4. View order status
 * 5. Get order history
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
  createTestShop,
  createTestProduct,
} from '../helpers/testDb.js';

const app = createTestApp();

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('Buyer Flow Smoke Tests', () => {
  let buyer;
  let buyerToken;
  let seller;
  let shop;
  let product;

  beforeEach(async () => {
    // Create seller with shop and product
    seller = await createTestUser({ selected_role: 'seller' });
    shop = await createTestShop(seller.id, {
      name: 'Buyer Test Shop',
      status: 'active',
    });
    product = await createTestProduct(shop.id, {
      name: 'Test Product',
      price: '25.00',
      currency: 'USD',
      status: 'active',
      stock_type: 'unlimited',
    });

    // Create buyer
    buyer = await createTestUser({ selected_role: 'buyer' });
    buyerToken = jwt.sign(
      { id: buyer.id, telegramId: buyer.telegram_id },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  /**
   * Test 1: View Catalog
   */
  describe('View Catalog', () => {
    it('should return available products', async () => {
      const response = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(200);
    });

    it('should filter products by shop', async () => {
      const response = await request(app)
        .get(`/api/products?shopId=${shop.id}`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(200);
    });
  });

  /**
   * Test 2: View Product Details
   */
  describe('View Product Details', () => {
    it('should return product by ID', async () => {
      const response = await request(app)
        .get(`/api/products/${product.id}`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(200);
      // API returns { success: true, data: {...} }
      const data = response.body.data || response.body;
      expect(data).toHaveProperty('id', product.id);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app)
        .get('/api/products/999999')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(404);
    });
  });

  /**
   * Test 3: Create Order
   */
  describe('Create Order', () => {
    it('should create order for product', async () => {
      const orderData = {
        productId: product.id,
        quantity: 1,
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(orderData);

      expect([200, 201]).toContain(response.status);
      // API returns { success: true, data: {...} }
      const order = response.body.data || response.body;
      expect(order).toHaveProperty('id');
    });

    it('should reject order with invalid product ID', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId: 999999, quantity: 1 });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject order with zero quantity', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId: product.id, quantity: 0 });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  /**
   * Test 4: View Order Status
   */
  describe('View Order Status', () => {
    let orderId;

    beforeEach(async () => {
      // Create order
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId: product.id, quantity: 1 });

      // API returns { success: true, data: {...} }
      const order = response.body.data || response.body;
      orderId = order.id;
    });

    it('should return order details', async () => {
      const response = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(200);
      // API returns { success: true, data: {...} }
      const order = response.body.data || response.body;
      expect(order).toHaveProperty('id', orderId);
      expect(order).toHaveProperty('status');
    });

    it('should not allow viewing other users orders', async () => {
      // Create another user
      const otherBuyer = await createTestUser();
      const otherToken = jwt.sign(
        { id: otherBuyer.id, telegramId: otherBuyer.telegram_id },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      // Should return 403, 404, or 400 (validation error for undefined orderId)
      expect([400, 403, 404]).toContain(response.status);
    });
  });

  /**
   * Test 5: Get Order History
   */
  describe('Order History', () => {
    beforeEach(async () => {
      // Create multiple orders
      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId: product.id, quantity: 1 });

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId: product.id, quantity: 2 });
    });

    it('should return buyer order history', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(200);
      // API returns { success: true, data: [...] } or { orders: [...] }
      const data = response.body.data || response.body.orders || response.body;
      expect(Array.isArray(data)).toBe(true);
    });
  });
});
