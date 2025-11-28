import { Telegraf, session } from 'telegraf';
import dotenv from 'dotenv';

// Import handlers
import { handleStart, handleBackToMain, handleHelp, handleCancel } from './handlers/start.js';

import {
  handleSellerMenu,
  handleCreateShopStart,
  handlePaymentConfirm,
  handlePaymentHashInput,
  handleShopNameInput,
  handleCancelShopCreation,
  handleMyShop,
  handleVerifyPaymentButton,
} from './handlers/seller.js';

import {
  handleBuyerMenu,
  handleSearchShop,
  handleShopSearchInput,
  handleViewShop,
  handleSubscribe,
  handleUnsubscribe,
  handleMySubscriptions,
  handleBuyerOrders,
  handleBuyerOrdersByStatus,
  handleOpenWebappBuyer,
} from './handlers/buyer.js';

import {
  handleAddProduct,
  handleProductNameInput,
  handleProductDescriptionInput,
  handleProductPriceInput,
  handleProductStockInput,
  handleProductImageInput,
  handleViewProducts,
  handleViewProductDetail,
  handleDeleteProduct,
  handleMyOrders,
  handleOrdersByStatus,
  handleUpdateOrderStatus,
  handleOpenWebappSeller,
} from './handlers/shop.js';

// Load environment variables
dotenv.config();

// Validate environment variables
if (!process.env.BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN is not defined in .env file');
  process.exit(1);
}

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Session middleware
bot.use(
  session({
    defaultSession: () => ({
      role: null,
      state: null,
      data: {},
      shopId: null,
    }),
  })
);

// Error handling middleware
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err);
  ctx
    .reply(
      '❌ Произошла ошибка. Пожалуйста, попробуйте позже или используйте /start для перезапуска.'
    )
    .catch(() => {});
});

// Rate limiting (simple implementation)
const userMessageTimestamps = new Map();
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW) || 60000; // 1 minute
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10;
const CLEANUP_INTERVAL = 600000; // 10 minutes
const CLEANUP_AGE = 3600000; // 1 hour

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of userMessageTimestamps.entries()) {
    // Remove timestamps older than 1 hour
    const validTimestamps = timestamps.filter((ts) => now - ts < CLEANUP_AGE);

    if (validTimestamps.length === 0) {
      // Remove user entry if no valid timestamps
      userMessageTimestamps.delete(userId);
    } else {
      userMessageTimestamps.set(userId, validTimestamps);
    }
  }
  console.log(`🧹 Rate limit cleanup: ${userMessageTimestamps.size} active users`);
}, CLEANUP_INTERVAL);

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const now = Date.now();
  const userTimestamps = userMessageTimestamps.get(userId) || [];

  // Remove old timestamps
  const recentTimestamps = userTimestamps.filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW
  );

  if (recentTimestamps.length >= RATE_LIMIT_MAX) {
    await ctx.reply('⚠️ Слишком много запросов. Пожалуйста, подождите немного.');
    return;
  }

  recentTimestamps.push(now);
  userMessageTimestamps.set(userId, recentTimestamps);

  return next();
});

// ====== COMMANDS ======

// Start command
bot.command('start', handleStart);

// Help command
bot.command('help', handleHelp);

// Cancel command
bot.command('cancel', handleCancel);

// ====== CALLBACK QUERIES ======

// Navigation
bot.action('back_to_main', handleBackToMain);
bot.action('seller_menu', handleSellerMenu);
bot.action('buyer_menu', handleBuyerMenu);

// Seller actions
bot.action('create_shop_start', handleCreateShopStart);
bot.action('payment_confirm', handlePaymentConfirm);
bot.action('verify_payment', handleVerifyPaymentButton);
bot.action('cancel_shop_creation', handleCancelShopCreation);
bot.action('my_shop', handleMyShop);
bot.action('add_product', handleAddProduct);
bot.action('my_orders', handleMyOrders);
bot.action('open_webapp_seller', handleOpenWebappSeller);

// Shop products
bot.action(/^shop_products_(.+)$/, async (ctx) => {
  const shopId = ctx.match[1];
  await handleViewProducts(ctx, shopId);
});

bot.action('back_to_products', async (ctx) => {
  if (ctx.session.shopId) {
    await handleViewProducts(ctx, ctx.session.shopId);
  } else {
    await ctx.answerCbQuery('Магазин не найден');
  }
});

bot.action(/^product_detail_(.+)$/, async (ctx) => {
  const productId = ctx.match[1];
  await handleViewProductDetail(ctx, productId);
});

bot.action(/^delete_product_(.+)$/, async (ctx) => {
  const productId = ctx.match[1];
  await handleDeleteProduct(ctx, productId);
});

// Orders by status
bot.action('orders_new', async (ctx) => {
  await handleOrdersByStatus(ctx, 'new');
});

bot.action('orders_processing', async (ctx) => {
  await handleOrdersByStatus(ctx, 'processing');
});

bot.action('orders_completed', async (ctx) => {
  await handleOrdersByStatus(ctx, 'completed');
});

bot.action('orders_cancelled', async (ctx) => {
  await handleOrdersByStatus(ctx, 'cancelled');
});

// Order status updates
bot.action(/^order_accept_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  await handleUpdateOrderStatus(ctx, orderId, 'processing');
});

bot.action(/^order_reject_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  await handleUpdateOrderStatus(ctx, orderId, 'rejected');
});

bot.action(/^order_shipped_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  await handleUpdateOrderStatus(ctx, orderId, 'shipped');
});

bot.action(/^order_complete_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  await handleUpdateOrderStatus(ctx, orderId, 'completed');
});

// Buyer actions
bot.action('search_shop', handleSearchShop);
bot.action('my_subscriptions', handleMySubscriptions);
bot.action('buyer_orders', handleBuyerOrders);
bot.action('open_webapp_buyer', handleOpenWebappBuyer);

// View shop
bot.action(/^view_shop_(.+)$/, async (ctx) => {
  const shopId = ctx.match[1];
  await handleViewShop(ctx, shopId);
});

// Subscribe/Unsubscribe
bot.action(/^subscribe_(.+)$/, async (ctx) => {
  const shopId = ctx.match[1];
  await handleSubscribe(ctx, shopId);
});

bot.action(/^unsubscribe_(.+)$/, async (ctx) => {
  const shopId = ctx.match[1];
  await handleUnsubscribe(ctx, shopId);
});

// Buyer orders by status
bot.action('buyer_orders_active', async (ctx) => {
  await handleBuyerOrdersByStatus(ctx, 'active');
});

bot.action('buyer_orders_completed', async (ctx) => {
  await handleBuyerOrdersByStatus(ctx, 'completed');
});

bot.action('buyer_orders_cancelled', async (ctx) => {
  await handleBuyerOrdersByStatus(ctx, 'cancelled');
});

// ====== TEXT MESSAGES ======

// Handle text input based on state
bot.on('text', async (ctx) => {
  const state = ctx.session?.state;

  // Seller states
  if (state === 'awaiting_payment_hash') {
    await handlePaymentHashInput(ctx);
  } else if (state === 'awaiting_shop_name') {
    await handleShopNameInput(ctx);
  }
  // Product creation states
  else if (state === 'adding_product_name') {
    await handleProductNameInput(ctx);
  } else if (state === 'adding_product_description') {
    await handleProductDescriptionInput(ctx);
  } else if (state === 'adding_product_price') {
    await handleProductPriceInput(ctx);
  } else if (state === 'adding_product_stock') {
    await handleProductStockInput(ctx);
  } else if (state === 'adding_product_image') {
    await handleProductImageInput(ctx);
  }
  // Buyer states
  else if (state === 'awaiting_shop_search') {
    await handleShopSearchInput(ctx);
  }
  // Default - show help
  else {
    await ctx.reply(
      'Используйте кнопки меню для навигации.\n\n' +
        'Команды:\n' +
        '/start - Главное меню\n' +
        '/help - Помощь\n' +
        '/cancel - Отменить текущее действие'
    );
  }
});

// Handle photo messages (for product images)
bot.on('photo', async (ctx) => {
  const state = ctx.session?.state;

  if (state === 'adding_product_image') {
    await handleProductImageInput(ctx);
  } else {
    await ctx.reply('Отправка фото доступна только при добавлении товара.');
  }
});

// Catch-all для неподдерживаемых типов сообщений
bot.on('message', async (ctx) => {
  const state = ctx.session?.state;
  const messageType = ctx.message?.sticker
    ? 'стикер'
    : ctx.message?.voice
      ? 'голосовое сообщение'
      : ctx.message?.video
        ? 'видео'
        : ctx.message?.document
          ? 'документ'
          : ctx.message?.audio
            ? 'аудио'
            : ctx.message?.animation
              ? 'GIF'
              : ctx.message?.video_note
                ? 'видеосообщение'
                : ctx.message?.contact
                  ? 'контакт'
                  : ctx.message?.location
                    ? 'геолокацию'
                    : 'этот тип сообщения';

  if (state) {
    await ctx.reply(
      `Сейчас я жду текстовое сообщение, а не ${messageType}.\n` +
        'Пожалуйста, введите текст или нажмите /cancel для отмены.'
    );
  } else {
    await ctx.reply(
      `Я не понимаю ${messageType}.\n` + 'Используйте кнопки меню или команду /start'
    );
  }
});

// ====== START BOT ======

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await bot.stop(signal);
  process.exit(0);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Launch bot
bot
  .launch()
  .then(() => {
    console.log('✅ Bot started successfully!');
    console.log(`📱 Bot username: @${bot.botInfo.username}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Backend API: ${process.env.BACKEND_URL}`);
    console.log(`🌐 Web App: ${process.env.WEBAPP_URL}`);
    console.log('\n🤖 Bot is running... Press Ctrl+C to stop\n');

    // Webhook configuration (alternative to polling)
    // To enable webhook instead of polling:
    // 1. Uncomment lines below
    // 2. Set WEBHOOK_URL in .env (must be HTTPS)
    // 3. Comment out bot.launch() above
    //
    // const webhookUrl = process.env.WEBHOOK_URL;
    // bot.telegram.setWebhook(webhookUrl).then(() => {
    //   console.log(`🔗 Webhook set to: ${webhookUrl}`);
    // });
  })
  .catch((error) => {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

// Export bot for testing
export default bot;
