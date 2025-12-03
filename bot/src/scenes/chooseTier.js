/**
 * Choose Tier Scene
 *
 * Allows user to select subscription tier before creating a shop
 *
 * Steps:
 * 1. Show tier options (PRO / MAX) with pricing
 * 2. Handle tier selection
 * 3. Optional: Enter promo code or free trial
 * 4. Transition to createShop scene with selected tier
 */

import { Scenes, Markup } from 'telegraf';
import logger from '../utils/logger.js';
import { reply as cleanReply, replyHTML as cleanReplyHTML } from '../utils/cleanReply.js';
import { messages, buttons as buttonText } from '../texts/messages.js';
import { subscriptionApi } from '../utils/api.js';
import { t } from '../i18n/index.js';

const { subscription: subMessages } = messages;

const chooseTierScene = new Scenes.WizardScene(
  'chooseTier',

  // Step 1: Show tier selection
  async (ctx) => {
    try {
      logger.info('choose_tier_step:entry', { userId: ctx.from.id });

      const lang = ctx.lang || ctx.session?.user?.language || 'ru';

      // Fetch current prices from backend API
      const pricing = await subscriptionApi.getPricing();
      const proPrice = pricing.pro?.price || 25;
      const maxPrice = pricing.max?.price || 35;

      // Store prices in wizard state for later use
      ctx.wizard.state.pricing = { pro: proPrice, max: maxPrice };

      const message = t('chooseTier.title', {}, lang) + '\n\n' +
        t('chooseTier.proDescription', { price: proPrice }, lang) + '\n\n' +
        t('chooseTier.maxDescription', { price: maxPrice }, lang);

      await cleanReplyHTML(
        ctx,
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback(t('chooseTier.freeTrialButton', {}, lang), 'tier_trial')],
          [Markup.button.callback(t('chooseTier.proButton', { price: proPrice }, lang), 'tier_select:pro')],
          [Markup.button.callback(t('chooseTier.maxButton', { price: maxPrice }, lang), 'tier_select:max')],
          [Markup.button.callback(t('chooseTier.promoButton', {}, lang), 'tier_promo')],
        ])
      );

      return ctx.wizard.next();
    } catch (error) {
      logger.error('Error in chooseTier entry step:', error);
      throw error;
    }
  },

  // Step 2: Handle tier/promo selection
  async (ctx) => {
    // Handle callback queries
    if (ctx.callbackQuery) {
      const action = ctx.callbackQuery.data;

      try {
        await ctx.answerCbQuery();

        // Cancel action
        if (action === 'cancel_scene') {
          logger.info('choose_tier_cancelled', { userId: ctx.from.id });
          await ctx.scene.leave();
          return;
        }

        // Free Trial selection - gives MAX tier for 7 days
        if (action === 'tier_trial') {
          logger.info('tier_trial_selected', { userId: ctx.from.id });
          await ctx.scene.leave();
          await ctx.scene.enter('createShop', { trial: true, tier: 'max' });
          return;
        }

        // Tier selection
        if (action === 'tier_select:pro' || action === 'tier_select:max') {
          const tier = action.replace('tier_select:', '');
          ctx.wizard.state.selectedTier = tier;

          logger.info('tier_selected', {
            userId: ctx.from.id,
            tier,
          });

          // Get price from wizard state (fetched in step 1)
          const pricing = ctx.wizard.state.pricing || { pro: 25, max: 35 };
          const tierPrice = `$${pricing[tier] || (tier === 'max' ? 35 : 25)}`;
          const tierName = tier.toUpperCase();
          const message = `Вы выбрали ${tierName} (${tierPrice}/мес)\n\nДля создания магазина необходимо оплатить подписку.`;

          await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💳 Оплатить подписку', `pay_tier:${tier}`)],
              [Markup.button.callback(buttonText.back, 'choose_tier:back')],
            ]),
          });

          return;
        }

        // Payment flow - create pending subscription first
        if (action.startsWith('pay_tier:')) {
          const tier = action.replace('pay_tier:', '');

          logger.info('tier_payment_initiated', {
            userId: ctx.from.id,
            tier,
          });

          await ctx.answerCbQuery();

          try {
            // Show loading
            await ctx.editMessageText('⏳ Создаём подписку...', { parse_mode: 'HTML' });

            // Import API
            const { subscriptionApi } = await import('../utils/api.js');
            const token = ctx.session.token;

            if (!token) {
              throw new Error('No auth token');
            }

            // Create pending subscription
            const pendingData = await subscriptionApi.createPending(tier, token);

            logger.info('pending_subscription_created', {
              userId: ctx.from.id,
              subscriptionId: pendingData.subscriptionId,
              tier: pendingData.tier,
            });

            // Leave chooseTier and enter pay_subscription with subscriptionId
            await ctx.scene.leave();
            await ctx.scene.enter('pay_subscription', {
              tier,
              subscriptionId: pendingData.subscriptionId,
              createShopAfter: true,
            });
            return;
          } catch (error) {
            logger.error('Failed to create pending subscription:', {
              error: error.message,
              response: error.response?.data,
              status: error.response?.status,
              stack: error.stack,
              userId: ctx.from.id,
              tier,
            });

            // Show detailed error to user
            const errorDetails = error.response?.data?.error || error.message || 'Unknown error';
            const errorMessage = `❌ Ошибка при создании подписки:\n\n${errorDetails}\n\nПопробуйте снова.`;

            await ctx.editMessageText(errorMessage, {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback(buttonText.back, 'choose_tier:back')],
              ]),
            });
            return;
          }
        }

        // Back to tier selection
        if (action === 'choose_tier:back') {
          await ctx.answerCbQuery();
          // Re-enter scene to properly re-render step 0
          await ctx.scene.reenter();
          return;
        }

        // Promo code flow
        if (action === 'tier_promo') {
          logger.info('choose_tier_step:promo', { userId: ctx.from.id });

          await ctx.editMessageText(subMessages.promoPrompt, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback(buttonText.back, 'tier_back')]]),
          });

          return ctx.wizard.next();
        }

        // Back to tier selection (from promo)
        if (action === 'tier_back') {
          await ctx.answerCbQuery();
          await ctx.scene.reenter();
          return;
        }
      } catch (error) {
        logger.error('Error in chooseTier callback handler:', error);
        await cleanReply(ctx, subMessages.unknownCommand);
        return ctx.scene.leave();
      }
    }
  },

  // Step 3: Handle promo code input
  async (ctx) => {
    // Handle back button
    if (ctx.callbackQuery?.data === 'tier_back') {
      await ctx.answerCbQuery();
      // Re-enter scene to properly re-render step 0
      await ctx.scene.reenter();
      return;
    }

    // Wait for text message with promo code
    if (!ctx.message?.text) {
      await cleanReply(ctx, 'Пожалуйста, отправьте промокод текстом.\n\n' + subMessages.promoTextPrompt);
      return;
    }

    const promoCode = ctx.message.text.trim();

    // Track user message for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    // Basic validation
    if (promoCode.length < 3) {
      await cleanReply(ctx, subMessages.promoInvalid);
      return;
    }

    logger.info('promo_entered', {
      userId: ctx.from.id,
      promoCode,
    });

    // Store promo code in wizard state
    ctx.wizard.state.promoCode = promoCode;

    // Transition to createShop scene with promo code
    await ctx.scene.leave();

    // Enter createShop scene with promo code - promo determines tier
    await ctx.scene.enter('createShop', { promoCode });
  }
);

// Leave handler
chooseTierScene.leave(async (ctx) => {
  // Delete user messages (promo code input)
  const userMsgIds = ctx.wizard?.state?.userMessageIds || [];
  for (const msgId of userMsgIds) {
    try {
      await ctx.deleteMessage(msgId);
    } catch (error) {
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

  logger.info(`User ${ctx.from?.id} left chooseTier scene`);
});

// Handle cancel action within scene
chooseTierScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('choose_tier_cancelled', { userId: ctx.from.id });

    await ctx.scene.leave();

    // Don't send additional message - just leave and let handler take over
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
  }
});

export default chooseTierScene;
