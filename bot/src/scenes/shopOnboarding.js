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
import { authApi } from '../utils/api.js';
import { t } from '../i18n/index.js';
import { sellerMenu } from '../keyboards/seller.js';

const TOTAL_STEPS = 5;

// Delay helper for animations
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Step content generators - minimalist style
const getStepContent = (step, state, lang = 'ru') => {
  const { inviteLink } = state;

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

    case 4:
      // Step 5: Done with trial info
      return {
        text: t('shopOnboarding.doneTitle', {}, lang) + '\n\n' +
          t('shopOnboarding.doneText', {}, lang),
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(t('shopOnboarding.openStoreButton', {}, lang), 'onboarding:finish')],
        ]),
      };

    default:
      return null;
  }
};

// Animation frames for welcome step
const getWelcomeAnimationFrames = (inviteLink, lang = 'ru') => [
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

  // Entry step - show welcome with animation
  async (ctx) => {
    try {
      const { shopId, shopName, inviteLink } = ctx.scene.state || {};

      if (!shopId || !shopName || !inviteLink) {
        logger.error('Missing required state for shopOnboarding', {
          userId: ctx.from?.id,
          state: ctx.scene.state,
        });
        await ctx.scene.leave();
        return;
      }

      const lang = ctx.lang || ctx.session?.user?.language || 'ru';

      // Save to wizard state
      ctx.wizard.state.shopId = shopId;
      ctx.wizard.state.shopName = shopName;
      ctx.wizard.state.inviteLink = inviteLink;
      ctx.wizard.state.currentStep = 0;
      ctx.wizard.state.lang = lang;

      logger.info('shop_onboarding_started', {
        userId: ctx.from?.id,
        shopId,
        shopName,
      });

      // Animated welcome sequence
      const frames = getWelcomeAnimationFrames(inviteLink, lang);
      const content = getStepContent(0, ctx.wizard.state, lang);

      // Send first frame
      const msg = await ctx.reply(frames[0], { parse_mode: 'HTML' });
      ctx.wizard.state.messageId = msg.message_id;

      // Animate through frames
      await sleep(400);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        msg.message_id,
        null,
        frames[1],
        { parse_mode: 'HTML' }
      );

      await sleep(600);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        msg.message_id,
        null,
        content.text,
        {
          parse_mode: 'HTML',
          ...content.keyboard,
        }
      );

      return ctx.wizard.next();
    } catch (error) {
      logger.error('Error in shopOnboarding entry:', error);
      await ctx.scene.leave();
    }
  },

  // Handler step - process navigation
  async (_ctx) => {
    // This step handles callback queries
    // The actual logic is in action handlers below
    return;
  }
);

// Navigation: Next
shopOnboardingScene.action('onboarding:next', async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const lang = ctx.wizard.state.lang || ctx.lang || ctx.session?.user?.language || 'ru';
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
      await ctx.answerCbQuery('Ошибка. Попробуйте снова.');
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

    const lang = ctx.wizard.state.lang || ctx.lang || ctx.session?.user?.language || 'ru';

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
      await ctx.answerCbQuery('Ошибка. Попробуйте снова.');
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

    const lang = ctx.wizard.state.lang || ctx.lang || ctx.session?.user?.language || 'ru';

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
      await ctx.answerCbQuery('Ошибка. Попробуйте снова.');
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

    const lang = ctx.wizard.state.lang || ctx.lang || ctx.session?.user?.language || 'ru';
    const shopName = ctx.wizard.state.shopName || ctx.session?.shopName || 'Магазин';

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

    // Show seller menu
    const menu = sellerMenu(0, { hasFollows: false }, lang);
    const message = t('seller.shopPanel', { shop: shopName }, lang);
    await ctx.reply(message, { parse_mode: 'HTML', ...menu });
  } catch (error) {
    logger.error('Error in onboarding:finish:', error);
    try {
      await ctx.answerCbQuery('Ошибка. Попробуйте снова.');
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

// Leave handler - cleanup
shopOnboardingScene.leave((ctx) => {
  // Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};

  // Clear __scenes from Redis session to prevent stuck state
  if (ctx.session && ctx.session.__scenes) {
    delete ctx.session.__scenes;
  }

  logger.info(`User ${ctx.from?.id} left shopOnboarding scene`);
});

export default shopOnboardingScene;
