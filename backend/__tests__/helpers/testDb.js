/**
 * Test Database Helper
 * Manages test database connection and cleanup
 */

import pkg from 'pg';
const { Pool } = pkg;

let testPool = null;

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
 * Deletes all data from tables in reverse dependency order
 */
export const cleanupTestData = async () => {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Delete in reverse dependency order
    await client.query('DELETE FROM order_items');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM payments');
    await client.query('DELETE FROM shop_payments');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM subscriptions');
    await client.query('DELETE FROM shops');
    await client.query('DELETE FROM users WHERE telegram_id >= 9000000000'); // Only test users (ID >= 9000000000)
    
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
 */
export const createTestUser = async (userData = {}) => {
  const pool = getTestPool();
  
  // Generate numeric test ID (9000000000 + timestamp to avoid conflicts)
  const testIdBase = 9000000000;
  const timestamp = Date.now() % 1000000000; // Last 9 digits
  
  const user = {
    telegram_id: userData.telegram_id || `${testIdBase + timestamp}`,
    username: userData.username || 'testuser',
    first_name: userData.first_name || 'Test',
    last_name: userData.last_name || 'User',
    selected_role: userData.selected_role || 'buyer',
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
