import { Scenes } from 'telegraf';
import { cancelButton, successButtons } from '../keyboards/common.js';
import { shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';

/**
 * Create Shop Scene - Simplified (NO PAYMENT)
 * Steps:
 * 1. Enter shop name
 * 2. Complete (create shop)
 */

// Step 1: Enter shop name
const enterShopName = async (ctx) => {
  try {
    await ctx.editMessageText(
      'Создание магазина\n\nВведите название магазина:',
      cancelButton
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterShopName step:', error);
    throw error;
  }
};

// Step 2: Handle shop name and create
const handleShopName = async (ctx) => {
  try {
    // Skip callback queries
    if (ctx.callbackQuery) {
      return;
    }

    // Get shop name from message
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Введите название магазина', cancelButton);
      return;
    }

    const shopName = ctx.message.text.trim();

    if (shopName.length < 3) {
      await ctx.reply('Название должно быть минимум 3 символа', cancelButton);
      return;
    }

    if (shopName.length > 100) {
      await ctx.reply('Название слишком длинное (макс 100 символов)', cancelButton);
      return;
    }

    logger.info(`User ${ctx.from.id} creating shop: ${shopName}`);

    await ctx.reply('Создаём магазин...');

    // Create shop via backend (NO PAYMENT)
    const shop = await shopApi.createShop({
      name: shopName,
      description: `Магазин ${shopName}`
    }, ctx.session.token);

    // Validate shop object
    if (!shop || !shop.id) {
      logger.error('Shop creation failed: invalid shop object received', { shop });
      throw new Error('Invalid shop object from API');
    }

    // Update session
    ctx.session.shopId = shop.id;

    // Validate session save
    if (!ctx.session.shopId) {
      logger.error('Failed to save shopId to session!', { shop, session: ctx.session });
      throw new Error('Session save failed');
    }

    logger.info('Shop created successfully:', {
      shopId: shop.id,
      shopName: shop.name,
      userId: ctx.from.id,
      savedToSession: ctx.session.shopId === shop.id
    });

    await ctx.reply(
      `✓ Магазин создан!\n\n${shopName}`,
      successButtons
    );

    // Leave scene
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error creating shop:', error);
    await ctx.reply(
      'Не удалось создать магазин\n\nПопробуйте позже',
      successButtons
    );
    return await ctx.scene.leave();
  }
};

// Create wizard scene (SIMPLIFIED - 2 steps only)
const createShopScene = new Scenes.WizardScene(
  'createShop',
  enterShopName,
  handleShopName
);

// Handle scene leave
createShopScene.leave(async (ctx) => {
  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left createShop scene`);
});

export default createShopScene;
