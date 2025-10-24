import { Scenes } from 'telegraf';
import { successButtons, cancelButton } from '../keyboards/common.js';
import { productApi } from '../utils/api.js';
import { formatPrice } from '../utils/format.js';
import logger from '../utils/logger.js';
import * as messageCleanup from '../utils/messageCleanup.js';
import * as smartMessage from '../utils/smartMessage.js';

/**
 * Add Product Scene - Multi-step wizard
 * Steps:
 * 1. Enter product name
 * 2. Enter price (USD only)
 * 3. Complete
 */

// Step 1: Enter product name
const enterName = async (ctx) => {
  try {
    logger.info('product_add_step:name', { userId: ctx.from.id });

    await smartMessage.send(ctx, {
      text: 'Название (мин 3 символа):',
      keyboard: cancelButton
    });

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterName step:', error);
    throw error;
  }
};

// Step 2: Enter price
const enterPrice = async (ctx) => {
  try {
    // Get product name from message
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, { text: 'Отправьте название товара' });
      return;
    }

    const productName = ctx.message.text.trim();

    if (productName.length < 3) {
      await smartMessage.send(ctx, { text: 'Минимум 3 символа' });
      return;
    }

    // FIX BUG #1: Track user message IDs for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    ctx.wizard.state.name = productName;

    logger.info('product_add_step:price', {
      userId: ctx.from.id,
      productName: productName
    });

    await smartMessage.send(ctx, { text: 'Цена ($, > 0):' });

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterPrice step:', error);
    throw error;
  }
};

// Step 3: Complete
const complete = async (ctx) => {
  try {
    // Get price from message
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, { text: 'Отправьте цену товара' });
      return;
    }

    const priceText = ctx.message.text.trim().replace(',', '.');
    const price = parseFloat(priceText);

    if (isNaN(price) || price <= 0) {
      await smartMessage.send(ctx, { text: '❌ Цена — число > 0\n\nПример: 99.99 или 99,99' });
      return;
    }

    // FIX BUG #1: Track user message ID for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    ctx.wizard.state.price = price;

    logger.info('product_add_step:confirm', {
      userId: ctx.from.id,
      price: price
    });

    const { name } = ctx.wizard.state;

    // Validate shopId exists
    if (!ctx.session.shopId) {
      logger.error('No shopId in session when creating product', {
        userId: ctx.from.id,
        session: ctx.session
      });
      await smartMessage.send(ctx, {
        text: 'Ошибка: магазин не найден\n\nСначала создайте магазин',
        keyboard: successButtons
      });
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      logger.error('Missing auth token when creating product', {
        userId: ctx.from.id,
        session: ctx.session
      });
      await smartMessage.send(ctx, {
        text: 'Ошибка авторизации. Попробуйте снова через главное меню',
        keyboard: successButtons
      });
      return await ctx.scene.leave();
    }

    // Create product via backend
    await smartMessage.send(ctx, { text: 'Сохраняем...' });

    const product = await productApi.createProduct({
      name,
      price,
      currency: 'USD',
      shopId: ctx.session.shopId,
      stockQuantity: 0
    }, ctx.session.token);

    // Validate product object
    if (!product || !product.id) {
      logger.error('Product creation failed: invalid product object received', { product });
      throw new Error('Invalid product object from API');
    }

    logger.info('product_saved', {
      productId: product.id,
      productName: product.name,
      shopId: ctx.session.shopId,
      userId: ctx.from.id
    });

    await smartMessage.send(ctx, {
      text: `✅ ${name} — ${formatPrice(price)}`,
      keyboard: successButtons
    });

    // Leave scene
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error creating product:', error);
    await smartMessage.send(ctx, {
      text: 'Ошибка. Попробуйте позже',
      keyboard: successButtons
    });
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const addProductScene = new Scenes.WizardScene(
  'addProduct',
  enterName,
  enterPrice,
  complete
);

// Handle scene leave
addProductScene.leave(async (ctx) => {
  // FIX BUG #1: Delete user messages (name, price inputs)
  const userMsgIds = ctx.wizard.state.userMessageIds || [];
  for (const msgId of userMsgIds) {
    try {
      await ctx.deleteMessage(msgId);
    } catch (error) {
      // Message may already be deleted or too old
      logger.debug(`Could not delete user message ${msgId}:`, error.message);
    }
  }

  // Cleanup wizard messages (keep final message)
  await messageCleanup.cleanupWizard(ctx, {
    keepFinalMessage: true,
    keepWelcome: true
  });

  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left addProduct scene`);
});

// Handle cancel action within scene
addProductScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('product_add_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await smartMessage.send(ctx, { text: 'Отменено', keyboard: successButtons });
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка при отмене\n\nПопробуйте позже',
        successButtons
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default addProductScene;
