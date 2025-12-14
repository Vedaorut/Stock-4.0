/**
 * Upgrade Shop Scene
 *
 * Multi-step wizard for upgrading from PRO to MAX tier via CrystalPay
 *
 * Steps:
 * 1. Show current subscription and upgrade cost (prorated)
 * 2. Confirm upgrade
 * 3. Select payment method (BTC or LTC)
 * 4. Show CrystalPay payment link
 * 5. Wait for webhook confirmation (automatic)
 */

import { Scenes, Markup } from 'telegraf';
import api, { subscriptionApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply, replyHTML as cleanReplyHTML } from '../utils/cleanReply.js';
import { getMessages } from '../texts/messages.js';
import { showSellerMainMenu } from '../utils/sellerNavigation.js';
import { t } from '../i18n/index.js';

// CrystalPay payment methods (same as paySubscription)
const PAYMENT_METHODS = {
  BTC: 'BITCOIN',
  LTC: 'LITECOIN',
};

const PAYMENT_METHOD_LABELS = {
  BTC: '₿ Bitcoin',
  LTC: 'Ł Litecoin',
};

const upgradeShopScene = new Scenes.WizardScene(
  'upgrade_shop',

  // Step 1: Show current subscription and upgrade cost
  async (ctx) => {
    try {
      const lang = ctx.lang || ctx.session?.language || 'ru';
      const { seller: sellerMessages, general: generalMessages } = getMessages(lang);

      const shopId = ctx.session.shopId;

      if (!shopId) {
        await smartMessage.send(ctx, { text: ctx.t('general.shopNotFound') });
        return ctx.scene.leave();
      }

      const token = ctx.session.token;
      if (!token) {
        await smartMessage.send(ctx, { text: generalMessages.authorizationRequired(lang) });
        return ctx.scene.leave();
      }

      // Get current subscription status
      const statusResponse = await subscriptionApi.getStatus(shopId, token);
      const currentSubscription = statusResponse.currentSubscription;
      const shopTier = statusResponse.tier;

      // Check if already MAX
      if (shopTier === 'max' || currentSubscription?.tier === 'max') {
        await cleanReply(
          ctx,
          sellerMessages.upgrade.alreadyMax(lang),
          Markup.inlineKeyboard([[Markup.button.callback(t('buttons.backToMenu', {}, lang), 'seller:menu')]])
        );
        return ctx.scene.leave();
      }

      // Check if has active PRO subscription
      if (
        !currentSubscription ||
        currentSubscription.tier !== 'pro' ||
        currentSubscription.status !== 'active'
      ) {
        await cleanReply(
          ctx,
          sellerMessages.upgrade.notEligible(lang),
          Markup.inlineKeyboard([
            [Markup.button.callback(t('buttons.paySubscription', {}, lang), 'subscription:pay')],
            [Markup.button.callback(t('buttons.backToMenu', {}, lang), 'seller:menu')],
          ])
        );
        return ctx.scene.leave();
      }

      // Get upgrade cost
      const costResponse = await api.get(`/subscriptions/upgrade-cost/${shopId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { amount: upgradeCost, remainingDays } = costResponse.data;
      if (typeof upgradeCost !== 'number' || Number.isNaN(upgradeCost)) {
        throw new Error('Upgrade cost unavailable');
      }

      const message = `${t('upgradeShop.upgradeToMax', {}, lang)}

${t('upgradeShop.currentTier', {}, lang)}
${t('upgradeShop.upgradeCost', { cost: upgradeCost.toFixed(2) }, lang)}

${t('upgradeShop.youWillGet', {}, lang)}
${t('upgradeShop.benefitUnlimited', {}, lang)}
${t('upgradeShop.benefitWorkers', {}, lang)}
${t('upgradeShop.benefitMigration', {}, lang)}
${t('upgradeShop.benefitAnalytics', {}, lang)}`;

      await cleanReplyHTML(
        ctx,
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.confirm', {}, lang), 'upgrade:confirm')],
          [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
        ])
      );

      // Save data for next steps
      ctx.wizard.state.shopId = shopId;
      ctx.wizard.state.subscriptionId = currentSubscription?.id;
      ctx.wizard.state.shopName = ctx.session.shopName || ctx.t('general.shopFallbackName');
      if (!ctx.wizard.state.subscriptionId) {
        await cleanReply(
          ctx,
          sellerMessages.upgrade.error(ctx.t('upgradeShop.subscriptionNotFound')),
          Markup.inlineKeyboard([[Markup.button.callback(t('buttons.backToMenu', {}, lang), 'seller:menu')]])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.upgradeCost = upgradeCost;
      ctx.wizard.state.remainingDays = remainingDays;

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[UpgradeShop] Step 1 error:', error);

      const langErr = ctx.lang || ctx.session?.language || 'ru';
      const { seller: sellerMsgs } = getMessages(langErr);
      const errorMsg = error.response?.data?.error || error.message;
      await cleanReply(
        ctx,
        sellerMsgs.upgrade.error(errorMsg),
        Markup.inlineKeyboard([[Markup.button.callback(t('buttons.backToMenu', {}, langErr), 'seller:menu')]])
      );

      return ctx.scene.leave();
    }
  },

  // Step 2: Handle confirmation and show payment method selection
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    try {
      const { seller: sellerMessages, general: generalMessages } = getMessages(lang);

      if (!ctx.callbackQuery) {
        await ctx.reply(ctx.t('general.useButtons'));
        return;
      }

      const data = ctx.callbackQuery.data;

      // Handle cancel
      if (data === 'seller:menu') {
        await ctx.answerCbQuery(sellerMessages.upgrade.cancelled(lang));
        await ctx.scene.leave();
        await showSellerMainMenu(ctx);
        return;
      }

      if (data !== 'upgrade:confirm') {
        await ctx.answerCbQuery(generalMessages.invalidChoice(lang));
        return;
      }

      await ctx.answerCbQuery();

      const { upgradeCost } = ctx.wizard.state;

      const message = `💳 <b>${t('upgradeShop.selectPaymentMethod', {}, lang)}</b>

${t('upgradeShop.upgradeCost', { cost: upgradeCost.toFixed(2) }, lang)}

${t('paySubscription.selectPaymentMethod', {}, lang)}`;

      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Bitcoin (BTC)', 'upgrade:method:BTC')],
          [Markup.button.callback('Litecoin (LTC)', 'upgrade:method:LTC')],
          [Markup.button.callback(t('buttons.back', {}, lang), 'upgrade:back')],
          [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
        ]),
      });

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[UpgradeShop] Step 2 error:', error);
      try { await ctx.answerCbQuery?.(); } catch { /* ignore */ }
      await ctx.reply(t('general.actionFailed', {}, lang) || 'An error occurred');
      return ctx.scene.leave();
    }
  },

  // Step 3: Handle payment method selection and create CrystalPay invoice
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    try {
      const { seller: sellerMessages, general: generalMessages } = getMessages(lang);

      if (!ctx.callbackQuery) {
        await ctx.reply(t('subscription.selectPaymentPrompt', {}, lang));
        return;
      }

      const data = ctx.callbackQuery.data;

      // Handle back
      if (data === 'upgrade:back') {
        await ctx.answerCbQuery();
        return await ctx.wizard.back();
      }

      // Handle cancel
      if (data === 'seller:menu') {
        await ctx.answerCbQuery(sellerMessages.upgrade.cancelled(lang));
        await ctx.scene.leave();
        await showSellerMainMenu(ctx);
        return;
      }

      // Parse payment method selection
      if (!data.startsWith('upgrade:method:')) {
        await ctx.answerCbQuery(generalMessages.invalidChoice(lang));
        return;
      }

      const methodKey = data.replace('upgrade:method:', '');
      if (!['BTC', 'LTC'].includes(methodKey)) {
        await ctx.answerCbQuery(t('errors.invalidPaymentMethod', {}, lang));
        return;
      }

      await ctx.answerCbQuery();

      try {
        // Show loading message
        await ctx.editMessageText(t('subscription.creatingInvoice', {}, lang), { parse_mode: 'HTML' });

        const { subscriptionId, upgradeCost } = ctx.wizard.state;
        const token = ctx.session.token;

        // Check auth token before API call
        if (!token) {
          logger.error('[UpgradeShop] No auth token in Step 3', {
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

        // Create CrystalPay invoice via Backend API
        const invoiceResponse = await subscriptionApi.createCrystalPayInvoice(
          subscriptionId,
          paymentMethod,
          'subscription_upgrade',
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
          `👑 <b>${t('upgradeShop.upgradeToMax', {}, lang)}</b>`,
          `${t('paySubscription.methodLabel', {}, lang)} ${methodLabel}`,
          `${t('upgradeShop.upgradeCost', { cost: upgradeCost.toFixed(2) }, lang)}`,
          '',
          `<i>${t('paySubscription.emailHint', {}, lang)}</i>`,
          '',
          t('paySubscription.clickToPay', {}, lang),
          '',
          `✅ ${t('paySubscription.autoActivationNotice', {}, lang)}`,
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
        logger.error('[UpgradeShop] CrystalPay invoice creation error:', error);

        const errorData = error.response?.data;
        let errorMessage = t('subscription.invoiceError', {}, lang);

        if (errorData?.error) {
          errorMessage += `\n\n${errorData.error}`;
        }

        await ctx.editMessageText(errorMessage, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback(t('buttons.back', {}, lang), 'upgrade:back')],
            [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
          ]),
        });

        return;
      }
    } catch (error) {
      logger.error('[UpgradeShop] Step 3 error:', error);
      try { await ctx.answerCbQuery?.(); } catch { /* ignore */ }
      await ctx.reply(t('general.actionFailed', {}, lang) || 'An error occurred');
      return ctx.scene.leave();
    }
  },

  // Step 4: Wait for webhook confirmation (user just waits)
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    if (!ctx.callbackQuery) {
      await ctx.reply(t('subscription.checkStatusPrompt', {}, lang));
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(sellerMessages.upgrade.cancelled(lang));
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    // NOTE: check_payment handler removed - webhook handles payment confirmation automatically
  }
);

// Leave handler
upgradeShopScene.leave(async (ctx) => {
  // P0 FIX: Use assignment instead of delete to prevent TypeError
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  ctx.scene.state = {};

  logger.info('[UpgradeShop] Scene left');
});

// Handle cancel button - prevents users from getting stuck in scene
upgradeShopScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('[UpgradeShop] Cancelled via cancel_scene', { userId: ctx.from.id });
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
upgradeShopScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('[UpgradeShop] Cancelled via cancel', { userId: ctx.from.id });
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

export default upgradeShopScene;
