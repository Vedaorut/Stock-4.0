import { sellerMenu, sellerMenuNoShop, productsMenu } from '../../keyboards/seller.js';
import { shopApi, authApi, productApi, orderApi } from '../../utils/api.js';
import { formatPrice, formatOrderStatus } from '../../utils/format.js';
import { formatProductsList, formatSalesList } from '../../utils/minimalist.js';
import logger from '../../utils/logger.js';

// Export follows handlers
export * from './follows.js';

/**
 * Handle seller role selection
 */
export const handleSellerRole = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    ctx.session.role = 'seller';
    logger.info(`User ${ctx.from.id} selected seller role`);

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('seller', ctx.session.token);
        if (ctx.session.user) {
          ctx.session.user.selectedRole = 'seller'; // Update session cache
        }
        logger.info(`Saved seller role for user ${ctx.from.id}`);
      }
    } catch (error) {
      logger.error('Failed to save role:', error);
    }

    // Check if user has a shop
    try {
      // БАГ #9: Check if token exists
    if (!ctx.session.token) {
      logger.warn(`User ${ctx.from.id} has no token, cannot check shop`);
      ctx.session.shopId = null;
      ctx.session.shopName = null;
      await ctx.editMessageText(
        'Создать магазин - $25',
        sellerMenuNoShop
      );
      return;
      }

      // Backend returns array, get first shop
      const shops = await shopApi.getMyShop(ctx.session.token);

      logger.debug('Fetched user shops:', {
        userId: ctx.from.id,
        isArray: Array.isArray(shops),
        shopsCount: Array.isArray(shops) ? shops.length : 'not array',
        shops: shops
      });

      if (shops && Array.isArray(shops) && shops.length > 0) {
        const shop = shops[0];  // Get first shop
        ctx.session.shopId = shop.id;
        ctx.session.shopName = shop.name;

        logger.info('User shop loaded:', {
          userId: ctx.from.id,
          shopId: shop.id,
          shopName: shop.name,
          savedToSession: ctx.session.shopId === shop.id
        });

        await ctx.editMessageText(
          `Мой магазин: ${shop.name}\n\n`,
          sellerMenu(shop.name)
        );
      } else {
        logger.info(`User ${ctx.from.id} has no shops, showing create shop menu`);
        ctx.session.shopId = null;
        ctx.session.shopName = null;
        await ctx.editMessageText(
          'Создать магазин — $25',
          sellerMenuNoShop
        );
      }
    } catch (error) {
      logger.error('Error checking shop:', error);
      // БАГ #5: Better error handling
      if (error.response?.status === 404 || error.response?.status === 401) {
        // No shop found or auth failed
        ctx.session.shopId = null;
        ctx.session.shopName = null;
        await ctx.editMessageText(
          'Создать магазин - $25',
          sellerMenuNoShop
        );
      } else {
        // Real error (network, server)
        ctx.session.shopId = null;
        ctx.session.shopName = null;
        await ctx.editMessageText(
          'Ошибка загрузки',
          sellerMenuNoShop
        );
      }
    }
  } catch (error) {
    logger.error('Error in seller role handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        sellerMenuNoShop
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle create shop action
 */
const handleCreateShop = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Enter createShop scene
    await ctx.scene.enter('createShop');
  } catch (error) {
    logger.error('Error entering createShop scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        sellerMenuNoShop
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle add product action
 */
const handleAddProduct = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user has shop
    if (!ctx.session.shopId) {
      await ctx.editMessageText(
        'Сначала создайте магазин',
        sellerMenuNoShop
      );
      return;
    }

    // Enter addProduct scene
    await ctx.scene.enter('addProduct');
  } catch (error) {
    logger.error('Error entering addProduct scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      const shopName = ctx.session.shopName || 'Магазин';
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        sellerMenu(shopName)
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle view products
 */
const handleProducts = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user has shop
    if (!ctx.session.shopId) {
      await ctx.editMessageText(
        'Сначала создайте магазин',
        sellerMenuNoShop
      );
      return;
    }

    // Check authentication (MEDIUM severity fix - add token check)
    if (!ctx.session.token) {
      const shopName = ctx.session.shopName || 'Магазин';
      await ctx.editMessageText(
        'Необходима авторизация. Перезапустите бота командой /start',
        productsMenu(shopName)
      );
      return;
    }

    // Get shop products
    const products = await productApi.getShopProducts(ctx.session.shopId);
    const shopName = ctx.session.shopName || 'Магазин';

    // Use minimalist formatter (8 lines → 3 lines)
    const message = formatProductsList(products, shopName);

    await ctx.editMessageText(message, productsMenu(shopName));
    logger.info(`User ${ctx.from.id} viewed products (${products.length} total)`);
  } catch (error) {
    logger.error('Error fetching products:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await ctx.editMessageText(
      'Ошибка загрузки',
      productsMenu(shopName)
    );
  }
};

/**
 * Handle view sales
 */
const handleSales = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user has shop
    if (!ctx.session.shopId) {
      await ctx.editMessageText(
        'Сначала создайте магазин',
        sellerMenuNoShop
      );
      return;
    }

    // Check authentication
    if (!ctx.session.token) {
      const shopName = ctx.session.shopName || 'Магазин';
      await ctx.editMessageText(
        'Необходима авторизация. Перезапустите бота командой /start',
        sellerMenu(shopName)
      );
      return;
    }

    // Get shop orders (sales)
    const orders = await orderApi.getShopOrders(ctx.session.shopId, ctx.session.token);
    const shopName = ctx.session.shopName || 'Магазин';

    // Use minimalist formatter (9 lines → 4 lines)
    const message = formatSalesList(orders, shopName);

    await ctx.editMessageText(message, sellerMenu(shopName));
    logger.info(`User ${ctx.from.id} viewed sales (${orders.length} total)`);
  } catch (error) {
    logger.error('Error fetching sales:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await ctx.editMessageText(
      'Ошибка загрузки',
      sellerMenu(shopName)
    );
  }
};

/**
 * Handle manage wallets action
 */
const handleWallets = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user has shop
    if (!ctx.session.shopId) {
      await ctx.editMessageText(
        'Сначала создайте магазин',
        sellerMenuNoShop
      );
      return;
    }

    // Enter manageWallets scene
    await ctx.scene.enter('manageWallets');
  } catch (error) {
    logger.error('Error entering manageWallets scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      const shopName = ctx.session.shopName || 'Магазин';
      await ctx.editMessageText(
        'Произошла ошибка\n\nПопробуйте позже',
        sellerMenu(shopName)
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Setup seller-related handlers
 */
export const setupSellerHandlers = (bot) => {
  // Seller role selected
  bot.action('role:seller', handleSellerRole);

  // Create shop action
  bot.action('seller:create_shop', handleCreateShop);

  // Add product action
  bot.action('seller:add_product', handleAddProduct);

  // View products
  bot.action('seller:products', handleProducts);

  // View sales
  bot.action('seller:sales', handleSales);

  // Manage wallets
  bot.action('seller:wallets', handleWallets);

  // Back to seller menu
  bot.action('seller:main', handleSellerRole);
};
