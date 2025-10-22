/**
 * Jest Setup - Runs after environment setup
 * Sets up test helpers and mocks
 * 
 * Note: Environment variables are set in env-setup.js (runs first)
 */

// Global test helpers
global.testUser = {
  telegram_id: '123456789',
  username: 'testuser',
  first_name: 'Test',
  last_name: 'User',
};

global.testShop = {
  name: 'Test Shop',
  description: 'Test shop description',
};

global.testProduct = {
  name: 'Test Product',
  description: 'Test product description',
  price: '99.99',
  currency: 'USD',
  stock_quantity: 10,
};

// Note: Console mocking removed for ESM compatibility
// Tests will show console output
