/**
 * Pay Subscription Scene
 *
 * Multi-step wizard for paying monthly shop subscription via CrystalPay
 *
 * Steps:
 * 1. Show pricing and select tier (basic or pro)
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
import { messages, buttons as buttonText } from '../texts/messages.js';
import { showSellerMainMenu } from '../utils/sellerNavigation.js';

const { general: generalMessages, subscription: subMessages } = messages;

const BASIC_PRICE_RUB = 990;
const PRO_PRICE_RUB = 1490;

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

          await cleanReply(ctx, '❌ Ошибка: не удалось создать подписку. Попробуйте снова.');
          return ctx.scene.leave();
        }

        logger.info(
          `[PaySubscription] Entered with tier: ${enteredWithTier}, subscriptionId: ${subscriptionId}`
        );

        // Save to wizard state
        ctx.wizard.state.tier = enteredWithTier;
        ctx.wizard.state.subscriptionId = subscriptionId;
        ctx.wizard.state.createShopAfter = createShopAfter;
        const amount = enteredWithTier === 'pro' ? PRO_PRICE_RUB : BASIC_PRICE_RUB;
        ctx.wizard.state.amount = amount;

        // Skip to crypto selection (Step 3)
        const message = `📦 <b>Подписка:</b> ${enteredWithTier === 'pro' ? 'Pro' : 'Basic'}
💰 <b>Стоимость:</b> ${amount} ₽

Выберите способ оплаты:`;

        await cleanReplyHTML(
          ctx,
          message,
          Markup.inlineKeyboard([
            [Markup.button.callback('₿ Bitcoin (BTC)', 'subscription:method:BTC')],
            [Markup.button.callback('Ł Litecoin (LTC)', 'subscription:method:LTC')],
            [Markup.button.callback(buttonText.cancel, 'seller:menu')],
          ])
        );

        return ctx.wizard.selectStep(2);
      }

      // RENEWAL MODE: Existing shop renewing subscription
      const shopId = ctx.session.shopId;

      if (!shopId) {
        await smartMessage.send(ctx, { text: generalMessages.shopRequired });
        return ctx.scene.leave();
      }

      // Get current subscription status
      const token = ctx.session.token;
      if (!token) {
        await smartMessage.send(ctx, { text: generalMessages.authorizationRequired });
        return ctx.scene.leave();
      }

      const statusResponse = await subscriptionApi.getStatus(shopId, token);
      const shopName = ctx.session.shopName || 'Магазин';

      const message = [
        subMessages.chooseTierIntro,
        subMessages.tierDescriptionBasic,
        subMessages.tierDescriptionPro,
      ].join('\n\n');

      await cleanReplyHTML(
        ctx,
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback(buttonText.tierBasic, 'subscription:tier:basic')],
          [Markup.button.callback(buttonText.tierPro, 'subscription:tier:pro')],
          [Markup.button.callback(buttonText.cancel, 'seller:menu')],
        ])
      );

      // Save shop info and subscription ID for next steps
      ctx.wizard.state.shopId = shopId;
      ctx.wizard.state.shopName = shopName;
      ctx.wizard.state.subscriptionId = statusResponse.currentSubscription?.id;

      if (!ctx.session.shopName) {
        ctx.session.shopName = shopName;
      }

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[PaySubscription] Step 1 error:', error);

      const errorMsg = error.response?.data?.error || error.message;
      await cleanReply(
        ctx,
        `❌ Ошибка: ${errorMsg}`,
        Markup.inlineKeyboard([[Markup.button.callback(buttonText.backToMenu, 'seller:menu')]])
      );

      return ctx.scene.leave();
    }
  },

  // Step 2: Handle tier selection and show crypto options
  async (ctx) => {
    if (!ctx.callbackQuery) {
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(subMessages.cancelled);
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    if (!data.startsWith('subscription:tier:')) {
      await ctx.answerCbQuery(subMessages.unknownCommand, { show_alert: true });
      return;
    }

    const tier = data.replace('subscription:tier:', '');
    if (tier !== 'basic' && tier !== 'pro') {
      await ctx.answerCbQuery(subMessages.invalidTier);
      return;
    }

    await ctx.answerCbQuery();

    const amount = tier === 'pro' ? PRO_PRICE_RUB : BASIC_PRICE_RUB;
    ctx.wizard.state.tier = tier;
    ctx.wizard.state.amount = amount;

    const message = `📦 <b>Подписка:</b> ${tier === 'pro' ? 'Pro' : 'Basic'}
💰 <b>Стоимость:</b> ${amount} ₽

Выберите способ оплаты:`;

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('₿ Bitcoin (BTC)', 'subscription:method:BTC')],
        [Markup.button.callback('Ł Litecoin (LTC)', 'subscription:method:LTC')],
        [Markup.button.callback(buttonText.back, 'subscription:back')],
      ]),
    });

    return ctx.wizard.next();
  },

  // Step 3: Handle payment method selection and create CrystalPay invoice
  async (ctx) => {
    if (!ctx.callbackQuery) {
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
      await ctx.answerCbQuery(subMessages.cancelled);
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    // Parse payment method selection
    if (!data.startsWith('subscription:method:')) {
      await ctx.answerCbQuery(generalMessages.invalidChoice);
      return;
    }

    const methodKey = data.replace('subscription:method:', '');
    if (!['BTC', 'LTC'].includes(methodKey)) {
      await ctx.answerCbQuery('Неверный метод оплаты');
      return;
    }

    await ctx.answerCbQuery();

    try {
      // Show loading message
      await ctx.editMessageText('⏳ Создаём счёт на оплату...', { parse_mode: 'HTML' });

      const { tier, amount, subscriptionId, createShopAfter } = ctx.wizard.state;
      const token = ctx.session.token;

      // Check auth token before API call
      if (!token) {
        logger.error('[PaySubscription] No auth token in Step 3', {
          userId: ctx.from.id,
          subscriptionId,
        });
        await ctx.editMessageText(generalMessages.authorizationRequired, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback(buttonText.cancel, 'seller:menu')],
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

      // Prepare message
      const message = [
        `📦 <b>Подписка:</b> ${tier === 'pro' ? 'Pro' : 'Basic'}`,
        `💰 <b>Стоимость:</b> ${amount} ₽`,
        `💳 <b>Метод:</b> ${methodLabel}`,
        '',
        '💡 <i>Поле "Email" — вводите что угодно, нам не нужен</i>',
        '',
        'Нажмите кнопку для оплаты:',
      ].join('\n');

      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.url('💳 Оплатить', invoiceResponse.paymentUrl)],
          [Markup.button.callback('🔄 Проверить оплату', 'subscription:check_payment')],
          [Markup.button.callback(buttonText.cancel, 'seller:menu')],
        ]),
      });

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[PaySubscription] CrystalPay invoice creation error:', error);

      const errorData = error.response?.data;
      let errorMessage = '❌ Не удалось создать счёт на оплату.';

      if (errorData?.error) {
        errorMessage += `\n\n${errorData.error}`;
      }

      await ctx.editMessageText(errorMessage, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(buttonText.back, 'subscription:back')],
          [Markup.button.callback(buttonText.cancel, 'seller:menu')],
        ]),
      });

      return;
    }
  },

  // Step 4: Handle payment status check via CrystalPay
  async (ctx) => {
    if (!ctx.callbackQuery) {
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(subMessages.cancelled);
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    // Handle check payment status
    if (data === 'subscription:check_payment') {
      await ctx.answerCbQuery('Проверяем статус оплаты...');

      try {
        const { invoiceId, tier, createShopAfter, subscriptionId, crystalPayUrl, amount, paymentMethod } = ctx.wizard.state;
        const token = ctx.session.token;

        // Check auth token before API call
        if (!token) {
          logger.error('[PaySubscription] No auth token in Step 4', {
            userId: ctx.from.id,
            invoiceId,
          });
          await ctx.editMessageText(generalMessages.authorizationRequired, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(buttonText.cancel, 'seller:menu')],
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
              '✅ Оплата получена! Магазин оплачен.\n\n📝 Введите название для вашего магазина:',
              { parse_mode: 'HTML' }
            );

            const transitionData = {
              tier,
              subscriptionId,
              paidSubscription: true, // Flag to skip payment check
            };
            // Clear wizard state before leaving
            ctx.wizard.state = {};
            await ctx.scene.leave();
            return ctx.scene.enter('createShop', transitionData);
          }

          // Renewal / Existing Shop Flow
          await ctx.editMessageText('✅ Подписка успешно продлена!', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback(buttonText.mainMenu, 'seller:menu')]]),
          });

          await ctx.scene.leave();
          return;
        }

        // EXPIRED FLOW
        if (status === 'expired') {
          await ctx.editMessageText(
            '❌ Время на оплату истекло.\n\nВыберите метод оплаты заново:',
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('₿ Bitcoin (BTC)', 'subscription:method:BTC')],
                [Markup.button.callback('Ł Litecoin (LTC)', 'subscription:method:LTC')],
                [Markup.button.callback(buttonText.cancel, 'seller:menu')],
              ]),
            }
          );
          return ctx.wizard.selectStep(2);
        }

        // PENDING FLOW - still waiting for payment
        const methodLabel = PAYMENT_METHOD_LABELS[
          Object.keys(PAYMENT_METHODS).find(k => PAYMENT_METHODS[k] === paymentMethod) || 'BTC'
        ];

        await ctx.editMessageText(
          [
            `📦 <b>Подписка:</b> ${tier === 'pro' ? 'Pro' : 'Basic'}`,
            `💰 <b>Стоимость:</b> ${amount} ₽`,
            `💳 <b>Метод:</b> ${methodLabel}`,
            '',
            '⏳ <b>Оплата пока не получена.</b>',
            '',
            'Нажмите кнопку для оплаты или проверьте статус позже:',
          ].join('\n'),
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.url('💳 Оплатить', crystalPayUrl)],
              [Markup.button.callback('🔄 Проверить оплату', 'subscription:check_payment')],
              [Markup.button.callback(buttonText.cancel, 'seller:menu')],
            ]),
          }
        );

        return;
      } catch (error) {
        logger.error('[PaySubscription] Status check error:', error);

        await ctx.editMessageText(
          '❌ Не удалось проверить статус оплаты. Попробуйте позже.',
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Проверить снова', 'subscription:check_payment')],
              [Markup.button.callback(buttonText.cancel, 'seller:menu')],
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
  // ✅ P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};
  logger.info('[PaySubscription] Scene left');
});

export default paySubscriptionScene;
