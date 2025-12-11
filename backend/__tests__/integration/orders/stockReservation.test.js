/**
 * Integration Tests: Stock Reservation System
 *
 * Tests the two-stage stock management:
 * 1. Reserve stock on order creation (prevents overselling)
 * 2. Convert reservation to actual deduction on payment confirmation
 * 3. Release reservation on order cancellation/expiration
 *
 * Key invariants:
 * - reserved_quantity <= stock_quantity (always)
 * - available = stock_quantity - reserved_quantity >= 0 (always)
 * - stock is reserved, not deducted, until payment confirmed
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { config } from '../../../src/config/env.js';
import orderRoutes from '../../../src/routes/orders.js';
import { errorHandler } from '../../../src/middleware/errorHandler.js';
import {
  getTestPool,
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop,
  createTestProduct,
} from '../../helpers/testDb.js';

// Create minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRoutes);
  app.use(errorHandler);
  return app;
};

describe('Stock Reservation System', () => {
  let app;
  let pool;

  let seller;
  let buyer;
  let shop;
  let product;
  let buyerToken;
  let sellerToken;

  beforeAll(async () => {
    app = createTestApp();
    pool = getTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create seller
    seller = await createTestUser({
      telegramId: '9200001001',
      username: 'stockseller',
      selectedRole: 'seller',
    });

    // Create buyer
    buyer = await createTestUser({
      telegramId: '9200001002',
      username: 'stockbuyer',
      selectedRole: 'buyer',
    });

    // Create shop
    shop = await createTestShop(seller.id, {
      name: 'Stock Test Shop',
    });

    // Create product with known stock
    product = await createTestProduct(shop.id, {
      name: 'Limited Item',
      price: '50.00',
      stock_quantity: 10,
    });

    // Verify initial state: reserved_quantity = 0
    const initialProduct = await pool.query(
      'SELECT stock_quantity, reserved_quantity FROM products WHERE id = $1',
      [product.id]
    );
    expect(initialProduct.rows[0].stock_quantity).toBe(10);
    expect(initialProduct.rows[0].reserved_quantity).toBe(0);

    // Generate tokens
    buyerToken = jwt.sign({ id: buyer.id, telegramId: buyer.telegram_id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    sellerToken = jwt.sign({ id: seller.id, telegramId: seller.telegram_id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeTestDb();
  });

  /**
   * Helper: Get current product stock state
   */
  const getProductStock = async (productId) => {
    const result = await pool.query(
      'SELECT stock_quantity, reserved_quantity FROM products WHERE id = $1',
      [productId]
    );
    const row = result.rows[0];
    return {
      stock: row.stock_quantity,
      reserved: row.reserved_quantity,
      available: row.stock_quantity - row.reserved_quantity,
    };
  };

  /**
   * Helper: Create order via API
   */
  const createOrder = async (items, expectedStatus = 201) => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        shop_id: shop.id,
        items: items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
      })
      .expect(expectedStatus);

    return response.body;
  };

  describe('Reserve on order creation', () => {
    it('should reserve stock when order is created', async () => {
      const quantity = 3;

      // Create order
      const response = await createOrder([{ productId: product.id, quantity }]);

      expect(response.data).toBeDefined();
      expect(response.data.id).toBeDefined();

      // Check stock state
      const stock = await getProductStock(product.id);
      expect(stock.stock).toBe(10); // Stock unchanged
      expect(stock.reserved).toBe(3); // Reserved increased
      expect(stock.available).toBe(7); // Available = stock - reserved
    });

    it('should accumulate reservations for multiple orders', async () => {
      // First order: reserve 3
      await createOrder([{ productId: product.id, quantity: 3 }]);

      // Second order: reserve 2 more
      await createOrder([{ productId: product.id, quantity: 2 }]);

      // Check accumulated reservations
      const stock = await getProductStock(product.id);
      expect(stock.stock).toBe(10);
      expect(stock.reserved).toBe(5); // 3 + 2
      expect(stock.available).toBe(5);
    });

    it('should reject order if not enough available stock', async () => {
      // Reserve 8 items
      await createOrder([{ productId: product.id, quantity: 8 }]);

      // Try to reserve 5 more (only 2 available)
      const response = await createOrder([{ productId: product.id, quantity: 5 }], 400);

      expect(response.error).toContain('Insufficient stock');

      // Verify reservation didn't change
      const stock = await getProductStock(product.id);
      expect(stock.reserved).toBe(8); // Still 8 from first order
    });

    it('should allow reservation up to full stock', async () => {
      // Reserve all 10 items
      await createOrder([{ productId: product.id, quantity: 10 }]);

      const stock = await getProductStock(product.id);
      expect(stock.stock).toBe(10);
      expect(stock.reserved).toBe(10);
      expect(stock.available).toBe(0);
    });
  });

  describe('Release reservation on cancel', () => {
    it('should release reservation when pending order is cancelled', async () => {
      // Create order
      const orderResponse = await createOrder([{ productId: product.id, quantity: 5 }]);
      const orderId = orderResponse.data.id;

      // Verify reservation
      let stock = await getProductStock(product.id);
      expect(stock.reserved).toBe(5);

      // Cancel order
      await request(app)
        .put(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ status: 'cancelled' })
        .expect(200);

      // Verify reservation released
      stock = await getProductStock(product.id);
      expect(stock.stock).toBe(10); // Stock unchanged
      expect(stock.reserved).toBe(0); // Reservation released
      expect(stock.available).toBe(10);
    });

    it('should handle partial release for multiple orders', async () => {
      // Create two orders
      const order1 = await createOrder([{ productId: product.id, quantity: 3 }]);
      const order2 = await createOrder([{ productId: product.id, quantity: 4 }]);

      // Verify total reservation
      let stock = await getProductStock(product.id);
      expect(stock.reserved).toBe(7); // 3 + 4

      // Cancel first order
      await request(app)
        .put(`/api/orders/${order1.data.id}/status`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ status: 'cancelled' })
        .expect(200);

      // Verify partial release
      stock = await getProductStock(product.id);
      expect(stock.reserved).toBe(4); // Only order2's reservation remains
      expect(stock.available).toBe(6);
    });
  });

  describe('Deduct stock on payment confirmation', () => {
    it('should deduct stock and release reservation on payment', async () => {
      // Create order
      const orderResponse = await createOrder([{ productId: product.id, quantity: 4 }]);
      const orderId = orderResponse.data.id;

      // Verify reservation
      let stock = await getProductStock(product.id);
      expect(stock.stock).toBe(10);
      expect(stock.reserved).toBe(4);

      // Simulate payment confirmation (direct DB update for test)
      // In real flow, this happens via processOrderPayment
      await pool.query('BEGIN');

      // 1. Unreserve
      await pool.query(
        'UPDATE products SET reserved_quantity = reserved_quantity - $1 WHERE id = $2',
        [4, product.id]
      );

      // 2. Deduct stock
      await pool.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [4, product.id]
      );

      // 3. Update order status
      await pool.query("UPDATE orders SET status = 'confirmed' WHERE id = $1", [orderId]);

      // 4. Mark order items as stock_deducted
      await pool.query('UPDATE order_items SET stock_deducted = true WHERE order_id = $1', [
        orderId,
      ]);

      await pool.query('COMMIT');

      // Verify final state
      stock = await getProductStock(product.id);
      expect(stock.stock).toBe(6); // 10 - 4 = 6
      expect(stock.reserved).toBe(0); // Reservation released
      expect(stock.available).toBe(6); // Available = stock - reserved

      // Verify order_items.stock_deducted flag
      const itemsResult = await pool.query(
        'SELECT stock_deducted FROM order_items WHERE order_id = $1',
        [orderId]
      );
      expect(itemsResult.rows[0].stock_deducted).toBe(true);
    });
  });

  describe('Return stock on confirmed order cancellation', () => {
    it('should return stock when confirmed order is cancelled', async () => {
      // Create and "confirm" order (simulate payment)
      const orderResponse = await createOrder([{ productId: product.id, quantity: 3 }]);
      const orderId = orderResponse.data.id;

      // Simulate payment confirmation
      await pool.query('BEGIN');
      await pool.query(
        'UPDATE products SET reserved_quantity = reserved_quantity - $1, stock_quantity = stock_quantity - $1 WHERE id = $2',
        [3, product.id]
      );
      await pool.query("UPDATE orders SET status = 'confirmed' WHERE id = $1", [orderId]);
      await pool.query('UPDATE order_items SET stock_deducted = true WHERE order_id = $1', [
        orderId,
      ]);
      await pool.query('COMMIT');

      // Verify deducted state
      let stock = await getProductStock(product.id);
      expect(stock.stock).toBe(7); // 10 - 3

      // Cancel confirmed order (via seller - simulated with direct status update)
      await request(app)
        .put(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ status: 'cancelled' })
        .expect(200);

      // Verify stock returned
      stock = await getProductStock(product.id);
      expect(stock.stock).toBe(10); // Stock returned: 7 + 3 = 10
      expect(stock.reserved).toBe(0);
    });
  });

  describe('Concurrent order handling', () => {
    it('should prevent overselling with concurrent orders', async () => {
      // Product has stock=10
      // Launch 3 concurrent orders for 4 items each (total 12 > 10)

      const orderPromises = [
        createOrder([{ productId: product.id, quantity: 4 }], undefined), // Don't check status
        createOrder([{ productId: product.id, quantity: 4 }], undefined),
        createOrder([{ productId: product.id, quantity: 4 }], undefined),
      ];

      const results = await Promise.allSettled(
        orderPromises.map((p) =>
          p.catch((e) => {
            throw e;
          })
        )
      );

      // Count successful orders
      const successful = results.filter(
        (r) => r.status === 'fulfilled' && r.value.data && r.value.data.id
      );
      const failed = results.filter(
        (r) => r.status === 'fulfilled' && r.value.error
      );

      // At most 2 orders should succeed (4+4=8 <= 10, but 4+4+4=12 > 10)
      expect(successful.length).toBeLessThanOrEqual(2);

      // Check final stock state
      const stock = await getProductStock(product.id);

      // Invariants must hold
      expect(stock.reserved).toBeLessThanOrEqual(stock.stock);
      expect(stock.available).toBeGreaterThanOrEqual(0);

      // Reserved should match successful orders
      const totalReserved = successful.length * 4;
      expect(stock.reserved).toBe(totalReserved);
    });

    it('should not create negative reserved_quantity', async () => {
      // Create order
      const orderResponse = await createOrder([{ productId: product.id, quantity: 5 }]);
      const orderId = orderResponse.data.id;

      // Try to cancel twice concurrently (race condition)
      const cancelPromises = [
        request(app)
          .put(`/api/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${buyerToken}`)
          .send({ status: 'cancelled' }),
        request(app)
          .put(`/api/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${buyerToken}`)
          .send({ status: 'cancelled' }),
      ];

      await Promise.allSettled(cancelPromises);

      // Check final state
      const stock = await getProductStock(product.id);

      // CRITICAL: reserved_quantity must never be negative
      expect(stock.reserved).toBeGreaterThanOrEqual(0);
      expect(stock.available).toBeLessThanOrEqual(stock.stock);
    });
  });

  describe('Preorder products (no stock reservation)', () => {
    it('should not reserve stock for preorder products', async () => {
      // Create preorder product
      const preorderProduct = await createTestProduct(shop.id, {
        name: 'Preorder Item',
        price: '100.00',
        stock_quantity: 0,
      });

      // Mark as preorder
      await pool.query('UPDATE products SET is_preorder = true WHERE id = $1', [
        preorderProduct.id,
      ]);

      // Create order for preorder item
      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          shop_id: shop.id,
          items: [{ product_id: preorderProduct.id, quantity: 3 }],
        })
        .expect(201);

      // Check stock state - should remain 0/0
      const stock = await getProductStock(preorderProduct.id);
      expect(stock.stock).toBe(0);
      expect(stock.reserved).toBe(0); // No reservation for preorder
    });
  });
});
