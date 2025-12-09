import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server.js';
import { getClient } from '../../src/config/database.js';
import { config } from '../../src/config/env.js';

describe('GET /api/orders/analytics (multi-item support)', () => {
  let client;
  let ownerId;
  let buyerId;
  let shopId;
  let productA;
  let productB;
  let orderId;
  let ownerToken;

  beforeAll(async () => {
    client = await getClient();

    // Ensure shop_id column exists for legacy test DBs
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'orders' AND column_name = 'shop_id'
        ) THEN
          ALTER TABLE orders ADD COLUMN shop_id INT REFERENCES shops(id) ON DELETE SET NULL;
          CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON orders(shop_id);
        END IF;
      END
      $$;
    `);

    // Unique suffix to avoid collisions
    const uniq = Date.now() % 1000000;
    const ownerTelegram = 9100000000 + uniq;
    const buyerTelegram = 9200000000 + uniq;

    // Clean any leftovers
    await client.query(`DELETE FROM orders WHERE buyer_id IN (SELECT id FROM users WHERE telegram_id IN ($1, $2))`, [buyerTelegram, ownerTelegram]);
    await client.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE buyer_id IN (SELECT id FROM users WHERE telegram_id IN ($1, $2)))`, [buyerTelegram, ownerTelegram]);
    await client.query(`DELETE FROM products WHERE name LIKE 'analytics_%'`);
    await client.query(`DELETE FROM shops WHERE name LIKE 'analytics_shop_%'`);
    await client.query(`DELETE FROM users WHERE telegram_id IN ($1, $2)`, [ownerTelegram, buyerTelegram]);

    // Create users
    const owner = await client.query(
      `INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3) RETURNING id`,
      [ownerTelegram, `analytics_owner_${uniq}`, 'Owner']
    );
    ownerId = owner.rows[0].id;

    const buyer = await client.query(
      `INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3) RETURNING id`,
      [buyerTelegram, `analytics_buyer_${uniq}`, 'Buyer']
    );
    buyerId = buyer.rows[0].id;

    // Shop
    const shop = await client.query(
      `INSERT INTO shops (owner_id, name, description, registration_paid) VALUES ($1, $2, 'analytics test shop', true) RETURNING id`,
      [ownerId, `analytics_shop_${uniq}`]
    );
    shopId = shop.rows[0].id;

    // Products
    productA = await client.query(
      `INSERT INTO products (shop_id, name, description, price, currency, stock_quantity) VALUES ($1, $2, 'A', 10.00, 'USD', 100) RETURNING id`,
      [shopId, 'analytics_product_a']
    );
    productB = await client.query(
      `INSERT INTO products (shop_id, name, description, price, currency, stock_quantity) VALUES ($1, $2, 'B', 20.00, 'USD', 100) RETURNING id`,
      [shopId, 'analytics_product_b']
    );

    // Order with multi-items
    const order = await client.query(
      `INSERT INTO orders (buyer_id, product_id, quantity, total_price, currency, status, shop_id)
       VALUES ($1, $2, 3, 30.00, 'USD', 'delivered', $3)
       RETURNING id`,
      [buyerId, productA.rows[0].id, shopId]
    );
    orderId = order.rows[0].id;

    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, currency)
       VALUES
       ($1, $2, 'analytics_product_a', 1, 10.00, 'USD'),
       ($1, $3, 'analytics_product_b', 1, 20.00, 'USD')`,
      [orderId, productA.rows[0].id, productB.rows[0].id]
    );

    ownerToken = jwt.sign(
      { id: ownerId, telegramId: ownerTelegram, username: `analytics_owner_${uniq}` },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
    await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
    await client.query('DELETE FROM products WHERE id IN ($1, $2)', [productA.rows[0].id, productB.rows[0].id]);
    await client.query('DELETE FROM shops WHERE id = $1', [shopId]);
    await client.query('DELETE FROM users WHERE id IN ($1, $2)', [ownerId, buyerId]);
    client.release();
  });

  test('should aggregate multi-item revenue and counts', async () => {
    const today = '2100-01-01'; // wide window to avoid TZ edge cases
    const response = await request(app)
      .get('/api/orders/analytics')
      .set('Authorization', `Bearer ${ownerToken}`)
      .query({ from: '2000-01-01', to: today });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const summary = response.body.data.summary;
    expect(summary).toBeDefined();
    const totalRevenue = Number(summary.totalRevenue ?? summary.total_revenue ?? 0);
    expect(totalRevenue).toBeGreaterThanOrEqual(30.0);
    expect(parseInt(summary.totalOrders ?? summary.total_orders, 10)).toBeGreaterThanOrEqual(1);
    expect(parseInt(summary.completedOrders ?? summary.completed_orders, 10)).toBeGreaterThanOrEqual(1);
  });

  test('should return top products from order_items', async () => {
    const today = '2100-01-01'; // wide window to avoid TZ edge cases
    const response = await request(app)
      .get('/api/orders/analytics')
      .set('Authorization', `Bearer ${ownerToken}`)
      .query({ from: '2000-01-01', to: today });

    expect(response.status).toBe(200);
    const topProducts = response.body.data.topProducts;
    expect(Array.isArray(topProducts)).toBe(true);
    const names = topProducts.map((p) => p.name);
    expect(names).toContain('analytics_product_a');
    expect(names).toContain('analytics_product_b');
  });
});
