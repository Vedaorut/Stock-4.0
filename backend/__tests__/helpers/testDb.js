/**
 * Test Database Helper
 * Manages test database connection and cleanup
 */

import pkg from 'pg';
const { Pool } = pkg;

let testPool = null;
let testUserCounter = 0; // Counter to ensure unique test user IDs

/**
 * Get test database pool
 * Creates a new pool if it doesn't exist
 */
export const getTestPool = () => {
  if (!testPool) {
    testPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5, // Lower max connections for tests
    });
  }
  return testPool;
};

/**
 * Close test database connection
 */
export const closeTestDb = async () => {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
};

/**
 * Clean up test data
 * Uses TRUNCATE CASCADE for faster cleanup and avoiding FK issues
 * IMPORTANT: Only truncates test data (users with telegram_id >= 9000000000)
 */
export const cleanupTestData = async () => {
  const pool = getTestPool();
  const client = await pool.connect();

  try {
    // Use a more aggressive cleanup approach:
    // 1. Delete test users (CASCADE handles dependencies)
    // 2. Clean up orphaned records
    await client.query('BEGIN');

    // Delete test users first - this will CASCADE to shops, which CASCADE to products
    await client.query('DELETE FROM users WHERE telegram_id >= 9000000000');

    // Clean up any orphaned records (in case of ON DELETE SET NULL)
    await client.query('DELETE FROM orders WHERE buyer_id IS NULL OR product_id IS NULL');
    await client.query('DELETE FROM order_items WHERE order_id IS NULL OR product_id IS NULL');
    await client.query('DELETE FROM payments WHERE order_id IS NULL');
    await client.query('DELETE FROM subscriptions WHERE user_id IS NULL OR shop_id IS NULL');
    await client.query('DELETE FROM shop_payments WHERE user_id IS NULL OR shop_id IS NULL');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Create test user
 * Accepts both camelCase (API format) and snake_case (DB format)
 */
export const createTestUser = async (userData = {}) => {
  const pool = getTestPool();

  // Generate unique test ID
  // If explicit telegram_id provided, use it
  // Otherwise generate: 9000000000 + counter + timestamp
  let generatedId;
  if (!userData.telegramId && !userData.telegram_id) {
    const testIdBase = 9000000000;
    const timestamp = Date.now() % 100000; // Last 5 digits
    testUserCounter++;
    generatedId = `${testIdBase + testUserCounter * 100000 + timestamp}`;
  }

  // Support both camelCase (API) and snake_case (DB) formats
  const user = {
    telegram_id: userData.telegramId || userData.telegram_id || generatedId,
    username: userData.username || `testuser${testUserCounter}`,
    first_name: userData.firstName || userData.first_name || 'Test',
    last_name: userData.lastName || userData.last_name || 'User',
    selected_role: userData.selectedRole || userData.selected_role || 'buyer',
  };

  const result = await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, selected_role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [user.telegram_id, user.username, user.first_name, user.last_name, user.selected_role]
  );

  return result.rows[0];
};

/**
 * Create test shop
 */
export const createTestShop = async (ownerId, shopData = {}) => {
  const pool = getTestPool();
  
  const shop = {
    name: shopData.name || 'Test Shop',
    description: shopData.description || 'Test shop description',
    owner_id: ownerId,
    is_active: shopData.is_active !== undefined ? shopData.is_active : true,
  };
  
  const result = await pool.query(
    `INSERT INTO shops (name, description, owner_id, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [shop.name, shop.description, shop.owner_id, shop.is_active]
  );
  
  return result.rows[0];
};

/**
 * Create test product
 */
export const createTestProduct = async (shopId, productData = {}) => {
  const pool = getTestPool();
  
  const product = {
    name: productData.name || 'Test Product',
    description: productData.description || 'Test product description',
    price: productData.price || '99.99',
    currency: productData.currency || 'USD',
    stock_quantity: productData.stock_quantity !== undefined ? productData.stock_quantity : 10,
    shop_id: shopId,
  };
  
  const result = await pool.query(
    `INSERT INTO products (shop_id, name, description, price, currency, stock_quantity)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [product.shop_id, product.name, product.description, product.price, product.currency, product.stock_quantity]
  );
  
  return result.rows[0];
};

/**
 * Get user by telegram_id
 */
export const getUserByTelegramId = async (telegramId) => {
  const pool = getTestPool();
  const result = await pool.query(
    'SELECT * FROM users WHERE telegram_id = $1',
    [telegramId]
  );
  return result.rows[0];
};

/**
 * Get shop by id
 */
export const getShopById = async (shopId) => {
  const pool = getTestPool();
  const result = await pool.query(
    'SELECT * FROM shops WHERE id = $1',
    [shopId]
  );
  return result.rows[0];
};

/**
 * Get product by id
 */
export const getProductById = async (productId) => {
  const pool = getTestPool();
  const result = await pool.query(
    'SELECT * FROM products WHERE id = $1',
    [productId]
  );
  return result.rows[0];
};

/**
 * Create test order
 */
export const createTestOrder = async (buyerId, productId, shopId, orderData = {}) => {
  const pool = getTestPool();

  const order = {
    buyer_id: buyerId,
    product_id: productId,
    shop_id: shopId,
    quantity: orderData.quantity || 1,
    total_price: orderData.total_price || '99.99',
    status: orderData.status || 'pending',
    buyer_telegram_id: orderData.buyer_telegram_id || '123456789'
  };

  const result = await pool.query(
    `INSERT INTO orders (buyer_id, product_id, shop_id, quantity, total_price, status, buyer_telegram_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [order.buyer_id, order.product_id, order.shop_id, order.quantity, order.total_price, order.status, order.buyer_telegram_id]
  );

  return result.rows[0];
};

/**
 * Create test invoice
 */
export const createTestInvoice = async (orderId, invoiceData = {}) => {
  const pool = getTestPool();

  const invoice = {
    order_id: orderId,
    currency: invoiceData.currency || 'BTC',
    chain: invoiceData.chain || 'btc',
    expected_amount: invoiceData.expected_amount || 0.001,
    payment_address: invoiceData.payment_address || 'bc1test123456789',
    status: invoiceData.status || 'pending'
  };

  const result = await pool.query(
    `INSERT INTO invoices (order_id, currency, chain, expected_amount, payment_address, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [invoice.order_id, invoice.currency, invoice.chain, invoice.expected_amount, invoice.payment_address, invoice.status]
  );

  return result.rows[0];
};
