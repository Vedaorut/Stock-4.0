/**
 * Environment Setup - Runs FIRST before any imports
 * MUST run before config/env.js is loaded
 */

// Set test environment variables FIRST
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jwt';
process.env.JWT_EXPIRES_IN = '7d';
process.env.PORT = '3001';
process.env.DATABASE_URL = 'postgresql://admin:password@localhost:5433/telegram_shop';
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
process.env.SHOP_REGISTRATION_COST = '25';
process.env.CRYPTO_BTC_ADDRESS = 'bc1test123456789';
process.env.CRYPTO_ETH_ADDRESS = '0xtest1234567890abcdef';
process.env.CRYPTO_USDT_ADDRESS = '0xtest1234567890abcdef';
process.env.CRYPTO_TON_ADDRESS = 'EQtest123456789';
