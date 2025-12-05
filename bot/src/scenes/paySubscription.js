/**
 * Pay Subscription Scene
 *
 * Multi-step wizard for paying monthly shop subscription via CrystalPay
 *
 * Steps:
 * 1. Show pricing and select tier (pro or max)
 * 2. Select payment method (BTC or LTC)
 * 3. Create CrystalPay invoice via Backend API
 * 4. Show payment link button + check payment button
 * 5. Wait for webhook or manual status check
 */

import { Scenes, Markup } from 'telegraf';
import { subscriptionApi, shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply, replyHTML as cleanReplyHTML } from '../utils/cleanReply.js';
import { getMessages } from '../texts/messages.js';
import { showSellerMainMenu } from '../utils/sellerNavigation.js';
import { t } from '../i18n/index.js';

// CrystalPay payment methods
const PAYMENT_METHODS = {
  BTC: 'BITCOIN',
  LTC: 'LITECOIN',
};

const PAYMENT_METHOD_LABELS = {
  BTC: '₿ Bitcoin',
  LTC: 'Ł Litecoin',
};

const paySubscriptionScene = new Scenes.WizardScene(
  'pay_subscription',

  // Step 1: Show pricing and tier selection
  async (ctx) => {
    try {
      const lang = ctx.lang || ctx.session?.language || 'ru';
      const { general: generalMessages, subscription: subMessages } = getMessages(lang);

      // Check if tier was passed on scene entry (from chooseTier scene)
      const enteredWithTier = ctx.scene.state?.tier;
      const createShopAfter = ctx.scene.state?.createShopAfter;

      // FIRST SUBSCRIPTION MODE: User creating first shop (subscriptionId created by chooseTier)
      if (enteredWithTier) {
        const subscriptionId = ctx.scene.state?.subscriptionId;

        if (!subscriptionId) {
          logger.error('[PaySubscription] Missing subscriptionId!', {
            userId: ctx.from.id,
            sceneState: ctx.scene.state,
          });

          await cleanReply(ctx, t('subscription.invoiceError', {}, lang));
          return ctx.scene.leave();
        }

        logger.info(
          `[PaySubscription] Entered with tier: ${enteredWithTier}, subscriptionId: ${subscriptionId}`
        );

        // Save to wizard state
        ctx.wizard.state.tier = enteredWithTier;
        ctx.wizard.state.subscriptionId = subscriptionId;
        ctx.wizard.state.createShopAfter = createShopAfter;

        // Skip to crypto selection (Step 3)
        const tierLabel = enteredWithTier === 'max' ? 'MAX' : 'PRO';
        const message = `${t('paySubscription.subscriptionLabel', {}, lang)} <b>${tierLabel}</b>\n\n${t('paySubscription.selectPaymentMethod', {}, lang)}`;

        await cleanReplyHTML(
          ctx,
          message,
          Markup.inlineKeyboard([
            [Markup.button.callback('Bitcoin (BTC)', 'subscription:method:BTC')],
            [Markup.button.callback('Litecoin (LTC)', 'subscription:method:LTC')],
            [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
          ])
        );

        return ctx.wizard.selectStep(2);
      }

      // RENEWAL MODE: Existing shop renewing subscription
      const shopId = ctx.session.shopId;

      if (!shopId) {
        await smartMessage.send(ctx, { text: generalMessages.shopRequired(lang) });
        return ctx.scene.leave();
      }

      // Get current subscription status
      const token = ctx.session.token;
      if (!token) {
        await smartMessage.send(ctx, { text: generalMessages.authorizationRequired(lang) });
        return ctx.scene.leave();
      }

      const statusResponse = await subscriptionApi.getStatus(shopId, token);
      const shopName = ctx.session.shopName || t('general.shopFallbackName', {}, lang);

      const message = [
        subMessages.chooseTierIntro(lang),
        subMessages.tierDescriptionPro(lang),
        subMessages.tierDescriptionMax(lang),
      ].join('\n\n');

      await cleanReplyHTML(
        ctx,
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.tierPro', {}, lang), 'subscription:tier:pro')],
          [Markup.button.callback(t('buttons.tierMax', {}, lang), 'subscription:tier:max')],
          [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
        ])
      );

      // Save shop info and subscription ID for next steps
      // Use currentSubscription if active, or latestSubscription for renewal of expired subscription
      ctx.wizard.state.shopId = shopId;
      ctx.wizard.state.shopName = shopName;
      ctx.wizard.state.subscriptionId = statusResponse.currentSubscription?.id || statusResponse.latestSubscription?.id;

      if (!ctx.session.shopName) {
        ctx.session.shopName = shopName;
      }

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[PaySubscription] Step 1 error:', error);

      const langErr = ctx.lang || ctx.session?.language || 'ru';
      const errorMsg = error.response?.data?.error || error.message;
      await cleanReply(
        ctx,
        t('general.errorWithReason', { reason: errorMsg }, langErr),
        Markup.inlineKeyboard([[Markup.button.callback(t('buttons.backToMenu', {}, langErr), 'seller:menu')]])
      );

      return ctx.scene.leave();
    }
  },

  // Step 2: Handle tier selection and show crypto options
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { subscription: subMessages } = getMessages(lang);

    if (!ctx.callbackQuery) {
      await ctx.reply(t('subscription.selectTierPrompt', {}, lang));
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(subMessages.cancelled(lang));
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    if (!data.startsWith('subscription:tier:')) {
      await ctx.answerCbQuery(subMessages.unknownCommand(lang), { show_alert: true });
      return;
    }

    const tier = data.replace('subscription:tier:', '');
    if (tier !== 'pro' && tier !== 'max') {
      await ctx.answerCbQuery(subMessages.invalidTier(lang));
      return;
    }

    await ctx.answerCbQuery();

    ctx.wizard.state.tier = tier;

    // For renewal: if no subscriptionId, create pending subscription
    // This happens for Trial shops that have no shop_subscriptions record
    if (!ctx.wizard.state.subscriptionId) {
      try {
        await ctx.editMessageText(t('subscription.creating', {}, lang), { parse_mode: 'HTML' });

        const token = ctx.session.token;
        if (!token) {
          throw new Error('No auth token');
        }

        // Pass shopId for trial-to-paid conversion (links subscription to existing shop)
        const shopId = ctx.wizard.state.shopId || ctx.session.shopId;
        const pendingData = await subscriptionApi.createPending(tier, token, shopId);
        ctx.wizard.state.subscriptionId = pendingData.subscriptionId;

        logger.info('[PaySubscription] Created pending subscription for renewal', {
          userId: ctx.from.id,
          subscriptionId: pendingData.subscriptionId,
          tier,
        });
      } catch (error) {
        logger.error('[PaySubscription] Failed to create pending subscription:', error);
        await ctx.editMessageText(t('subscription.pendingCreationError', { error: error.message }, lang), {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back', {}, lang), 'subscription:back')]]),
        });
        return;
      }
    }

    const tierLabel = tier === 'max' ? 'MAX' : 'PRO';
    const message = `${t('paySubscription.subscriptionLabel', {}, lang)} <b>${tierLabel}</b>\n\n${t('paySubscription.selectPaymentMethod', {}, lang)}`;

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Bitcoin (BTC)', 'subscription:method:BTC')],
        [Markup.button.callback('Litecoin (LTC)', 'subscription:method:LTC')],
        [Markup.button.callback(t('buttons.back', {}, lang), 'subscription:back')],
      ]),
    });

    return ctx.wizard.next();
  },

  // Step 3: Handle payment method selection and create CrystalPay invoice
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMessages, subscription: subMessages } = getMessages(lang);

    if (!ctx.callbackQuery) {
      await ctx.reply(t('subscription.selectPaymentPrompt', {}, lang));
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle back
    if (data === 'subscription:back') {
      await ctx.answerCbQuery();
      return ctx.wizard.back();
    }

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(subMessages.cancelled(lang));
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    // Parse payment method selection
    if (!data.startsWith('subscription:method:')) {
      await ctx.answerCbQuery(generalMessages.invalidChoice(lang));
      return;
    }

    const methodKey = data.replace('subscription:method:', '');
    if (!['BTC', 'LTC'].includes(methodKey)) {
      await ctx.answerCbQuery(t('errors.invalidPaymentMethod', {}, lang));
      return;
    }

    await ctx.answerCbQuery();

    try {
      // Show loading message
      await ctx.editMessageText(t('subscription.creatingInvoice', {}, lang), { parse_mode: 'HTML' });

      const { tier, subscriptionId, createShopAfter } = ctx.wizard.state;
      const token = ctx.session.token;

      // Check auth token before API call
      if (!token) {
        logger.error('[PaySubscription] No auth token in Step 3', {
          userId: ctx.from.id,
          subscriptionId,
        });
        await ctx.editMessageText(generalMessages.authorizationRequired(lang), {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
          ]),
        });
        return;
      }

      // Map to CrystalPay method format
      const paymentMethod = PAYMENT_METHODS[methodKey];

      // Determine purpose based on context
      const purpose = createShopAfter ? 'subscription_new' : 'subscription_renewal';

      // Create CrystalPay invoice via Backend API
      const invoiceResponse = await subscriptionApi.createCrystalPayInvoice(
        subscriptionId,
        paymentMethod,
        purpose,
        token
      );

      // Save invoice details to wizard state
      ctx.wizard.state.paymentMethod = paymentMethod;
      ctx.wizard.state.invoiceId = invoiceResponse.invoiceId;
      ctx.wizard.state.crystalPayId = invoiceResponse.crystalPayId;
      ctx.wizard.state.crystalPayUrl = invoiceResponse.paymentUrl;

      // Display payment method label
      const methodLabel = PAYMENT_METHOD_LABELS[methodKey];
      const tierLabel = tier === 'max' ? 'MAX' : 'PRO';

      // Prepare message
      const message = [
        `${t('paySubscription.subscriptionLabel', {}, lang)} <b>${tierLabel}</b>`,
        `${t('paySubscription.methodLabel', {}, lang)} ${methodLabel}`,
        '',
        `<i>${t('paySubscription.emailHint', {}, lang)}</i>`,
        '',
        t('paySubscription.clickToPay', {}, lang),
      ].join('\n');

      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.url(t('paySubscription.payButton', {}, lang), invoiceResponse.paymentUrl)],
          [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
        ]),
      });

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[PaySubscription] CrystalPay invoice creation error:', error);

      const errorData = error.response?.data;
      let errorMessage = t('subscription.invoiceError', {}, lang);

      if (errorData?.error) {
        errorMessage += `\n\n${errorData.error}`;
      }

      await ctx.editMessageText(errorMessage, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back', {}, lang), 'subscription:back')],
          [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
        ]),
      });

      return;
    }
  },

  // Step 4: Handle payment status check via CrystalPay
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMessages, subscription: subMessages } = getMessages(lang);

    if (!ctx.callbackQuery) {
      await ctx.reply(t('subscription.checkStatusPrompt', {}, lang));
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(subMessages.cancelled(lang));
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    // Handle check payment status
    if (data === 'subscription:check_payment') {
      // Answer callback immediately, ignore timeout errors
      try {
        await ctx.answerCbQuery(t('subscription.checkingStatus', {}, lang));
      } catch (cbError) {
        // Ignore "query is too old" or timeout errors
        if (!cbError.message?.includes('query is too old')) {
          throw cbError;
        }
      }

      try {
        const { invoiceId, tier, createShopAfter, subscriptionId, crystalPayUrl, paymentMethod } = ctx.wizard.state;
        const token = ctx.session.token;

        // Check auth token before API call
        if (!token) {
          logger.error('[PaySubscription] No auth token in Step 4', {
            userId: ctx.from.id,
            invoiceId,
          });
          await ctx.editMessageText(generalMessages.authorizationRequired(lang), {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
            ]),
          });
          return;
        }

        // Check invoice status via backend
        const statusResponse = await subscriptionApi.getInvoiceStatus(invoiceId, token);
        const status = statusResponse.status;

        logger.info(`[PaySubscription] Invoice ${invoiceId} status: ${status}`);

        // SUCCESS FLOW
        if (status === 'paid' || status === 'confirmed') {
          // Check if user already has a shop (for renewal vs new)
          let hasShop = Boolean(ctx.session.shopId);
          if (!hasShop && token) {
            try {
              const myShops = await shopApi.getMyShop(token);
              if (Array.isArray(myShops) && myShops.length > 0) {
                hasShop = true;
                ctx.session.shopId = myShops[0].id;
              }
            } catch { /* Intentionally ignored */ }
          }

          // If new shop creation flow
          if (createShopAfter && !hasShop) {
            await ctx.editMessageText(
              `${t('paySubscription.paymentReceived', {}, lang)}\n\n${t('paySubscription.enterShopName', {}, lang)}`,
              { parse_mode: 'HTML' }
            );

            const transitionData = {
              tier,
              subscriptionId,
              paidSubscription: true, // Flag to skip payment check
            };
            // Clear wizard state before scene transition
            ctx.wizard.state = {};
            // NOTE: Do NOT call ctx.scene.leave() before enter() - Telegraf does it automatically
            return ctx.scene.enter('createShop', transitionData);
          }

          // Renewal / Existing Shop Flow
          await ctx.editMessageText(t('subscription.renewedSuccessfully', {}, lang), {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback(t('buttons.mainMenu', {}, lang), 'seller:menu')]]),
          });

          await ctx.scene.leave();
          return;
        }

        // EXPIRED FLOW
        if (status === 'expired') {
          await ctx.editMessageText(
            `${t('paySubscription.timeExpired', {}, lang)}\n\n${t('paySubscription.selectMethodAgain', {}, lang)}`,
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('Bitcoin (BTC)', 'subscription:method:BTC')],
                [Markup.button.callback('Litecoin (LTC)', 'subscription:method:LTC')],
                [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
              ]),
            }
          );
          return ctx.wizard.selectStep(2);
        }

        // PENDING FLOW - still waiting for payment
        const methodLabel = PAYMENT_METHOD_LABELS[
          Object.keys(PAYMENT_METHODS).find(k => PAYMENT_METHODS[k] === paymentMethod) || 'BTC'
        ];
        const tierLabel = tier === 'max' ? 'MAX' : 'PRO';

        await ctx.editMessageText(
          [
            `${t('paySubscription.subscriptionLabel', {}, lang)} <b>${tierLabel}</b>`,
            `${t('paySubscription.methodLabel', {}, lang)} ${methodLabel}`,
            '',
            `<b>${t('paySubscription.paymentNotReceived', {}, lang)}</b>`,
            '',
            t('paySubscription.clickToPay', {}, lang),
          ].join('\n'),
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.url(t('paySubscription.payButton', {}, lang), crystalPayUrl)],
              [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
            ]),
          }
        );

        return;
      } catch (error) {
        logger.error('[PaySubscription] Status check error:', error);

        await ctx.editMessageText(
          t('subscription.paymentStatusError', {}, lang),
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
            ]),
          }
        );
        return;
      }
    }

    // Handle retry (go back to payment method selection)
    if (data === 'subscription:retry') {
      await ctx.answerCbQuery();
      return ctx.wizard.selectStep(2);
    }
  }
);

// Leave handler
paySubscriptionScene.leave(async (ctx) => {
  // P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  // NOTE: Do NOT clear ctx.scene.state or ctx.session.__scenes here!
  // This breaks scene transitions (e.g., paySubscription -> createShop)
  // Telegraf manages __scenes internally during enter/leave

  logger.info('[PaySubscription] Scene left');
});

// Handle cancel button - prevents users from getting stuck in scene
paySubscriptionScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('[PaySubscription] Cancelled via cancel_scene', { userId: ctx.from.id });
    await ctx.scene.leave();
    await showSellerMainMenu(ctx);
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
paySubscriptionScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('[PaySubscription] Cancelled via cancel', { userId: ctx.from.id });
    await ctx.scene.leave();
    await showSellerMainMenu(ctx);
  } catch (error) {
    logger.error('Error in cancel handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

export default paySubscriptionScene;
