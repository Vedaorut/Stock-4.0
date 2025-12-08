/**
 * Upgrade Shop Scene
 *
 * Multi-step wizard for upgrading from PRO to MAX tier
 *
 * Steps:
 * 1. Show current subscription and upgrade cost (prorated)
 * 2. Select cryptocurrency
 * 3. Show payment address and amount
 * 4. User sends tx_hash
 * 5. Verify payment and upgrade subscription
 */

import { Scenes, Markup } from 'telegraf';
import api, { subscriptionApi, walletApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply, replyHTML as cleanReplyHTML } from '../utils/cleanReply.js';
import { getMessages } from '../texts/messages.js';
import { showSellerMainMenu } from '../utils/sellerNavigation.js';
import { generateQRWithTimeout } from '../utils/qrHelper.js';
import {
  normalizePaymentState,
  paymentStateKeyboard,
  paymentStateMessage,
} from '../utils/paymentUi.js';
import { t } from '../i18n/index.js';

// TX Hash validation patterns per network
const TX_HASH_PATTERNS = {
  BTC: /^[a-fA-F0-9]{64}$/,
  LTC: /^[a-fA-F0-9]{64}$/,
  ETH: /^0x[a-fA-F0-9]{64}$/,
  USDT: /^[a-fA-F0-9]{64}$/, // TRC20
};

const CHAIN_MAPPINGS = {
  BTC: 'BTC',
  LTC: 'LTC',
  ETH: 'ETH',
  USDT: 'USDT_TRC20',
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

  // Step 2: Handle confirmation and show crypto options
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

      const message = sellerMessages.upgrade.chooseCrypto(upgradeCost.toFixed(2));

      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.cryptoBTC', {}, lang), 'upgrade:crypto:BTC')],
          [Markup.button.callback(t('buttons.cryptoETH', {}, lang), 'upgrade:crypto:ETH')],
          [Markup.button.callback(t('buttons.cryptoUSDT', {}, lang), 'upgrade:crypto:USDT')],
          [Markup.button.callback(t('buttons.cryptoLTC', {}, lang), 'upgrade:crypto:LTC')],
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

  // Step 3: Handle crypto selection and generate upgrade invoice
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    try {
      const { seller: sellerMessages } = getMessages(lang);

      if (!ctx.callbackQuery) {
        await ctx.reply(ctx.t('general.selectCrypto'));
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

      // Parse crypto selection
      if (!data.startsWith('upgrade:crypto:')) {
        await ctx.answerCbQuery(sellerMessages.upgrade.unknownCommand(lang), { show_alert: true });
        return;
      }

      const currency = data.replace('upgrade:crypto:', '');
      if (!['BTC', 'ETH', 'USDT', 'LTC'].includes(currency)) {
        await ctx.answerCbQuery(sellerMessages.upgrade.unknownCommand(lang), { show_alert: true });
        return;
      }

      await ctx.answerCbQuery();

      ctx.wizard.state.currency = currency;

      try {
        await createUpgradeInvoiceAndShow(ctx, currency);
        return ctx.wizard.next();
      } catch (error) {
        logger.error('[UpgradeShop] Invoice generation error:', {
          message: error.message,
          response: error.response?.data,
        });

        const errorMsg =
          error.response?.data?.error || error.message || ctx.t('upgradeShop.invoiceErrorDefault');

        await ctx.editMessageText(sellerMessages.upgrade.error(errorMsg), {
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

  // Step 4: Handle tx_hash and verify upgrade payment
  async (ctx) => {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    let loadingMsg = null;
    try {
      const { seller: sellerMessages } = getMessages(lang);

      const { subscriptionId, currency, shopId } = ctx.wizard.state;

      if (!subscriptionId) {
        await smartMessage.send(ctx, { text: sellerMessages.upgrade.error(ctx.t('errors.noSubscriptionToUpgrade')) });
        return ctx.scene.leave();
      }

      if (ctx.callbackQuery) {
        const data = ctx.callbackQuery.data;

        if (data === 'seller:menu') {
          await ctx.answerCbQuery(sellerMessages.upgrade.cancelled(lang));
          await ctx.scene.leave();
          await showSellerMainMenu(ctx);
          return;
        }

        if (data === 'upgrade:status') {
          await ctx.answerCbQuery();
          try {
            const token = ctx.session.token;
            const paymentStatus = await subscriptionApi.getUpgradePaymentStatus(subscriptionId, token);
            const status = normalizePaymentState(paymentStatus, paymentStatus?.status);

            await cleanReplyHTML(
              ctx,
              paymentStateMessage(status, { hint: sellerMessages.upgrade.sendHashPrompt(lang) }),
              paymentStateKeyboard(status, {
                retryCb: 'upgrade:retry',
                cancelCb: 'seller:menu',
              })
            );
          } catch (error) {
            logger.error('[UpgradeShop] Status check failed:', {
              message: error.message,
              response: error.response?.data,
            });
            await cleanReplyHTML(
              ctx,
              sellerMessages.upgrade.error(ctx.t('upgradeShop.statusCheckError')),
              Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')]])
            );
          }
          return;
        }

        if (data === 'upgrade:retry') {
          await ctx.answerCbQuery();
          if (!currency) {
            await smartMessage.send(ctx, { text: sellerMessages.upgrade.sendHashPrompt(lang) });
            return;
          }
          try {
            await createUpgradeInvoiceAndShow(ctx, currency);
          } catch (error) {
            logger.error('[UpgradeShop] Retry invoice error:', {
              message: error.message,
              response: error.response?.data,
            });
            await cleanReplyHTML(
              ctx,
              sellerMessages.upgrade.error(ctx.t('upgradeShop.invoiceRetryError')),
              Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')]])
            );
          }
          return;
        }

        if (data === 'upgrade:paid') {
          await ctx.answerCbQuery();
          ctx.wizard.state.awaitingTxHash = true;

          // Remove keyboard from QR message to avoid confusion
          if (ctx.wizard.state.qrMessageId) {
            await ctx.telegram.editMessageReplyMarkup(
              ctx.chat.id,
              ctx.wizard.state.qrMessageId,
              undefined,
              { inline_keyboard: [] }
            ).catch(() => {});
          }

          // Send clean text prompt WITHOUT inline keyboard
          await ctx.reply(sellerMessages.upgrade.sendHashPrompt(lang));
          return;
        }

        await ctx.answerCbQuery();
        return;
      }

      if (!ctx.message?.text) {
        if (ctx.wizard.state.awaitingTxHash) {
          // Send clean text prompt WITHOUT inline keyboard
          await ctx.reply(ctx.t('seller.enterTxHash') + '\n\n' + sellerMessages.upgrade.sendHashPrompt(lang));
        }
        return;
      }

      const txHash = ctx.message.text.trim();
      if (txHash.length < 10) {
        await smartMessage.send(ctx, { text: sellerMessages.upgrade.hashInvalid(lang) });
        return;
      }

      // Validate tx_hash format based on network
      const currentCurrency = ctx.wizard.state.currency;
      const pattern = TX_HASH_PATTERNS[currentCurrency];
      if (pattern && !pattern.test(txHash)) {
        await ctx.reply(t('upgradeShop.invalidTxHashFormat', { currency: currentCurrency }, lang));
        return;
      }

      if (ctx.wizard.state.processingTxHash) return;
      ctx.wizard.state.processingTxHash = true;

      try {
        loadingMsg = await smartMessage.send(ctx, { text: sellerMessages.upgrade.verifying(lang) });

        const token = ctx.session.token;
        const upgradeResponse = await subscriptionApi.confirmUpgradePayment(
          subscriptionId,
          txHash,
          token
        );

        const status = normalizePaymentState(upgradeResponse, upgradeResponse?.state);

        try {
          if (loadingMsg) {
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
          }
        } catch {
          /* ignore delete errors */
        }

        if (status === 'confirmed' || status === 'paid') {
          let endDateLabel = null;
          try {
            const statusInfo = await subscriptionApi.getStatus(shopId, token);
            const updated = statusInfo?.currentSubscription;
            if (updated?.period_end) {
              endDateLabel = new Date(updated.period_end).toLocaleDateString('ru-RU');
            }
          } catch {
            logger.warn('[UpgradeShop] Could not fetch updated subscription status', {
              message: 'fetch status failed',
            });
          }

          // P1-4 FIX: Update shopTier in session after successful upgrade
          ctx.session.shopTier = 'max';

          const successText = endDateLabel
            ? sellerMessages.upgrade.success(endDateLabel)
            : ctx.t('upgradeShop.successNoDate');

          await cleanReplyHTML(
            ctx,
            `${successText}\n\n${sellerMessages.upgrade.benefits(lang)}`,
            Markup.inlineKeyboard([[Markup.button.callback(t('buttons.mainMenu', {}, lang), 'seller:menu')]])
          );

          await ctx.scene.leave();

          const { showSellerMainMenu } = await import('../handlers/seller/index.js');
          await showSellerMainMenu(ctx);
          return;
        }

        await cleanReplyHTML(
          ctx,
          paymentStateMessage(status, { hint: sellerMessages.upgrade.verificationError(lang) }),
          paymentStateKeyboard(status, {
            retryCb: 'upgrade:retry',
            cancelCb: 'seller:menu',
          })
        );

        return;
      } catch (error) {
        logger.error('[UpgradeShop] Payment verification error:', {
          message: error.message,
          response: error.response?.data,
        });

        const status = normalizePaymentState(error.response?.data, 'failed');

        await cleanReplyHTML(
          ctx,
          paymentStateMessage(status, { hint: sellerMessages.upgrade.verificationError(lang) }),
          paymentStateKeyboard(status, {
            retryCb: 'upgrade:retry',
            cancelCb: 'seller:menu',
          })
        );

        return;
      } finally {
        if (loadingMsg) {
          try {
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
          } catch (e) {
            logger.debug('[UpgradeShop] Failed to delete loading message', e.message);
          }
        }
        ctx.wizard.state.processingTxHash = false;
        ctx.wizard.state.awaitingTxHash = false;
      }
    } catch (error) {
      logger.error('[UpgradeShop] Step 4 error:', error);
      try { await ctx.answerCbQuery?.(); } catch { /* ignore */ }
      await ctx.reply(t('general.actionFailed', {}, lang) || 'An error occurred');
      return ctx.scene.leave();
    }
  }
);

// Leave handler
upgradeShopScene.leave(async (ctx) => {
  // P0 FIX: Use assignment instead of delete to prevent TypeError
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  ctx.scene.state = {};

  // P0 FIX: REMOVED delete ctx.session.__scenes
  // Telegraf manages __scenes automatically. Deleting it here can cause
  // race condition when scene.leave() is followed by scene.enter()

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

async function createUpgradeInvoiceAndShow(ctx, currency) {
  const chain = CHAIN_MAPPINGS[currency];
  const { subscriptionId, upgradeCost } = ctx.wizard.state;
  const token = ctx.session.token;

  if (!chain) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  await ctx.editMessageText(ctx.t('general.generatingInvoice'), { parse_mode: 'HTML' }).catch(() => {});

  const invoice = await subscriptionApi.generateUpgradeInvoice(subscriptionId, chain, token);

  ctx.wizard.state.invoiceId = invoice.invoiceId;
  ctx.wizard.state.address = invoice.address;
  ctx.wizard.state.expectedAmount = invoice.expectedAmount;
  ctx.wizard.state.cryptoAmount = invoice.cryptoAmount || invoice.crypto_amount;
  ctx.wizard.state.expiresAt = invoice.expiresAt;

  const qrResponse = await generateQRWithTimeout(
    () =>
      walletApi.generateQR(
        {
          address: invoice.address,
          amount: invoice.crypto_amount || invoice.cryptoAmount || invoice.expectedAmount,
          currency: currency,
        },
        token
      ),
    10000
  );

  const lang = ctx.lang || ctx.session?.language || 'ru';

  if (!qrResponse || !qrResponse.success || !qrResponse.data?.qrCode) {
    throw new Error(t('seller.walletsQrError', {}, lang));
  }

  const base64Data = qrResponse.data.qrCode.replace(/^data:image\/png;base64,/, '');
  const qrCodeBuffer = Buffer.from(base64Data, 'base64');

  const expiresLabel = invoice.expiresAt
    ? new Date(invoice.expiresAt).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU')
    : t('upgradeShop.defaultExpiry', {}, lang);

  const message = `${t('upgradeShop.upgradeToMax', {}, lang)}

${t('upgradeShop.invoiceAmount', { cost: upgradeCost.toFixed(2), cryptoAmount: ctx.wizard.state.cryptoAmount, currency }, lang)}
${t('upgradeShop.invoiceAddress', { address: invoice.address }, lang)}
${t('upgradeShop.invoiceExpires', { expires: expiresLabel }, lang)}

${t('upgradeShop.afterPaymentHint', {}, lang)}`;

  const qrMessage = await ctx.replyWithPhoto(
    { source: qrCodeBuffer },
    {
      caption: message,
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t('upgradeShop.enterTxHash', {}, lang), 'upgrade:paid')],
        [Markup.button.callback(t('buttons.cancel', {}, lang), 'seller:menu')],
      ]),
    }
  );

  // Save QR message ID to remove keyboard later
  ctx.wizard.state.qrMessageId = qrMessage.message_id;
}

export default upgradeShopScene;
