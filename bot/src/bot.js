import { Telegraf, Scenes, session } from 'telegraf';
import dotenv from 'dotenv';
import config from './config/index.js';
import logger from './utils/logger.js';

// Middleware
import authMiddleware from './middleware/auth.js';
import errorMiddleware from './middleware/error.js';

// Scenes
import createShopScene from './scenes/createShop.js';
import addProductScene from './scenes/addProduct.js';
import searchShopScene from './scenes/searchShop.js';

// Handlers
import { handleStart } from './handlers/start.js';
import { setupSellerHandlers } from './handlers/seller/index.js';
import { setupBuyerHandlers } from './handlers/buyer/index.js';
import { setupCommonHandlers } from './handlers/common.js';

dotenv.config();

// Validate required environment variables
if (!config.botToken) {
  logger.error('BOT_TOKEN is not defined in environment variables');
  process.exit(1);
}

// Initialize bot
const bot = new Telegraf(config.botToken);

// Setup session and scenes
const stage = new Scenes.Stage([
  createShopScene,
  addProductScene,
  searchShopScene
]);

bot.use(session());
bot.use(stage.middleware());

// Session state logging middleware (for debugging)
bot.use((ctx, next) => {
  if (ctx.from) {
    logger.debug('Session state:', {
      userId: ctx.from.id,
      username: ctx.from.username,
      shopId: ctx.session?.shopId,
      role: ctx.session?.role,
      hasToken: !!ctx.session?.token,
      updateType: ctx.updateType
    });
  }
  return next();
});

// Apply middleware
bot.use(authMiddleware);
bot.use(errorMiddleware);

// Register handlers
bot.start(handleStart);
setupSellerHandlers(bot);
setupBuyerHandlers(bot);
setupCommonHandlers(bot);

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down bot...');
  try {
    await bot.stop();
    logger.info('Bot stopped successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// Error handling
bot.catch((err, ctx) => {
  logger.error(`Bot error for ${ctx.updateType}:`, err);
  ctx.reply('Произошла ошибка\n\nПопробуйте позже').catch(() => {});
});

// Launch bot
bot.launch()
  .catch((error) => {
    logger.error('Failed to launch bot:', error);
    process.exit(1);
  });

// Log success immediately (launch() doesn't resolve in polling mode)
logger.info(`Bot started successfully in ${config.nodeEnv} mode`);
logger.info(`Backend URL: ${config.backendUrl}`);
logger.info(`WebApp URL: ${config.webAppUrl}`);
