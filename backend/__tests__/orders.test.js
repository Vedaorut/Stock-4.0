/**
 * Orders Controller Tests
 * Tests for order creation, race condition prevention, and order management
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
  createTestProduct,
  getProductById
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

describe('POST /api/orders', () => {
  it('should create order successfully with sufficient stock', async () => {
    // Setup: Create seller, shop, product
    const seller = await createTestUser({
      telegram_id: 'test_seller_order1',
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
      telegram_id: 'test_buyer_order1',
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
        product_id: product.id,
        quantity: 3,
      })
      .expect(201);

    expect(response.body.order).toBeDefined();
    expect(response.body.order.product_id).toBe(product.id);
    expect(response.body.order.quantity).toBe(3);
    expect(response.body.order.status).toBe('pending');

    // Verify stock was decreased
    const updatedProduct = await getProductById(product.id);
    expect(updatedProduct.stock_quantity).toBe(7); // 10 - 3 = 7
  });

  it('should reject order with insufficient stock', async () => {
    // Setup: Create seller, shop, product with low stock
    const seller = await createTestUser({
      telegram_id: 'test_seller_order2',
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
      telegram_id: 'test_buyer_order2',
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
        product_id: product.id,
        quantity: 5, // Want 5, but only 2 available
      })
      .expect(400);

    expect(response.body.error).toMatch(/insufficient stock/i);

    // Verify stock was NOT decreased
    const unchangedProduct = await getProductById(product.id);
    expect(unchangedProduct.stock_quantity).toBe(2); // Still 2
  });

  it('should prevent race condition (overselling)', async () => {
    // This test verifies P0-2 fix: Race Condition in Orders

    // Setup: Create seller, shop, product with limited stock
    const seller = await createTestUser({
      telegram_id: 'test_seller_race',
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
      telegram_id: 'test_buyer_race1',
      username: 'buyer1',
    });

    const buyer2 = await createTestUser({
      telegram_id: 'test_buyer_race2',
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

    // Simulate concurrent orders (both want to buy 3 items, total 6 > 5 available)
    const order1Promise = request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        product_id: product.id,
        quantity: 3,
      });

    const order2Promise = request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        product_id: product.id,
        quantity: 3,
      });

    // Execute concurrently
    const results = await Promise.allSettled([order1Promise, order2Promise]);

    // Extract responses
    const responses = results.map(r => r.status === 'fulfilled' ? r.value : null);

    // Count successful orders
    const successfulOrders = responses.filter(r => r && r.status === 201);
    const failedOrders = responses.filter(r => r && r.status === 400);

    // Verify: Only ONE order should succeed (race condition prevented)
    // The transaction + FOR UPDATE lock ensures atomicity
    expect(successfulOrders.length).toBe(1);
    expect(failedOrders.length).toBe(1);

    // Verify final stock
    const finalProduct = await getProductById(product.id);
    expect(finalProduct.stock_quantity).toBe(2); // 5 - 3 = 2 (only one order succeeded)
  });

  it('should reject order for zero quantity', async () => {
    const seller = await createTestUser({ selected_role: 'seller' });
    const shop = await createTestShop(seller.id);
    const product = await createTestProduct(shop.id);

    const buyer = await createTestUser({
      telegram_id: 'test_buyer_zero',
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
        product_id: product.id,
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
      telegram_id: 'test_buyer_negative',
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
        product_id: product.id,
        quantity: -5,
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject order for non-existent product', async () => {
    const buyer = await createTestUser({
      telegram_id: 'test_buyer_noProduct',
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
        product_id: 999999, // Non-existent
        quantity: 1,
      })
      .expect(404);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject order without authentication', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({
        product_id: 1,
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
      telegram_id: 'test_seller_list',
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id);
    const product = await createTestProduct(shop.id);

    // Setup: Create buyer and order
    const buyer = await createTestUser({
      telegram_id: 'test_buyer_list',
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
        product_id: product.id,
        quantity: 2,
      })
      .expect(201);

    // Get orders list
    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.orders).toBeDefined();
    expect(Array.isArray(response.body.orders)).toBe(true);
    expect(response.body.orders.length).toBeGreaterThan(0);
    expect(response.body.orders[0].buyer_id).toBe(buyer.id);
  });

  it('should return empty array for user with no orders', async () => {
    const buyer = await createTestUser({
      telegram_id: 'test_buyer_empty',
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

    expect(response.body.orders).toEqual([]);
  });
});

describe('PUT /api/orders/:id/status', () => {
  it('should update order status', async () => {
    // Setup: Create seller, shop, product
    const seller = await createTestUser({
      telegram_id: 'test_seller_status',
      selected_role: 'seller',
    });

    const shop = await createTestShop(seller.id);
    const product = await createTestProduct(shop.id);

    // Setup: Create buyer and order
    const buyer = await createTestUser({
      telegram_id: 'test_buyer_status',
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
        product_id: product.id,
        quantity: 1,
      })
      .expect(201);

    const orderId = orderResponse.body.order.id;

    // Update order status (as seller)
    const sellerToken = jwt.sign(
      { id: seller.id, telegram_id: seller.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const updateResponse = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        status: 'completed',
      })
      .expect(200);

    expect(updateResponse.body.order.status).toBe('completed');
  });

  it('should reject invalid status', async () => {
    const seller = await createTestUser({
      telegram_id: 'test_seller_invalid',
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
