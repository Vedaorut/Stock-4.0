/**
 * Jest Setup - Runs before all tests
 * Sets up test environment and mocks
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jwt';
process.env.JWT_EXPIRES_IN = '7d';
process.env.PORT = '3001'; // Different port for tests
process.env.DATABASE_URL = 'postgresql://admin:password@localhost:5433/telegram_shop'; // Using dev DB for tests
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
process.env.SHOP_REGISTRATION_COST = '25';
process.env.CRYPTO_BTC_ADDRESS = 'bc1test123456789';
process.env.CRYPTO_ETH_ADDRESS = '0xtest1234567890abcdef';
process.env.CRYPTO_USDT_ADDRESS = '0xtest1234567890abcdef';
process.env.CRYPTO_TON_ADDRESS = 'EQtest123456789';

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
