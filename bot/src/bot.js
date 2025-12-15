import { Telegraf, Scenes } from 'telegraf';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import config from './config/index.js';
import logger from './utils/logger.js';
import { reply as cleanReply } from './utils/cleanReply.js';
import { logWebAppConfig } from './utils/webappUrl.js';
import { t } from './i18n/index.js';
import { authApi } from './utils/api.js';

// Middleware
import authMiddleware from './middleware/auth.js';
import { i18nMiddleware } from './middleware/i18n.js';
import errorMiddleware from './middleware/error.js';
import debounceMiddleware from './middleware/debounce.js';
import sessionRecoveryMiddleware from './middleware/sessionRecovery.js';
import { createRedisSession } from './middleware/redisSession.js';
import analyticsMiddleware from './middleware/analytics.js'; // P1-BOT-012
import { createUserRateLimitMiddleware } from './middleware/userRateLimit.js'; // P1-BOT-014

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
import markOrdersCompletedScene from './scenes/markOrdersCompleted.js';
import shopOnboardingScene from './scenes/shopOnboarding.js';
import feedbackScene from './scenes/feedback.js';
import renameShopScene from './scenes/renameShop.js';

// Handlers
import { handleStart } from './handlers/start.js';
import { setupSellerHandlers, setupFollowHandlers } from './handlers/seller/index.js';
import { setupBuyerHandlers } from './handlers/buyer/index.js';
import { setupCommonHandlers } from './handlers/common.js';
import { setupAIProductHandlers } from './handlers/seller/aiProducts.js';
import { setupWorkspaceHandlers } from './handlers/workspace/index.js';
import { setupWorkerHandlers } from './handlers/worker/index.js';
import { handleHealthCommand } from './commands/health.js'; // P1-BOT-015
import { setupSettingsHandlers } from './handlers/settings.js';

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
  markOrdersShippedScene, // Legacy: kept for backward compatibility
  markOrdersCompletedScene, // New: replaces markOrdersShipped
  shopOnboardingScene,
  feedbackScene,
  renameShopScene,
]);

// Configure session middleware with Redis store
bot.use(createRedisSession(redis));

// CRITICAL: These middleware must run BEFORE stage.middleware()
// Otherwise scene handlers block them from seeing callbacks
bot.use(analyticsMiddleware); // P1-BOT-012: Track ALL requests
bot.use(createUserRateLimitMiddleware(redis)); // P1-BOT-014: Rate limit ALL requests
bot.use(debounceMiddleware); // Log and debounce ALL callbacks
bot.use(authMiddleware); // Authenticate ALL requests
bot.use(sessionRecoveryMiddleware); // Recover session for ALL requests
bot.use(i18nMiddleware()); // i18n for ALL requests
bot.use(errorMiddleware); // Error handling for ALL requests

// P1 FIX: Wrap answerCbQuery to prevent unhandled rejection on timeout
// Telegram callback queries expire after ~30s, but users may click buttons later
// This middleware silently catches timeout errors instead of crashing
bot.use((ctx, next) => {
  if (ctx.callbackQuery) {
    const originalAnswerCbQuery = ctx.answerCbQuery.bind(ctx);
    ctx.answerCbQuery = async (...args) => {
      try {
        return await originalAnswerCbQuery(...args);
      } catch (err) {
        // Silently ignore timeout/expired callback errors
        if (err.description?.includes('query is too old') ||
            err.description?.includes('QUERY_ID_INVALID')) {
          logger.debug(`[answerCbQuery] Silenced expired callback: ${err.message}`);
          return;
        }
        // Re-throw other errors
        throw err;
      }
    };
  }
  return next();
});

// CRITICAL: /start must ALWAYS reset scene state - even when stuck in a scene
// This middleware runs BEFORE stage.middleware() so it can clear __scenes first
bot.use((ctx, next) => {
  if (ctx.message?.text === '/start' || ctx.message?.text?.startsWith('/start ')) {
    // Preserve only essential data: language, role, token, user info
    if (ctx.session) {
      const { language, role, token, userId, shopId, shopName, tokenCreatedAt } = ctx.session;
      // Hard reset session but keep essentials
      ctx.session = {
        language,
        role,
        token,
        userId,
        shopId,
        shopName,
        tokenCreatedAt,
      };
      logger.info(`Session hard reset on /start for user ${ctx.from?.id}`);
    }
  }
  return next();
});

// CRITICAL: Handle priority callbacks GLOBALLY, even when user is in a scene
// These are callbacks from backend notifications that can arrive while user is in a scene
// This middleware runs BEFORE stage.middleware(), so we reset __scenes to prevent
// scene step handlers from swallowing these callbacks
const PRIORITY_CALLBACKS = ['start_create_shop', 'order:deliver:', 'back_to_main'];

bot.use(async (ctx, next) => {
  const callbackData = ctx.callbackQuery?.data;

  if (!callbackData) {
    return next();
  }

  // Check if this is a priority callback that needs scene bypass
  const isPriorityCallback = PRIORITY_CALLBACKS.some((prefix) => callbackData.startsWith(prefix));

  if (isPriorityCallback && ctx.session?.__scenes?.current) {
    logger.info('[GlobalCallback] Priority callback intercepted, resetting scene state', {
      userId: ctx.from?.id,
      callbackData,
      previousScene: ctx.session.__scenes.current,
    });

    // Reset scene state BEFORE stage.middleware() sees it
    ctx.session.__scenes = {};
  }

  // Special handling for start_create_shop
  if (callbackData.startsWith('start_create_shop')) {
    const [, tierFromCallback] = callbackData.split(':');
    ctx.session.pendingCreateShop = {
      tier: tierFromCallback || 'pro',
      paidSubscription: true,
    };
    ctx.session.role = 'seller';

    // Save role to backend (non-blocking)
    if (ctx.session.token) {
      authApi.updateRole('seller', ctx.session.token).catch((err) => {
        logger.error('[GlobalCallback] Failed to save role:', err.message);
      });
    }
  }

  return next();
});

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

// Register commands
bot.start(handleStart);
bot.command('health', handleHealthCommand); // P1-BOT-015: Health check

// Register handlers
setupSettingsHandlers(bot);
setupSellerHandlers(bot);
setupFollowHandlers(bot);
setupBuyerHandlers(bot);
setupWorkspaceHandlers(bot);
setupWorkerHandlers(bot);
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

  // P0 FIX: DO NOT delete ctx.session.__scenes - it breaks scene transitions
  // ctx.scene.leave() already handles __scenes cleanup properly
  // Deleting it manually causes race condition when leave() is followed by enter()
  // If scene is stuck, ctx.scene.leave() above already handled it

  // DON'T clear session - preserve shopId, token, role, etc.
  // Only wizard state (ctx.wizard.state) should be cleared, which happens in scene.leave()

  cleanReply(ctx, t('general.restartRequired', {}, ctx.lang || 'ru')).catch(() => { });
});

// Export bot instance and redis for backend integration
export { bot, redis };

// 409 Conflict prevention: retry delays (2s, 5s, 10s)
const LAUNCH_RETRY_DELAYS = [2000, 5000, 10000];
const MAX_LAUNCH_RETRIES = 3;

// Launch function (can be called from backend or standalone)
export async function startBot() {
  // Log WebApp configuration before launch
  logWebAppConfig();

  // Set bot commands for menu
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: t('general.mainMenu') },
    ]);
    logger.info('Bot commands configured');
  } catch (cmdError) {
    logger.warn('Failed to set bot commands:', cmdError.message);
  }

  // 409 CONFLICT FIX: Clear any existing webhook/polling before starting
  // This ensures clean state after PM2 restart
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    logger.info('Cleared webhook state before launch');
  } catch (webhookErr) {
    logger.warn('Failed to clear webhook:', webhookErr.message);
  }

  // Launch with retry mechanism for 409 Conflict
  let lastError;
  for (let attempt = 0; attempt <= MAX_LAUNCH_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = LAUNCH_RETRY_DELAYS[attempt - 1] || 10000;
        logger.info(`Retrying bot launch in ${delay}ms (attempt ${attempt}/${MAX_LAUNCH_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Launch bot (this starts polling and won't return in polling mode)
      await bot.launch({
        dropPendingUpdates: true,
      });

      logger.info(`Bot started successfully in ${config.nodeEnv} mode`);
      logger.info(`Backend URL: ${config.backendUrl}`);
      return; // Success - exit function
    } catch (error) {
      lastError = error;

      // Check if it's 409 Conflict error - worth retrying
      if (error.message?.includes('409') || error.response?.error_code === 409) {
        logger.warn(`Bot launch 409 Conflict (attempt ${attempt + 1}/${MAX_LAUNCH_RETRIES + 1})`, {
          error: error.message,
        });
        continue; // Retry
      }

      // Other errors - don't retry
      logger.error('Failed to launch bot (non-retryable):', error);
      throw error;
    }
  }

  // All retries exhausted
  logger.error('Failed to launch bot after all retries:', lastError);
  throw lastError;
}

// Auto-start when run directly (not imported)
// Always start bot - this file should only be run directly, not imported
startBot().catch((error) => {
  logger.error('Bot startup failed:', error);
  process.exit(1);
});
