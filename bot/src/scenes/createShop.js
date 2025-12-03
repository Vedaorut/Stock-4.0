import { Scenes } from 'telegraf';
import { successButtons, cancelButton } from '../keyboards/common.js';
import { shopApi, authApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply } from '../utils/cleanReply.js';
import { messages } from '../texts/messages.js';
import { t } from '../i18n/index.js';

const { seller: sellerMessages, general: generalMessages, start: startMessages } = messages;

/**
 * Create Shop Scene - Simplified (NO PAYMENT)
 * Steps:
 * 1. Enter shop name
 * 2. Complete (create shop with tier/promo from chooseTier scene)
 */

// Step 1: Enter shop name (with payment verification for paid subscriptions)
const enterShopName = async (ctx) => {
  try {
    // Get state from scene entry (passed from paySubscription or chooseTier)
    const sceneState = ctx.scene.state;
    const paidSubscription = sceneState?.paidSubscription || false;
    const subscriptionId = sceneState?.subscriptionId;
    const tier = sceneState?.tier;
    const promoCode = sceneState?.promoCode;
    const trial = sceneState?.trial || false;

    // Save to wizard state
    if (tier) ctx.wizard.state.tier = tier;
    if (promoCode) ctx.wizard.state.promoCode = promoCode;
    if (subscriptionId) ctx.wizard.state.subscriptionId = subscriptionId;
    if (paidSubscription) ctx.wizard.state.paidSubscription = paidSubscription;
    if (trial) ctx.wizard.state.trial = trial;

    logger.info('shop_create_step:name', {
      userId: ctx.from.id,
      tier: ctx.wizard.state.tier,
      hasPromo: !!ctx.wizard.state.promoCode,
      hasPaidSubscription: !!ctx.wizard.state.paidSubscription,
    });

    // If coming from paySubscription (paid flow), the previous scene already
    // sent the "Payment Verified! Enter name:" message.
    // We skip sending it again to avoid garbage/duplication.
    if (paidSubscription && subscriptionId) {
      return ctx.wizard.next();
    }

    const lang = ctx.lang || ctx.session?.user?.language || 'ru';
    await cleanReply(ctx, t('createShop.enterName', {}, lang), cancelButton);

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterShopName step:', error);
    throw error;
  }
};

// Step 2: Handle shop name and create shop immediately
const handleShopNameAndCreate = async (ctx) => {
  try {
    // Get shop name from message
    if (!ctx.message || !ctx.message.text) {
      await cleanReply(
        ctx,
        'Пожалуйста, отправьте название магазина текстом.\n\n' + sellerMessages.createShopNamePrompt
      );
      return;
    }

    // Track user message for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    const shopName = ctx.message.text.trim();

    // Validation: length 3-100 characters
    if (shopName.length < 3 || shopName.length > 100) {
      await cleanReply(
        ctx,
        `${sellerMessages.createShopNameInvalidLength}\n${sellerMessages.createShopNameHint}`
      );
      return;
    }

    const validNamePattern = /^[0-9A-Za-zА-Яа-яЁё _-]+$/u;
    if (!validNamePattern.test(shopName)) {
      await cleanReply(
        ctx,
        `${sellerMessages.createShopNameInvalidChars}\n${sellerMessages.createShopNameHint}`
      );
      return;
    }

    // Create shop immediately
    await createShop(ctx, shopName);
  } catch (error) {
    logger.error('Error creating shop:', error);

    await smartMessage.send(ctx, {
      text: sellerMessages.createShopError,
      keyboard: successButtons,
    });

    return await ctx.scene.leave();
  }
};

// Helper function to create shop
const createShop = async (ctx, shopName) => {
  let loadingMsg = null;
  try {
    // Get tier, promo, subscriptionId, and trial from wizard state
    const tier = ctx.wizard.state.tier;
    const promoCode = ctx.wizard.state.promoCode || '';
    const subscriptionId = ctx.wizard.state.subscriptionId || null;
    const trial = ctx.wizard.state.trial || false;

    // H10 FIX: Validate tier is present (must be set by chooseTier/paySubscription scene)
    if (!tier) {
      logger.error('Missing tier when creating shop', {
        userId: ctx.from.id,
        wizardState: ctx.wizard.state,
      });
      // Show user-friendly message and redirect to chooseTier
      await cleanReply(ctx, 'Сначала выберите тариф подписки.');
      await ctx.scene.leave();
      await ctx.scene.enter('chooseTier');
      return;
    }

    logger.info('shop_create_step:save', {
      userId: ctx.from.id,
      shopName,
      tier,
      trial: Boolean(trial),
      promoProvided: Boolean(promoCode),
      subscriptionId: subscriptionId,
    });

    if (!ctx.session.token) {
      logger.error('Missing auth token when creating shop', {
        userId: ctx.from.id,
        session: ctx.session,
      });

      await cleanReply(ctx, generalMessages.authorizationRequired, successButtons);
      return await ctx.scene.leave();
    }

    loadingMsg = await cleanReply(ctx, sellerMessages.createShopSaving);

    const payload = {
      name: shopName,
      description: `Магазин ${shopName}`,
      tier: tier,
    };

    // Add trial flag if present (free trial flow)
    if (trial) {
      payload.trial = true;
    }

    // Add subscriptionId if present (paid subscription flow)
    if (subscriptionId) {
      payload.subscriptionId = subscriptionId;
    }

    // Add promo code if present (promo code flow)
    if (promoCode) {
      payload.promoCode = promoCode;
    }

    const shop = await shopApi.createShop(payload, ctx.session.token);

    if (!shop || !shop.id) {
      logger.error('Shop creation failed: invalid shop object received', { shop });
      throw new Error('Invalid shop object from API');
    }

    ctx.session.shopId = shop.id;
    ctx.session.shopName = shop.name;

    // Auto-switch to seller role after shop creation
    ctx.session.role = 'seller';
    if (ctx.session.user) {
      ctx.session.user.selectedRole = 'seller';
    }

    // Save seller role to database
    try {
      await authApi.updateRole('seller', ctx.session.token);
      logger.info('Auto-switched to seller role after shop creation', {
        userId: ctx.from.id,
        shopId: shop.id,
      });
    } catch (roleError) {
      logger.error('Failed to save seller role to DB:', roleError);
      // Continue anyway - role is set in session
    }

    logger.info('shop_created', {
      shopId: shop.id,
      shopName: shop.name,
      userId: ctx.from.id,
      tier: shop.tier,
    });

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (error) {
      logger.debug(`Could not delete loading message:`, error.message);
    }

    // Generate invite link
    const botUsername = process.env.BOT_USERNAME;
    if (!botUsername) {
      throw new Error('BOT_USERNAME environment variable is not set');
    }
    const inviteLink = `https://t.me/${botUsername}?start=shop_${shop.id}`;

    // Leave createShop and enter onboarding scene
    await ctx.scene.leave();

    // Enter shopOnboarding with shop data
    return await ctx.scene.enter('shopOnboarding', {
      shopId: shop.id,
      shopName: shop.name,
      inviteLink: inviteLink,
    });
  } catch (error) {
    logger.error('Error creating shop:', error);

    if (loadingMsg) {
      try {
        await ctx.deleteMessage(loadingMsg.message_id);
      } catch (deleteError) {
        logger.debug(`Could not delete loading message:`, deleteError.message);
      }
    }

    // Parse backend error message
    const errorMsg = error.response?.data?.error || error.message || '';
    const errorCode = error.response?.data?.code;

    // Handle specific backend error codes
    let userMessage;

    switch (errorCode) {
      case 'SUBSCRIPTION_NOT_PAID':
        userMessage = '❌ Подписка ещё не оплачена. Завершите оплату сначала.';
        break;
      case 'SUBSCRIPTION_ALREADY_USED':
        userMessage = '❌ Эта подписка уже привязана к другому магазину.';
        break;
      case 'SUBSCRIPTION_NOT_FOUND':
        userMessage = '❌ Подписка не найдена. Создайте новую подписку.';
        break;
      case 'SHOP_EXISTS':
        userMessage = '❌ У вас уже есть магазин.';
        break;
      case 'SHOP_NAME_TAKEN':
        userMessage = '❌ Это название уже занято. Выберите другое.';
        // Don't leave scene - allow user to try again
        await cleanReply(ctx, userMessage, cancelButton);
        return;
      default:
        // Handle "Shop name already taken" by error message text (fallback)
        if (
          errorMsg.toLowerCase().includes('already taken') ||
          errorMsg.toLowerCase().includes('уже занято') ||
          errorMsg.toLowerCase().includes('already exists')
        ) {
          await cleanReply(ctx, sellerMessages.createShopNameTaken, cancelButton);
          return;
        }

        userMessage = `❌ ${errorMsg || 'Не удалось создать магазин'}`;
    }

    // Generic error - leave scene
    await smartMessage.send(ctx, {
      text: userMessage,
      keyboard: successButtons,
    });

    return await ctx.scene.leave();
  }
};

// Create wizard scene (SIMPLIFIED - 2 steps only)
const createShopScene = new Scenes.WizardScene(
  'createShop',
  enterShopName,
  handleShopNameAndCreate
);

// Handle scene leave
createShopScene.leave(async (ctx) => {
  // Delete user messages (shop name input)
  const userMsgIds = ctx.wizard?.state?.userMessageIds || [];
  for (const msgId of userMsgIds) {
    try {
      await ctx.deleteMessage(msgId);
    } catch (error) {
      // Message may already be deleted or too old
      logger.debug(`Could not delete user message ${msgId}:`, error.message);
    }
  }

  // P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};

  // Очистить __scenes из Redis сессии для предотвращения застревания
  if (ctx.session && ctx.session.__scenes) {
    delete ctx.session.__scenes;
  }

  logger.info(`User ${ctx.from?.id} left createShop scene`);
});

// Handle cancel action within scene
createShopScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery(); // Silent
    logger.info('shop_create_cancelled', { userId: ctx.from.id });

    await ctx.scene.leave();

    // Silent transition - edit message without "Отменено" text
    await ctx.editMessageText(startMessages.welcome, successButtons);
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed,
        keyboard: successButtons,
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default createShopScene;
