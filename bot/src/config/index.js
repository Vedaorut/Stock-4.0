import dotenv from 'dotenv';

dotenv.config();

const config = {
  // Bot configuration
  botToken: process.env.BOT_TOKEN,

  // URLs
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  webAppUrl: process.env.WEBAPP_URL || 'https://your-domain.com',

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
    { code: 'TON', name: 'Toncoin', symbol: 'TON', emoji: '🔷' }
  ],

  // Shop registration fee
  shopRegistrationFee: 25, // USD

  // Timeouts
  paymentTimeout: 15 * 60 * 1000, // 15 minutes

  // Session defaults
  sessionDefaults: {
    role: null,
    shopId: null,
    tempData: {}
  }
};

export default config;
