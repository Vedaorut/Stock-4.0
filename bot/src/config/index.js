import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables deterministically:
// 1) repo root .env (if present) for shared defaults
// 2) bot/.env overriding everything else, regardless of CWD
const repoRootEnv = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(repoRootEnv)) {
  dotenv.config({ path: repoRootEnv, override: false });
}

const botEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: botEnvPath, override: true });

/**
 * Validate required environment variables
 * In production: throw error if missing
 * In development: log warning
 */
function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing = [];
  const warnings = [];

  // Always required
  if (!process.env.BOT_TOKEN) {
    missing.push('BOT_TOKEN');
  }
  if (!process.env.BOT_USERNAME) {
    missing.push('BOT_USERNAME');
  }
  if (!process.env.BACKEND_URL) {
    missing.push('BACKEND_URL');
  }

  // Required in production only
  if (isProduction && !process.env.REDIS_URL) {
    missing.push('REDIS_URL');
  } else if (!process.env.REDIS_URL) {
    warnings.push('REDIS_URL not set, using default: redis://localhost:6379');
  }

  // Log warnings in development
  if (!isProduction && warnings.length > 0) {
    warnings.forEach((w) => console.warn(`[Config Warning] ${w}`));
  }

  // Handle missing variables
  if (missing.length > 0) {
    const message = `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
    if (isProduction) {
      throw new Error(message);
    } else {
      console.error(`[Config Error] ${message}`);
      // In development, only throw if BOT_TOKEN is missing (can't run without it)
      if (missing.includes('BOT_TOKEN')) {
        throw new Error('BOT_TOKEN is required to start the bot');
      }
    }
  }
}

// Run validation
validateEnv();

const config = {
  // Bot configuration
  botToken: process.env.BOT_TOKEN,
  botUsername: process.env.BOT_USERNAME,

  // URLs
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',

  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // AI configuration
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,

  // Supported cryptocurrencies
  currencies: [
    { code: 'BTC', name: 'Bitcoin', symbol: '₿', emoji: '₿' },
    { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', emoji: 'Ξ' },
    { code: 'USDT', name: 'USDT', symbol: '₮', emoji: '₮' },
  ],

  // Shop registration fee
  shopRegistrationFee: 25, // USD

  // Timeouts
  paymentTimeout: 15 * 60 * 1000, // 15 minutes

  // Session defaults
  sessionDefaults: {
    role: null,
    shopId: null,
    tempData: {},
  },

  // Redis configuration
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Internal API security (for bot-to-backend auth)
  internalSecret: process.env.INTERNAL_SECRET,

  // Session encryption key (AES-256-GCM)
  // Generate with: openssl rand -base64 32
  // If not set, sessions are stored in plaintext (backward compatible)
  sessionEncryptionKey: process.env.SESSION_ENCRYPTION_KEY,

  // Admin Telegram ID for feedback
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID || '8137738270',
};

export default config;
