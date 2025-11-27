import dotenv from 'dotenv';

// CRITICAL: override: true ensures .env file values override system environment variables
// Without this, stale system env vars (like placeholder TELEGRAM_BOT_TOKEN) would be used
dotenv.config({ override: true });

/**
 * Validate required environment variables
 */
const requiredEnvVars = ['PORT', 'DATABASE_URL', 'JWT_SECRET', 'TELEGRAM_BOT_TOKEN'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

/**
 * P1-SEC-005: Validate JWT_SECRET strength
 * Minimum 32 characters to ensure sufficient entropy
 */
if (process.env.JWT_SECRET.length < 32) {
  throw new Error(
    `JWT_SECRET must be at least 32 characters long for security. Current length: ${process.env.JWT_SECRET.length}. ` +
      `Please generate a stronger secret using: openssl rand -base64 32`
  );
}

/**
 * Configuration object with all environment variables
 */
export const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
  },

  // Crypto APIs
  crypto: {
    blockchainApiKey: process.env.BLOCKCHAIN_API_KEY,
    etherscanApiKey: process.env.ETHERSCAN_API_KEY,
    trongridApiKey: process.env.TRONGRID_API_KEY,
    // Platform crypto addresses
    btcAddress: process.env.CRYPTO_BTC_ADDRESS,
    ethAddress: process.env.CRYPTO_ETH_ADDRESS,
    usdtAddress: process.env.CRYPTO_USDT_ADDRESS,
    ltcAddress: process.env.CRYPTO_LTC_ADDRESS,
  },

  // Shop
  shopCost: parseFloat(process.env.SHOP_REGISTRATION_COST) || 25,

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // AI
  ai: {
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY_BACKEND,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },
};

export default config;
