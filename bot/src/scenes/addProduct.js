import { Scenes } from 'telegraf';
import { productCurrencyKeyboard } from '../keyboards/seller.js';
import { cancelButton, successButtons } from '../keyboards/common.js';
import { productApi } from '../utils/api.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Add Product Scene - Multi-step wizard
 * Steps:
 * 1. Enter product name
 * 2. Enter price
 * 3. Select currency
 * 4. Complete
 */

// Step 1: Enter product name
const enterName = async (ctx) => {
  try {
    await ctx.editMessageText(
      'Добавить товар\n\nОтправьте название товара:',
      cancelButton
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterName step:', error);
    throw error;
  }
};

// Step 2: Enter price
const enterPrice = async (ctx) => {
  try {
    // Skip callback queries
    if (ctx.callbackQuery) {
      return;
    }

    // Get product name from message
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Отправьте название товара', cancelButton);
      return;
    }

    const productName = ctx.message.text.trim();

    if (productName.length < 3) {
      await ctx.reply('Название должно быть минимум 3 символа', cancelButton);
      return;
    }

    ctx.wizard.state.name = productName;

    logger.info(`User ${ctx.from.id} entered product name: ${productName}`);

    await ctx.reply('Отправьте цену товара:', cancelButton);

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterPrice step:', error);
    throw error;
  }
};

// Step 3: Select currency
const selectCurrency = async (ctx) => {
  try {
    // Skip callback queries
    if (ctx.callbackQuery) {
      return;
    }

    // Get price from message
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Отправьте цену товара', cancelButton);
      return;
    }

    const priceText = ctx.message.text.trim();
    const price = parseFloat(priceText);

    if (isNaN(price) || price <= 0) {
      await ctx.reply('Введите корректную цену', cancelButton);
      return;
    }

    ctx.wizard.state.price = price;

    logger.info(`User ${ctx.from.id} entered price: ${price}`);

    await ctx.reply('Выберите валюту:', productCurrencyKeyboard);

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in selectCurrency step:', error);
    throw error;
  }
};

// Step 4: Complete
const complete = async (ctx) => {
  try {
    // БАГ #8 & #13: Better validation
    if (!ctx.callbackQuery || !ctx.callbackQuery.data) {
      await ctx.reply('Пожалуйста, выберите валюту из меню', cancelButton);
      return;
    }

    if (!ctx.callbackQuery.data.startsWith('product_currency:')) {
      await ctx.reply('Неверный выбор. Выберите валюту', productCurrencyKeyboard);
      return;
    }

    await ctx.answerCbQuery();

    const currencyParts = ctx.callbackQuery.data.split(':');
    if (currencyParts.length !== 2) {
      logger.error('Invalid currency callback data:', ctx.callbackQuery.data);
      await ctx.editMessageText('Ошибка выбора валюты. Попробуйте снова', productCurrencyKeyboard);
      return;
    }

    const currency = currencyParts[1];
    ctx.wizard.state.currency = currency;

    logger.info(`User ${ctx.from.id} selected currency: ${currency}`);

    const { name, price } = ctx.wizard.state;

    // Validate shopId exists
    if (!ctx.session.shopId) {
      logger.error('No shopId in session when creating product', {
        userId: ctx.from.id,
        session: ctx.session
      });
      await ctx.editMessageText(
        'Ошибка: магазин не найден\n\nСначала создайте магазин',
        successButtons
      );
      return await ctx.scene.leave();
    }

    // Create product via backend
    await ctx.editMessageText('Создаём товар...');

    const product = await productApi.createProduct({
      name,
      price,
      currency,
      shopId: ctx.session.shopId
    }, ctx.session.token);

    // Validate product object
    if (!product || !product.id) {
      logger.error('Product creation failed: invalid product object received', { product });
      throw new Error('Invalid product object from API');
    }

    logger.info('Product created successfully:', {
      productId: product.id,
      productName: product.name,
      shopId: ctx.session.shopId,
      userId: ctx.from.id
    });

    // Find currency emoji
    const currencyData = config.currencies.find(c => c.code === currency);
    const currencyEmoji = currencyData ? currencyData.emoji : '';

    await ctx.editMessageText(
      `✓ Товар добавлен\n\n${name}\n${price} ${currencyEmoji}${currency}`,
      successButtons
    );

    // Leave scene
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error creating product:', error);
    await ctx.editMessageText(
      'Не удалось добавить товар\n\nПопробуйте позже',
      successButtons
    );
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const addProductScene = new Scenes.WizardScene(
  'addProduct',
  enterName,
  enterPrice,
  selectCurrency,
  complete
);

// Handle scene leave
addProductScene.leave(async (ctx) => {
  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left addProduct scene`);
});

export default addProductScene;
