import { Scenes } from 'telegraf';
import { successButtons, cancelButton } from '../keyboards/common.js';
import { shopApi, authApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply } from '../utils/cleanReply.js';
import { getMessages } from '../texts/messages.js';
import { t } from '../i18n/index.js';

/**
 * Create Shop Scene - Simplified (NO PAYMENT)
 * Steps:
 * 1. Enter shop name
 * 2. Complete (create shop with tier/promo from chooseTier scene)
 */

// Step 1: Enter shop name (with payment verification for paid subscriptions)
const enterShopName = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';

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

    await cleanReply(ctx, t('createShop.enterName', {}, lang), cancelButton(lang));

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in enterShopName step:', error);
    throw error;
  }
};

// Step 2: Handle shop name and create shop immediately
const handleShopNameAndCreate = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    // Get shop name from message
    if (!ctx.message || !ctx.message.text) {
      await cleanReply(
        ctx,
        `${t('scenes.sendShopNameText', {}, lang)}\n\n${sellerMessages.createShopNamePrompt(lang)}`
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
        `${sellerMessages.createShopNameInvalidLength(lang)}\n${sellerMessages.createShopNameHint(lang)}`
      );
      return;
    }

    const validNamePattern = /^[\p{L}0-9 _-]+$/u;
    if (!validNamePattern.test(shopName)) {
      await cleanReply(
        ctx,
        `${sellerMessages.createShopNameInvalidChars(lang)}\n${sellerMessages.createShopNameHint(lang)}`
      );
      return;
    }

    // Create shop immediately
    await createShop(ctx, shopName, lang);
  } catch (error) {
    logger.error('Error creating shop:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMsgs } = getMessages(langErr);

    await smartMessage.send(ctx, {
      text: sellerMsgs.createShopError(langErr),
      keyboard: successButtons(langErr),
    });

    return await ctx.scene.leave();
  }
};

// Helper function to create shop
const createShop = async (ctx, shopName, lang = ctx.lang || ctx.session?.language || 'ru') => {
  const { seller: sellerMessages, general: generalMessages } = getMessages(lang);
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
      await cleanReply(ctx, t('createShop.selectTierFirst', {}, lang));
      // NOTE: Do NOT call ctx.scene.leave() before enter() - Telegraf does it automatically
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

      await cleanReply(ctx, generalMessages.authorizationRequired(lang), successButtons(lang));
      return await ctx.scene.leave();
    }

    loadingMsg = await cleanReply(ctx, sellerMessages.createShopSaving(lang));

    const payload = {
      name: shopName,
      description: t('createShop.defaultDescription', { shopName }, lang),
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

    // Enter shopOnboarding with shop data
    // FIX: Store state in session because ctx.scene.state is unreliable between WizardScenes
    // Telegraf's scene.enter() state parameter doesn't reliably work for WizardScene transitions
    logger.info('createShop transitioning to shopOnboarding', {
      userId: ctx.from.id,
      shopId: shop.id,
      shopName: shop.name,
      inviteLink: inviteLink.substring(0, 50),
    });

    // Store in session for reliable transfer
    ctx.session.__onboardingState = {
      shopId: shop.id,
      shopName: shop.name,
      inviteLink: inviteLink,
    };

    return await ctx.scene.enter('shopOnboarding');
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
        userMessage = ctx.t('createShop.subscriptionNotPaid');
        break;
      case 'SUBSCRIPTION_ALREADY_USED':
        userMessage = ctx.t('createShop.subscriptionAlreadyUsed');
        break;
      case 'SUBSCRIPTION_NOT_FOUND':
        userMessage = ctx.t('createShop.subscriptionNotFound');
        break;
      case 'SHOP_EXISTS':
        userMessage = ctx.t('createShop.shopExists');
        break;
      case 'SHOP_NAME_TAKEN':
        userMessage = ctx.t('createShop.nameTaken');
        // Don't leave scene - allow user to try again
        await cleanReply(ctx, userMessage, cancelButton(lang));
        return;
      default:
        // Handle "Shop name already taken" by error message text (fallback)
        if (
          errorMsg.toLowerCase().includes('already taken') ||
          errorMsg.toLowerCase().includes('\u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442\u043e') ||
          errorMsg.toLowerCase().includes('already exists')
        ) {
          await cleanReply(ctx, sellerMessages.createShopNameTaken(lang), cancelButton(lang));
          return;
        }

        userMessage = `❌ ${errorMsg || ctx.t('createShop.genericError')}`;
    }

    // Generic error - leave scene
    await smartMessage.send(ctx, {
      text: userMessage,
      keyboard: successButtons(lang),
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
  logger.info('createShop leave handler started', {
    userId: ctx.from?.id,
    userMsgIds: ctx.wizard?.state?.userMessageIds,
    hasWizard: !!ctx.wizard,
    sceneState: ctx.scene?.state ? Object.keys(ctx.scene.state) : [],
  });

  // Delete user messages (shop name input)
  const userMsgIds = ctx.wizard?.state?.userMessageIds || [];
  for (const msgId of userMsgIds) {
    try {
      await ctx.deleteMessage(msgId);
      logger.debug(`Deleted user message ${msgId} in createShop leave`);
    } catch (error) {
      // Message may already be deleted or too old
      logger.debug(`Could not delete user message ${msgId}:`, error.message);
    }
  }

  // P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  // NOTE: Do NOT clear ctx.scene.state or ctx.session.__scenes here!
  // This breaks scene transitions (e.g., createShop -> shopOnboarding)
  // Telegraf manages __scenes internally during enter/leave

  logger.info(`User ${ctx.from?.id} left createShop scene`);
});

// Handle cancel action within scene
createShopScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery(); // Silent
    logger.info('shop_create_cancelled', { userId: ctx.from.id });

    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { start: startMessages } = getMessages(lang);

    await ctx.scene.leave();

    // Silent transition - edit message without cancelled text
    await ctx.editMessageText(startMessages.welcome(lang), successButtons(lang));
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      const langErr = ctx.lang || ctx.session?.language || 'ru';
      const { general: generalMessages } = getMessages(langErr);
      await smartMessage.send(ctx, {
        text: generalMessages.actionFailed(langErr),
        keyboard: successButtons(langErr),
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

// Also handle 'cancel' action (some buttons use this)
createShopScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('shop_create_cancelled', { userId: ctx.from.id });

    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { start: startMessages } = getMessages(lang);

    await ctx.scene.leave();
    await ctx.editMessageText(startMessages.welcome(lang), successButtons(lang));
  } catch (error) {
    logger.error('Error in cancel handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

export default createShopScene;
