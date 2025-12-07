/**
 * Shop Onboarding Scene
 *
 * 5-step tutorial for new sellers after creating their first shop.
 * Uses editMessageText for smooth "page flip" navigation with typing animation.
 *
 * Steps:
 * 0. Invite Link - How to share shop
 * 1. Products + AI - How to add products
 * 2. Wallets - Setup payment wallets
 * 3. Follows - Monitor and resell from other shops
 * 4. Done - Shop is ready with trial info
 */

import { Scenes, Markup } from 'telegraf';
import logger from '../utils/logger.js';
import { authApi, walletApi } from '../utils/api.js';
import { t } from '../i18n/index.js';
import { sellerMenu } from '../keyboards/seller.js';
import { detectCryptoType, validateCryptoAddress } from '../utils/validation.js';

const TOTAL_STEPS = 5;

// Delay helper for animations (used for typing effect)
const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Step content generators - minimalist style
const getStepContent = (step, state, lang = 'ru') => {
  const { inviteLink, subscriptionType } = state;

  switch (step) {
    case 0:
      // Step 1: Link
      return {
        text: t('shopOnboarding.linkTitle', {}, lang) + '\n\n' +
          `<code>${inviteLink}</code>\n\n` +
          t('shopOnboarding.linkText', {}, lang),
        keyboard: buildNavKeyboard(0, lang),
      };

    case 1:
      // Step 2: Products + AI
      return {
        text: t('shopOnboarding.productsTitle', {}, lang) + '\n\n' +
          t('shopOnboarding.productsText', {}, lang),
        keyboard: buildNavKeyboard(1, lang),
      };

    case 2:
      // Step 3: Wallets
      return {
        text: t('shopOnboarding.walletsTitle', {}, lang) + '\n\n' +
          t('shopOnboarding.walletsText', {}, lang),
        keyboard: buildNavKeyboard(2, lang),
      };

    case 3:
      // Step 4: Following
      return {
        text: t('shopOnboarding.followingTitle', {}, lang) + '\n\n' +
          t('shopOnboarding.followingText', {}, lang),
        keyboard: buildNavKeyboard(3, lang),
      };

    case 4: {
      // Step 5: Done - dynamic text based on subscription type
      // subscriptionType: 'trial' | 'promo' | 'paid'
      let doneTextKey = 'shopOnboarding.doneText'; // fallback
      if (subscriptionType === 'trial') {
        doneTextKey = 'shopOnboarding.doneTextTrial';
      } else if (subscriptionType === 'promo') {
        doneTextKey = 'shopOnboarding.doneTextPromo';
      } else if (subscriptionType === 'paid') {
        doneTextKey = 'shopOnboarding.doneTextPaid';
      }

      return {
        text: t('shopOnboarding.doneTitle', {}, lang) + '\n\n' +
          t(doneTextKey, {}, lang),
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(t('shopOnboarding.openStoreButton', {}, lang), 'onboarding:finish')],
        ]),
      };
    }

    default:
      return null;
  }
};

// Animation frames for welcome step (reserved for future typing animation)
const _getWelcomeAnimationFrames = (inviteLink, lang = 'ru') => [
  t('shopOnboarding.shopCreated', {}, lang),
  t('shopOnboarding.shopCreated', {}, lang) + '\n\n' + t('shopOnboarding.preparing', {}, lang),
  t('shopOnboarding.linkTitle', {}, lang) + '\n\n' +
  `<code>${inviteLink}</code>\n\n` +
  t('shopOnboarding.linkText', {}, lang),
];

// Build navigation keyboard based on current step
const buildNavKeyboard = (step, lang = 'ru') => {
  const buttons = [];

  // No extra action buttons on steps 1-2

  // Navigation row: Next | Skip All
  const navRow = [];
  navRow.push(Markup.button.callback(t('shopOnboarding.nextButton', {}, lang), 'onboarding:next'));
  buttons.push(navRow);

  // Skip All button (on all steps except last)
  if (step < TOTAL_STEPS - 1) {
    buttons.push([Markup.button.callback(t('shopOnboarding.skipAllButton', {}, lang), 'onboarding:skip')]);
  }

  return Markup.inlineKeyboard(buttons);
};

// Mark onboarding as completed in backend
const markOnboardingCompleted = async (ctx) => {
  try {
    const token = ctx.session?.token;
    if (!token) {
      logger.warn('No token to mark onboarding completed', { userId: ctx.from?.id });
      return;
    }

    await authApi.markOnboardingCompleted(token);

    logger.info('onboarding_completed', {
      userId: ctx.from?.id,
      shopId: ctx.scene.state.shopId,
    });
  } catch (error) {
    // Non-critical - just log and continue
    logger.error('Failed to mark onboarding completed:', {
      userId: ctx.from?.id,
      error: error.message,
    });
  }
};

// Create wizard scene
const shopOnboardingScene = new Scenes.WizardScene(
  'shopOnboarding',

  // Step 0 - placeholder (entry logic moved to .enter() hook below)
  // WizardScene's first step doesn't execute immediately on scene.enter()
  // It waits for the NEXT user update. So we use .enter() hook instead.
  async (_ctx) => {
    // This step is skipped via selectStep(1) in .enter() hook
    return;
  },

  // Step 1 - Handler for navigation (processes callback queries)
  async (_ctx) => {
    // The actual logic is in action handlers below
    return;
  }
);

// FIX: Use .enter() hook to send first message immediately
// This runs synchronously when scene.enter() is called, not waiting for next update
shopOnboardingScene.enter(async (ctx) => {
  try {
    // Read state from session (reliable) OR fallback to scene.state (legacy)
    const sessionState = ctx.session?.__onboardingState || {};
    const sceneState = ctx.scene.state || {};

    const shopId = sessionState.shopId || sceneState.shopId;
    const shopName = sessionState.shopName || sceneState.shopName;
    const inviteLink = sessionState.inviteLink || sceneState.inviteLink;
    const subscriptionType = sessionState.subscriptionType || sceneState.subscriptionType || 'trial';

    // Debug logging to verify state transfer
    logger.info('shopOnboarding .enter() hook - state check', {
      userId: ctx.from?.id,
      fromSession: !!sessionState.shopId,
      fromSceneState: !!sceneState.shopId,
      shopId,
      shopName,
      hasInviteLink: !!inviteLink,
    });

    // Clear session state after reading (cleanup)
    if (ctx.session?.__onboardingState) {
      delete ctx.session.__onboardingState;
    }

    if (!shopId || !shopName || !inviteLink) {
      logger.error('Missing required state for shopOnboarding', {
        userId: ctx.from?.id,
        sessionState: Object.keys(sessionState),
        sceneState: Object.keys(sceneState),
        shopId,
        shopName,
        inviteLink,
      });
      await ctx.scene.leave();
      return;
    }

    const lang = ctx.lang || ctx.session?.language || 'ru';

    // Save to wizard state (don't reassign ctx.wizard.state, set keys individually)
    ctx.wizard.state.shopId = shopId;
    ctx.wizard.state.shopName = shopName;
    ctx.wizard.state.inviteLink = inviteLink;
    ctx.wizard.state.subscriptionType = subscriptionType;
    ctx.wizard.state.currentStep = 0;
    ctx.wizard.state.lang = lang;

    logger.info('shop_onboarding_started', {
      userId: ctx.from?.id,
      shopId,
      shopName,
      inviteLink: inviteLink.substring(0, 50),
    });

    // Get step content
    const content = getStepContent(0, ctx.wizard.state, lang);

    // Send first message immediately
    const msg = await ctx.reply(content.text, {
      parse_mode: 'HTML',
      ...content.keyboard,
    });
    ctx.wizard.state.messageId = msg.message_id;

    logger.info('shop_onboarding_message_sent', {
      userId: ctx.from?.id,
      messageId: msg.message_id,
      shopId,
    });

    // Skip step 0 and go to step 1 for next user interaction
    ctx.wizard.selectStep(1);
  } catch (error) {
    logger.error('Error in shopOnboarding .enter() hook:', {
      userId: ctx.from?.id,
      error: error.message,
      stack: error.stack,
    });
    // Cleanup messageId to prevent memory leak
    if (ctx.wizard?.state?.messageId) {
      delete ctx.wizard.state.messageId;
    }
    await ctx.scene.leave();
  }
});

// Navigation: Next
shopOnboardingScene.action('onboarding:next', async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const lang = ctx.wizard.state.lang || ctx.lang || ctx.session?.language || 'ru';
    const currentStep = ctx.wizard.state.currentStep || 0;
    const nextStep = currentStep + 1;

    ctx.wizard.state.currentStep = nextStep;
    const content = getStepContent(nextStep, ctx.wizard.state, lang);

    // Step 4 is the final step - mark onboarding completed
    if (nextStep === TOTAL_STEPS - 1) {
      await markOnboardingCompleted(ctx);
    }

    await ctx.editMessageText(content.text, {
      parse_mode: 'HTML',
      ...content.keyboard,
    });

    logger.debug('onboarding_step_next', {
      userId: ctx.from?.id,
      step: nextStep,
    });
  } catch (error) {
    logger.error('Error in onboarding:next:', error);
    try {
      const lang = ctx.wizard?.state?.lang || ctx.lang || ctx.session?.language || 'ru';
      await ctx.answerCbQuery(t('general.errorRetry', {}, lang));
    } catch {
      /* ignored */
    }
  }
});

// Skip - go to final step
shopOnboardingScene.action('onboarding:skip', async (ctx) => {
  try {
    await ctx.answerCbQuery();

    await markOnboardingCompleted(ctx);

    const lang = ctx.wizard.state.lang || ctx.lang || ctx.session?.language || 'ru';

    logger.info('onboarding_skipped', {
      userId: ctx.from?.id,
      atStep: ctx.wizard.state.currentStep,
    });

    // Show final step (step 4)
    const finalStep = TOTAL_STEPS - 1;
    const content = getStepContent(finalStep, ctx.wizard.state, lang);
    await ctx.editMessageText(content.text, {
      parse_mode: 'HTML',
      ...content.keyboard,
    });

    ctx.wizard.state.currentStep = finalStep;
  } catch (error) {
    logger.error('Error in onboarding:skip:', error);
    try {
      const lang = ctx.wizard?.state?.lang || ctx.lang || ctx.session?.language || 'ru';
      await ctx.answerCbQuery(t('general.errorRetry', {}, lang));
    } catch {
      /* ignored */
    }
  }
});

// Handle open_shop - opens Mini App
shopOnboardingScene.action('onboarding:open_shop', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await markOnboardingCompleted(ctx);

    const lang = ctx.wizard.state.lang || ctx.lang || ctx.session?.language || 'ru';

    logger.info('onboarding_open_shop', {
      userId: ctx.from?.id,
      shopId: ctx.wizard.state.shopId,
    });

    await ctx.editMessageText(t('shopOnboarding.shopReady', {}, lang), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback(t('shopOnboarding.openStoreButton', {}, lang), 'seller:my_shop')]]),
    });

    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error in onboarding:open_shop:', error);
    try {
      const lang = ctx.wizard?.state?.lang || ctx.lang || ctx.session?.language || 'ru';
      await ctx.answerCbQuery(t('general.errorRetry', {}, lang));
    } catch {
      /* ignored */
    }
  }
});

// Handle finish - leave scene and show seller menu
shopOnboardingScene.action('onboarding:finish', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await markOnboardingCompleted(ctx);

    const lang = ctx.wizard.state.lang || ctx.lang || ctx.session?.language || 'ru';
    const shopName =
      ctx.wizard.state.shopName || ctx.session?.shopName || ctx.t('general.shopFallbackName');

    logger.info('onboarding_finished', {
      userId: ctx.from?.id,
      shopId: ctx.wizard.state.shopId,
    });

    // Leave scene first
    await ctx.scene.leave();

    // Delete the onboarding message
    try {
      await ctx.deleteMessage();
    } catch {
      /* ignore if can't delete */
    }

    // Show seller menu with tips
    const menu = sellerMenu(0, { hasFollows: false }, lang);
    // Use shopPanelWithStats to show random tip for new shop
    const { messages } = await import('../texts/messages.js');
    const { getTipForShop } = await import('../utils/sellerTips.js');
    const { checkShopHealth } = await import('../utils/shopHealthCheck.js');

    // Get shop health for tip generation
    let statusBar = '';
    try {
      const shopHealth = await checkShopHealth(ctx.wizard.state.shopId || ctx.session?.shopId, ctx.session?.token);
      if (shopHealth) {
        statusBar = getTipForShop(ctx, shopHealth);
      }
    } catch {
      // Silent fail - just show without tip
    }

    const message = messages.seller.shopPanelWithStats(shopName, 0, 0, statusBar, lang);
    await ctx.reply(message, { parse_mode: 'HTML', ...menu });
  } catch (error) {
    logger.error('Error in onboarding:finish:', error);
    try {
      const lang = ctx.wizard?.state?.lang || ctx.lang || ctx.session?.language || 'ru';
      await ctx.answerCbQuery(t('general.errorRetry', {}, lang));
    } catch {
      /* ignored */
    }
  }
});

// Handle main_menu from finish screen
shopOnboardingScene.action('main_menu', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    // Let global main_menu handler take over
  } catch (error) {
    logger.error('Error in onboarding main_menu:', error);
  }
});

// Handle text input for wallet addresses on step 2
shopOnboardingScene.on('text', async (ctx) => {
  try {
    // Only process on wallets step (step 2)
    if (ctx.wizard.state.currentStep !== 2) {
      return;
    }

    const lang = ctx.wizard.state.lang || ctx.lang || ctx.session?.language || 'ru';
    const shopId = ctx.wizard.state.shopId || ctx.session?.shopId;
    const token = ctx.session?.token;
    const userMessageId = ctx.message?.message_id;

    // Delete user input message
    const deleteUserInput = async () => {
      if (userMessageId) {
        await ctx.deleteMessage(userMessageId).catch((err) => {
          const status = err.response?.error_code || err.code;
          if (status !== 400 && status !== 429) {
            logger.warn('Unexpected deleteMessage error (onboarding wallet)', {
              messageId: userMessageId,
              error: err.message,
              status,
            });
          }
        });
      }
    };

    if (!shopId || !token) {
      logger.warn('Missing shopId or token in wallet handler', {
        userId: ctx.from?.id,
        shopId,
        hasToken: !!token,
      });
      await deleteUserInput();
      return;
    }

    const inputText = ctx.message.text.trim();
    const lines = inputText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length === 0) {
      await deleteUserInput();
      return;
    }

    const validWallets = [];
    const invalidAddresses = [];
    const walletData = {};

    // Process each line as a potential wallet address
    for (const address of lines) {
      const detectedType = detectCryptoType(address);

      if (!detectedType) {
        invalidAddresses.push(address.substring(0, 15) + (address.length > 15 ? '...' : ''));
        continue;
      }

      const isValid = validateCryptoAddress(address, detectedType);

      if (!isValid) {
        invalidAddresses.push(`${detectedType}: ${address.substring(0, 15)}...`);
        continue;
      }

      // Add to wallet data
      const walletField = `wallet_${detectedType.toLowerCase()}`;
      walletData[walletField] = address;
      validWallets.push(detectedType);
    }

    await deleteUserInput();

    // Save valid wallets if any
    if (Object.keys(walletData).length > 0) {
      try {
        await walletApi.updateWallets(shopId, walletData, token);

        logger.info('onboarding_wallets_saved', {
          shopId,
          userId: ctx.from?.id,
          wallets: validWallets,
        });
      } catch (apiError) {
        logger.error('Failed to save wallets in onboarding:', {
          shopId,
          userId: ctx.from?.id,
          error: apiError.message,
          apiResponse: apiError.response?.data,
        });

        // Send user-friendly error as temporary message
        const errorMsg = apiError.response?.data?.error || apiError.message;
        const feedbackMsg = await ctx.reply(
          `❌ ${t('shopOnboarding.walletSaveError', {}, lang)}\n<i>${errorMsg}</i>`,
          { parse_mode: 'HTML' }
        );
        // Auto-delete after 7 seconds
        setTimeout(() => {
          ctx.deleteMessage(feedbackMsg.message_id).catch(() => {});
        }, 7000);
        return;
      }
    }

    // Build feedback message - human-friendly style
    const feedbackParts = [];

    if (validWallets.length > 0) {
      feedbackParts.push(`✅ ${t('shopOnboarding.walletsAdded', { wallets: validWallets.join(', ') }, lang)}`);
    }

    if (invalidAddresses.length > 0) {
      feedbackParts.push(`⚠️ ${t('shopOnboarding.invalidWallets', { addresses: invalidAddresses.join(', ') }, lang)}`);
    }

    // Send temporary feedback message (auto-delete after 5 sec)
    if (feedbackParts.length > 0) {
      const feedbackText = feedbackParts.join('\n');
      const feedbackMsg = await ctx.reply(feedbackText, { parse_mode: 'HTML' });

      // Auto-delete feedback after 5 seconds to keep chat clean
      setTimeout(() => {
        ctx.deleteMessage(feedbackMsg.message_id).catch(() => {});
      }, 5000);
    }
  } catch (error) {
    logger.error('Error in shopOnboarding wallet text handler:', error);
  }
});

// Leave handler - cleanup
shopOnboardingScene.leave((ctx) => {
  // FIX: Don't reassign ctx.wizard.state - it's readonly
  // Clear individual keys instead to prevent memory leak
  if (ctx.wizard?.state) {
    Object.keys(ctx.wizard.state).forEach(key => {
      delete ctx.wizard.state[key];
    });
  }
  // NOTE: Do NOT clear ctx.scene.state or ctx.session.__scenes here!
  // Telegraf manages __scenes internally during enter/leave

  logger.info(`User ${ctx.from?.id} left shopOnboarding scene`);
});

// Handle cancel button - prevents users from getting stuck in scene
shopOnboardingScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('shop_onboarding_cancelled', { userId: ctx.from.id });
    await markOnboardingCompleted(ctx);
    await ctx.scene.leave();

    // Show seller menu with tips
    const lang = ctx.wizard?.state?.lang || ctx.lang || ctx.session?.language || 'ru';
    const shopName = ctx.wizard?.state?.shopName || ctx.session?.shopName || t('general.shopFallbackName', {}, lang);
    const shopId = ctx.wizard?.state?.shopId || ctx.session?.shopId;
    const menu = sellerMenu(0, { hasFollows: false }, lang);

    // Get tip for seller menu
    const { messages } = await import('../texts/messages.js');
    const { getTipForShop } = await import('../utils/sellerTips.js');
    const { checkShopHealth } = await import('../utils/shopHealthCheck.js');

    let statusBar = '';
    try {
      if (shopId && ctx.session?.token) {
        const shopHealth = await checkShopHealth(shopId, ctx.session.token);
        if (shopHealth) {
          statusBar = getTipForShop(ctx, shopHealth);
        }
      }
    } catch { /* silent */ }

    const message = messages.seller.shopPanelWithStats(shopName, 0, 0, statusBar, lang);

    try {
      await ctx.deleteMessage();
    } catch { /* ignore */ }

    await ctx.reply(message, { parse_mode: 'HTML', ...menu });
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

// Also handle 'cancel' action (some buttons use this)
shopOnboardingScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('shop_onboarding_cancelled', { userId: ctx.from.id });
    await markOnboardingCompleted(ctx);
    await ctx.scene.leave();

    // Show seller menu with tips
    const lang = ctx.wizard?.state?.lang || ctx.lang || ctx.session?.language || 'ru';
    const shopName = ctx.wizard?.state?.shopName || ctx.session?.shopName || t('general.shopFallbackName', {}, lang);
    const shopId = ctx.wizard?.state?.shopId || ctx.session?.shopId;
    const menu = sellerMenu(0, { hasFollows: false }, lang);

    // Get tip for seller menu
    const { messages } = await import('../texts/messages.js');
    const { getTipForShop } = await import('../utils/sellerTips.js');
    const { checkShopHealth } = await import('../utils/shopHealthCheck.js');

    let statusBar = '';
    try {
      if (shopId && ctx.session?.token) {
        const shopHealth = await checkShopHealth(shopId, ctx.session.token);
        if (shopHealth) {
          statusBar = getTipForShop(ctx, shopHealth);
        }
      }
    } catch { /* silent */ }

    const message = messages.seller.shopPanelWithStats(shopName, 0, 0, statusBar, lang);

    try {
      await ctx.deleteMessage();
    } catch { /* ignore */ }

    await ctx.reply(message, { parse_mode: 'HTML', ...menu });
  } catch (error) {
    logger.error('Error in cancel handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

export default shopOnboardingScene;
