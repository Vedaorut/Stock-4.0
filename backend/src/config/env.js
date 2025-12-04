import dotenv from 'dotenv';

// CRITICAL: override: true ensures .env file values override system environment variables
// Without this, stale system env vars (like placeholder TELEGRAM_BOT_TOKEN) would be used
dotenv.config({ override: true });

// In Jest, always force NODE_ENV to "test" even if .env sets a different value
if (process.env.JEST_WORKER_ID !== undefined) {
  process.env.NODE_ENV = 'test';
}

/**
 * Validate required environment variables
 * In production: throw error if missing
 * In development: log warning for non-critical vars
 */
const isProduction = process.env.NODE_ENV === 'production';
const missing = [];
const warnings = [];

// JWT_SECRET - always required
if (!process.env.JWT_SECRET) {
  missing.push('JWT_SECRET');
}

// Database - require either DATABASE_URL or individual DB credentials
const hasDbUrl = !!process.env.DATABASE_URL;
const hasDbCredentials =
  process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD;

if (!hasDbUrl && !hasDbCredentials) {
  missing.push('DATABASE_URL or (DB_HOST + DB_NAME + DB_USER + DB_PASSWORD)');
}

// TELEGRAM_BOT_TOKEN - always required for auth
if (!process.env.TELEGRAM_BOT_TOKEN) {
  missing.push('TELEGRAM_BOT_TOKEN');
}

// PORT - optional, has default
if (!process.env.PORT) {
  warnings.push('PORT not set, using default: 3000');
}

// FRONTEND_URL - required in production for CORS
if (isProduction && !process.env.FRONTEND_URL) {
  missing.push('FRONTEND_URL');
} else if (!process.env.FRONTEND_URL) {
  warnings.push('FRONTEND_URL not set, using default: http://localhost:5173');
}

// Log warnings
if (warnings.length > 0) {
  warnings.forEach((w) => console.warn(`[Config Warning] ${w}`));
}

// Handle missing variables - always throw in production, warn in development
if (missing.length > 0) {
  const message = `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
  if (isProduction) {
    throw new Error(message);
  } else {
    // In development, still require critical vars
    const criticalMissing = missing.filter(
      (v) =>
        v === 'JWT_SECRET' ||
        v === 'TELEGRAM_BOT_TOKEN' ||
        v.includes('DATABASE_URL')
    );
    if (criticalMissing.length > 0) {
      throw new Error(message);
    }
    console.error(`[Config Warning] ${message}`);
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
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
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
