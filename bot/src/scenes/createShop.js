import { Scenes } from 'telegraf';
import { successButtons, cancelButton } from '../keyboards/common.js';
import { shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import * as messageCleanup from '../utils/messageCleanup.js';
import * as messageTracker from '../utils/messageTracker.js';

/**
 * Create Shop Scene - Simplified (NO PAYMENT)
 * Steps:
 * 1. Enter shop name
 * 2. Complete (create shop)
 */

// Step 1: Enter shop name
const enterShopName = async (ctx) => {
  try {
    logger.info('shop_create_step:name', { userId: ctx.from.id });
    
    await ctx.reply(
      'Название (3-100 символов):',
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
    // Get shop name from message
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Введите название магазина');
      return;
    }

    // Track user message for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    const shopName = ctx.message.text.trim();

    if (shopName.length < 3) {
      await ctx.reply('Минимум 3 символа');
      return;
    }

    if (shopName.length > 100) {
      await ctx.reply('Макс 100 символов');
      return;
    }

    logger.info('shop_create_step:save', {
      userId: ctx.from.id,
      shopName: shopName
    });

    // Show loading message (will be deleted after)
    const loadingMsg = await ctx.reply('Сохраняем...');

    if (!ctx.session.token) {
      logger.error('Missing auth token when creating shop', {
        userId: ctx.from.id,
        session: ctx.session
      });
      await ctx.reply(
        'Ошибка авторизации. Попробуйте снова через главное меню',
        successButtons
      );
      return await ctx.scene.leave();
    }

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
    ctx.session.shopName = shop.name;

    // Validate session save
    if (!ctx.session.shopId) {
      logger.error('Failed to save shopId to session!', { shop, session: ctx.session });
      throw new Error('Session save failed');
    }

    logger.info('shop_created', {
      shopId: shop.id,
      shopName: shop.name,
      userId: ctx.from.id,
      savedToSession: ctx.session.shopId === shop.id
    });

    // Delete loading message
    await messageTracker.deleteMessage(ctx, loadingMsg.message_id);

    // Send success message using smartMessage (will be editable)
    await smartMessage.send(ctx, {
      text: `✅ ${shopName}`,
      keyboard: successButtons
    });

    // Leave scene (cleanup will happen in scene.leave())
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error creating shop:', error);

    // Delete loading message if exists
    if (loadingMsg) {
      await messageTracker.deleteMessage(ctx, loadingMsg.message_id);
    }

    await smartMessage.send(ctx, {
      text: 'Ошибка. Попробуйте позже',
      keyboard: successButtons
    });

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
  // Delete user messages (shop name input)
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
  logger.info(`User ${ctx.from?.id} left createShop scene`);
});

// Handle cancel action within scene
createShopScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('shop_create_cancelled', { userId: ctx.from.id });

    await ctx.scene.leave();

    await smartMessage.send(ctx, {
      text: 'Отменено',
      keyboard: successButtons
    });
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: 'Произошла ошибка при отмене\n\nПопробуйте позже',
        keyboard: successButtons
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default createShopScene;
