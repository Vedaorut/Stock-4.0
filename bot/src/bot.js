import { Telegraf, Scenes } from 'telegraf';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import config from './config/index.js';
import logger from './utils/logger.js';
import { reply as cleanReply } from './utils/cleanReply.js';
import { logWebAppConfig, getWebAppUrl } from './utils/webappUrl.js';
import { messages, buttons as buttonText } from './texts/messages.js';
const { general: generalMessages } = messages;

// Middleware
import authMiddleware from './middleware/auth.js';
import errorMiddleware from './middleware/error.js';
import debounceMiddleware from './middleware/debounce.js';
import sessionRecoveryMiddleware from './middleware/sessionRecovery.js';
import { createRedisSession } from './middleware/redisSession.js';
import analyticsMiddleware from './middleware/analytics.js'; // P1-BOT-012
import userRateLimitMiddleware from './middleware/userRateLimit.js'; // P1-BOT-014

// Scenes
import chooseTierScene from './scenes/chooseTier.js';
import createShopScene from './scenes/createShop.js';
import addProductScene from './scenes/addProduct.js';
import searchShopScene from './scenes/searchShop.js';
import manageWalletsScene from './scenes/manageWallets.js';
import createFollowScene from './scenes/createFollow.js';
import editFollowMarkupScene from './scenes/editFollowMarkup.js'; // P1-BOT-003
import migrateChannelScene from './scenes/migrateChannel.js';
import paySubscriptionScene from './scenes/paySubscription.js';
import upgradeShopScene from './scenes/upgradeShop.js';
import manageWorkersScene from './scenes/manageWorkers.js';
import markOrdersShippedScene from './scenes/markOrdersShipped.js';

// Handlers
import { handleStart } from './handlers/start.js';
import { setupSellerHandlers, setupFollowHandlers } from './handlers/seller/index.js';
import { setupBuyerHandlers } from './handlers/buyer/index.js';
import { setupCommonHandlers } from './handlers/common.js';
import { setupAIProductHandlers } from './handlers/seller/aiProducts.js';
import { setupWorkspaceHandlers } from './handlers/workspace/index.js';
import { handleHealthCommand } from './commands/health.js'; // P1-BOT-015

// Override is needed when system env already has vars (e.g., from shell)
dotenv.config({ override: true });

// Validate required environment variables
if (!config.botToken) {
  logger.error('BOT_TOKEN is not defined in environment variables');
  process.exit(1);
}

// Initialize bot
const bot = new Telegraf(config.botToken);

// Setup Redis for persistent sessions
const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

// Connect to Redis
try {
  await redis.connect();
  logger.info('Redis connected successfully for session storage');
} catch (error) {
  logger.error('Failed to connect to Redis:', error);
  logger.warn('Falling back to memory session storage (sessions will be lost on restart)');
}

// Setup session and scenes
const stage = new Scenes.Stage([
  chooseTierScene,
  createShopScene,
  addProductScene,
  searchShopScene,
  manageWalletsScene,
  createFollowScene,
  editFollowMarkupScene, // P1-BOT-003: Race condition fix
  migrateChannelScene,
  paySubscriptionScene,
  upgradeShopScene,
  manageWorkersScene,
  markOrdersShippedScene,
]);

// Configure session middleware with Redis store
bot.use(createRedisSession(redis));

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
      updateType: ctx.updateType,
    });
  }
  return next();
});

// Apply middleware
bot.use(analyticsMiddleware); // P1-BOT-012: Track usage
bot.use(userRateLimitMiddleware); // P1-BOT-014: Rate limiting
bot.use(debounceMiddleware); // Prevent rapid clicks

// CRITICAL: Auth MUST run BEFORE sessionRecovery
// authMiddleware creates token if missing
// sessionRecoveryMiddleware then uses token to restore shopId
bot.use(authMiddleware); // FIRST: Authenticate user (creates token if needed)
bot.use(sessionRecoveryMiddleware); // THEN: Recover shopId using valid token

// Error handling

bot.use(errorMiddleware);

// Register commands
bot.start(handleStart);
bot.command('health', handleHealthCommand); // P1-BOT-015: Health check

// Register handlers
setupSellerHandlers(bot);
setupFollowHandlers(bot);
setupBuyerHandlers(bot);
setupWorkspaceHandlers(bot);
setupCommonHandlers(bot);

// AI Product Management (must be registered last to handle text messages)
setupAIProductHandlers(bot);

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down bot...');
  try {
    await bot.stop();
    logger.info('Bot stopped successfully');

    // Close Redis connection
    if (redis && redis.status === 'ready') {
      await redis.quit();
      logger.info('Redis connection closed');
    }

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

  // P0-BOT-5 FIX: Only leave scene, DON'T clear session
  // Scene leave is enough to unstuck user, session data should persist
  if (ctx.scene) {
    try {
      ctx.scene.leave();
      logger.info('Left corrupted scene after error', {
        userId: ctx.from?.id,
        updateType: ctx.updateType,
      });
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }

  // DON'T clear session - preserve shopId, token, role, etc.
  // Only wizard state (ctx.wizard.state) should be cleared, which happens in scene.leave()

  cleanReply(ctx, generalMessages.restartRequired).catch(() => {});
});

// Export bot instance and redis for backend integration
export { bot, redis };

// Launch function (can be called from backend or standalone)
export async function startBot() {
  try {
    // Log WebApp configuration before launch
    logWebAppConfig();

    // Automatically set Menu Button with WebApp URL BEFORE launch
    try {
      const webappUrl = getWebAppUrl();
      await bot.telegram.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: buttonText.myShop,
          web_app: { url: webappUrl },
        },
      });
      logger.info(`Menu Button configured: ${webappUrl}`);
    } catch (menuError) {
      logger.warn('Failed to set Menu Button automatically:', menuError.message);
      logger.warn('You can set it manually in BotFather: /setmenubutton');
    }

    // Launch bot (this starts polling and won't return in polling mode)
    bot.launch();

    logger.info(`Bot started successfully in ${config.nodeEnv} mode`);
    logger.info(`Backend URL: ${config.backendUrl}`);
  } catch (error) {
    logger.error('Failed to launch bot:', error);
    throw error;
  }
}

// Auto-start when run directly (not imported)
// Check if this file is being run directly (not imported as a module)
const isMainModule =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule || process.argv[1]?.includes('bot.js')) {
  startBot().catch((error) => {
    logger.error('Bot startup failed:', error);
    process.exit(1);
  });
}
