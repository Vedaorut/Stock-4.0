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

const config = {
  // Bot configuration
  botToken: process.env.BOT_TOKEN,

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
};

export default config;
