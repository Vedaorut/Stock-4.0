/**
 * Orders Controller Tests
 * Tests for order creation, race condition prevention, and order management
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from './helpers/testApp.js';
import {
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop,
  createTestProduct,
  getProductById,
} from './helpers/testDb.js';

const app = createTestApp();

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('POST /api/orders', () => {
  it('should create order successfully with sufficient stock', async () => {
    // Setup: Create seller, shop, product
    const seller = await createTestUser({
      telegram_id: 9000200001,
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id, {
      name: 'Order Test Shop',
    });

    const product = await createTestProduct(shop.id, {
      name: 'Test Product',
      price: '50.00',
      stock_quantity: 10,
    });

    // Setup: Create buyer
    const buyer = await createTestUser({
      telegram_id: 9000300001,
      selected_role: 'buyer',
    });

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Create order
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: product.id,
        quantity: 3,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.product_id).toBe(product.id);
    expect(response.body.data.quantity).toBe(3);
    expect(response.body.data.status).toBe('pending');

    // Verify stock was NOT reserved at order creation
    // After business logic change: stock reservation happens on payment confirmation, not order creation
    // This is first-come-first-served on payment (see orderService.js comment)
    const updatedProduct = await getProductById(product.id);
    expect(updatedProduct.stock_quantity).toBe(10); // Stock unchanged
    expect(updatedProduct.reserved_quantity).toBe(0); // No reservation at order creation
  });

  it('should reject order with insufficient stock', async () => {
    // Setup: Create seller, shop, product with low stock
    const seller = await createTestUser({
      telegram_id: 9000200002,
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id);

    const product = await createTestProduct(shop.id, {
      name: 'Low Stock Product',
      price: '25.00',
      stock_quantity: 2, // Only 2 in stock
    });

    // Setup: Create buyer
    const buyer = await createTestUser({
      telegram_id: 9000300002,
      selected_role: 'buyer',
    });

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Try to order more than available
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: product.id,
        quantity: 5, // Want 5, but only 2 available
      })
      .expect(400);

    expect(response.body.error).toMatch(/insufficient stock/i);

    // Verify stock was NOT decreased
    const unchangedProduct = await getProductById(product.id);
    expect(unchangedProduct.stock_quantity).toBe(2); // Still 2
  });

  it('should allow concurrent orders (stock check at payment)', async () => {
    // After business logic change: stock reservation happens on payment confirmation
    // Orders can be created even if total quantity exceeds stock
    // This is first-come-first-served on PAYMENT, not order creation

    // Setup: Create seller, shop, product with limited stock
    const seller = await createTestUser({
      telegram_id: 9000200005,
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id);

    const product = await createTestProduct(shop.id, {
      name: 'Limited Product',
      price: '100.00',
      stock_quantity: 5, // Only 5 available
    });

    // Setup: Create two buyers
    const buyer1 = await createTestUser({
      telegram_id: 9000300006,
      username: 'buyer1',
    });

    const buyer2 = await createTestUser({
      telegram_id: 9000300007,
      username: 'buyer2',
    });

    const token1 = jwt.sign(
      { id: buyer1.id, telegram_id: buyer1.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const token2 = jwt.sign(
      { id: buyer2.id, telegram_id: buyer2.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Simulate concurrent orders (both want to buy 3 items)
    // With current business logic, both should succeed at order creation
    // Stock is only reserved/decremented at payment confirmation
    const order1Promise = request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        productId: product.id,
        quantity: 3,
      });

    const order2Promise = request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        productId: product.id,
        quantity: 3,
      });

    // Execute concurrently
    const results = await Promise.allSettled([order1Promise, order2Promise]);

    // Extract responses
    const responses = results.map((r) => (r.status === 'fulfilled' ? r.value : null));

    // Count successful orders
    const successfulOrders = responses.filter((r) => r && r.status === 201);

    // Both orders should succeed - stock check happens at order creation
    // but stock is NOT reserved. First-come-first-served is at payment time.
    // Note: If stock < quantity, order still fails (checked in validateProductsForOrder)
    // But both can succeed if each order individually has enough stock
    expect(successfulOrders.length).toBe(2);

    // Verify final stock - no reservation at order creation
    const finalProduct = await getProductById(product.id);
    expect(finalProduct.stock_quantity).toBe(5); // Stock unchanged
    expect(finalProduct.reserved_quantity).toBe(0); // No reservation at order creation
  });

  it('should reject order for zero quantity', async () => {
    const seller = await createTestUser({ selected_role: 'seller' });
    const shop = await createTestShop(seller.id);
    const product = await createTestProduct(shop.id);

    const buyer = await createTestUser({
      telegram_id: 9000300008,
    });

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: product.id,
        quantity: 0,
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject order for negative quantity', async () => {
    const seller = await createTestUser({ selected_role: 'seller' });
    const shop = await createTestShop(seller.id);
    const product = await createTestProduct(shop.id);

    const buyer = await createTestUser({
      telegram_id: 9000300009,
    });

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: product.id,
        quantity: -5,
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject order for non-existent product', async () => {
    const buyer = await createTestUser({
      telegram_id: 9000300010,
    });

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: 999999, // Non-existent
        quantity: 1,
      })
      .expect(400); // ValidationError returns 400 (not 404)

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toMatch(/not found|locked/i);
  });

  it('should reject order without authentication', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({
        productId: 1,
        quantity: 1,
      })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});

describe('GET /api/orders', () => {
  it('should return user orders', async () => {
    // Setup: Create seller, shop, product
    const seller = await createTestUser({
      telegram_id: 9000200011,
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id);
    const product = await createTestProduct(shop.id);

    // Setup: Create buyer and order
    const buyer = await createTestUser({
      telegram_id: 9000300012,
    });

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Create order first
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: product.id,
        quantity: 2,
      })
      .expect(201);

    // Get orders list
    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0].buyer_id).toBe(buyer.id);
  });

  it('should return empty array for user with no orders', async () => {
    const buyer = await createTestUser({
      telegram_id: 9000300013,
    });

    const token = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
  });
});

describe('PUT /api/orders/:id/status', () => {
  it('should update order status', async () => {
    // Setup: Create seller, shop, product
    const seller = await createTestUser({
      telegram_id: 9000200014,
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id);
    const product = await createTestProduct(shop.id);

    // Setup: Create buyer and order
    const buyer = await createTestUser({
      telegram_id: 9000300015,
    });

    const buyerToken = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Create order
    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        productId: product.id,
        quantity: 1,
      })
      .expect(201);

    const orderId = orderResponse.body.data.id;

    // Update order status (as seller)
    // Note: Sellers can only update to: confirmed, shipped, cancelled
    // State machine: pending -> confirmed -> shipped
    const sellerToken = jwt.sign(
      { id: seller.id, telegram_id: seller.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // First update: pending -> confirmed
    const updateResponse = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        status: 'confirmed',
      })
      .expect(200);

    expect(updateResponse.body.data.status).toBe('confirmed');

    // Second update: confirmed -> shipped
    const shipResponse = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        status: 'shipped',
      })
      .expect(200);

    expect(shipResponse.body.data.status).toBe('shipped');
  });

  it('should reject invalid status', async () => {
    const seller = await createTestUser({
      telegram_id: 9000200016,
      selected_role: 'seller',
    });

    const token = jwt.sign(
      { id: seller.id, telegram_id: seller.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .put('/api/orders/1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'invalid_status',
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });
});

describe('GET /api/orders/analytics', () => {
  it('should return analytics for seller with orders', async () => {
    // Setup: Create seller, shop, products
    const seller = await createTestUser({
      telegram_id: 9000200020,
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id);

    const product1 = await createTestProduct(shop.id, {
      name: 'Analytics Product 1',
      price: '100.00',
      stock_quantity: 50,
    });

    const product2 = await createTestProduct(shop.id, {
      name: 'Analytics Product 2',
      price: '200.00',
      stock_quantity: 50,
    });

    // Setup: Create buyer and orders
    const buyer = await createTestUser({
      telegram_id: 9000300020,
    });

    const buyerToken = jwt.sign(
      { id: buyer.id, telegram_id: buyer.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const sellerToken = jwt.sign(
      { id: seller.id, telegram_id: seller.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Create 3 orders
    const order1Response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ productId: product1.id, quantity: 2 })
      .expect(201);

    const order2Response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ productId: product2.id, quantity: 1 })
      .expect(201);

    const _order3Response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ productId: product1.id, quantity: 1 })
      .expect(201);

    // Mark two orders as completed (via proper state transitions)
    // Order 1: pending -> confirmed -> shipped (counts as "completed" in analytics)
    await request(app)
      .put(`/api/orders/${order1Response.body.data.id}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'confirmed' })
      .expect(200);
    await request(app)
      .put(`/api/orders/${order1Response.body.data.id}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'shipped' })
      .expect(200);

    // Order 2: pending -> confirmed -> shipped
    await request(app)
      .put(`/api/orders/${order2Response.body.data.id}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'confirmed' })
      .expect(200);
    await request(app)
      .put(`/api/orders/${order2Response.body.data.id}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'shipped' })
      .expect(200);

    // Leave order3 as pending

    // Get analytics
    const today = new Date().toISOString().split('T')[0];
    const response = await request(app)
      .get(`/api/orders/analytics?from=2024-01-01&to=${today}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.period).toEqual({
      from: '2024-01-01',
      to: today,
    });

    const summary = response.body.data.summary;
    expect(summary.totalOrders).toBe(3);
    expect(summary.completedOrders).toBe(2);
    expect(summary.totalRevenue).toBe(400); // (100*2) + (200*1) = 400
    expect(summary.avgOrderValue).toBe(200); // 400 / 2 = 200

    const topProducts = response.body.data.topProducts;
    expect(Array.isArray(topProducts)).toBe(true);
    expect(topProducts.length).toBeGreaterThan(0);
    expect(topProducts[0].revenue).toBeGreaterThanOrEqual(topProducts[1]?.revenue || 0);
  });

  it('should return zero statistics for seller with no orders', async () => {
    const seller = await createTestUser({
      telegram_id: 9000200021,
      selected_role: 'seller',
    });

    await createTestShop(seller.id);

    const token = jwt.sign(
      { id: seller.id, telegram_id: seller.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/orders/analytics?from=2024-01-01&to=2024-12-31')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.summary.totalOrders).toBe(0);
    expect(response.body.data.summary.totalRevenue).toBe(0);
    expect(response.body.data.topProducts).toEqual([]);
  });

  it('should reject analytics request without dates', async () => {
    const seller = await createTestUser({
      telegram_id: 9000200022,
      selected_role: 'seller',
    });

    const token = jwt.sign(
      { id: seller.id, telegram_id: seller.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/orders/analytics')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.error).toMatch(/missing required parameters/i);
  });

  it('should reject analytics request with invalid date format', async () => {
    const seller = await createTestUser({
      telegram_id: 9000200023,
      selected_role: 'seller',
    });

    const token = jwt.sign(
      { id: seller.id, telegram_id: seller.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/orders/analytics?from=2024/01/01&to=2024/12/31')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.error).toMatch(/invalid date format/i);
  });

  it('should reject analytics request with from > to', async () => {
    const seller = await createTestUser({
      telegram_id: 9000200024,
      selected_role: 'seller',
    });

    const token = jwt.sign(
      { id: seller.id, telegram_id: seller.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/orders/analytics?from=2024-12-31&to=2024-01-01')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.error).toMatch(/from date must be before or equal to/i);
  });

  it('should reject analytics request without authentication', async () => {
    const response = await request(app)
      .get('/api/orders/analytics?from=2024-01-01&to=2024-12-31')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});
