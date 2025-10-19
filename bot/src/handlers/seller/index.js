import { sellerMenu, sellerMenuNoShop } from '../../keyboards/seller.js';
import { shopApi } from '../../utils/api.js';
import logger from '../../utils/logger.js';

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

  // Back to seller menu
  bot.action('seller:main', handleSellerRole);
};

/**
 * Handle seller role selection
 */
const handleSellerRole = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    ctx.session.role = 'seller';
    logger.info(`User ${ctx.from.id} selected seller role`);

    // Check if user has a shop
    try {
      // БАГ #9: Check if token exists
      if (!ctx.session.token) {
        logger.warn(`User ${ctx.from.id} has no token, cannot check shop`);
        await ctx.editMessageText(
          'Создайте магазин для продажи товаров\n\nСтоимость регистрации: $25',
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
        await ctx.editMessageText(
          'Создайте магазин для продажи товаров\n\nСтоимость регистрации: $25',
          sellerMenuNoShop
        );
      }
    } catch (error) {
      logger.error('Error checking shop:', error);
      // БАГ #5: Better error handling
      if (error.response?.status === 404 || error.response?.status === 401) {
        // No shop found or auth failed
        await ctx.editMessageText(
          'Создайте магазин для продажи товаров\n\nСтоимость регистрации: $25',
          sellerMenuNoShop
        );
      } else {
        // Real error (network, server)
        await ctx.editMessageText(
          'Ошибка при проверке магазина\n\nПопробуйте позже',
          sellerMenuNoShop
        );
      }
    }
  } catch (error) {
    logger.error('Error in seller role handler:', error);
    throw error;
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
    throw error;
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
    throw error;
  }
};
