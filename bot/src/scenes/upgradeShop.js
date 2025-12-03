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
import { messages, buttons as buttonText } from '../texts/messages.js';
import { showSellerMainMenu } from '../utils/sellerNavigation.js';
import { generateQRWithTimeout } from '../utils/qrHelper.js';
import {
  normalizePaymentState,
  paymentStateKeyboard,
  paymentStateMessage,
} from '../utils/paymentUi.js';
const { seller: sellerMessages, general: generalMessages } = messages;

// Cancel button for TX Hash input
const cancelButtonHashInput = Markup.inlineKeyboard([
  [Markup.button.callback(buttonText.cancel, 'seller:menu')],
]);

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
      const shopId = ctx.session.shopId;

      if (!shopId) {
        await smartMessage.send(ctx, { text: '❌ Магазин не найден.' });
        return ctx.scene.leave();
      }

      const token = ctx.session.token;
      if (!token) {
        await smartMessage.send(ctx, { text: generalMessages.authorizationRequired });
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
          sellerMessages.upgrade.alreadyMax,
          Markup.inlineKeyboard([[Markup.button.callback(buttonText.backToMenu, 'seller:menu')]])
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
          sellerMessages.upgrade.notEligible,
          Markup.inlineKeyboard([
            [Markup.button.callback(buttonText.paySubscription, 'subscription:pay')],
            [Markup.button.callback(buttonText.backToMenu, 'seller:menu')],
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

      const message = `👑 Улучшить до MAX

Сейчас: PRO
Доплата: $${upgradeCost.toFixed(2)}

Получите:
• Безлимит товаров и фолловов
• До 5 сотрудников (Workspace)
• Миграция канала с подписчиками
• 365 дней аналитики`;

      await cleanReplyHTML(
        ctx,
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback(buttonText.confirm, 'upgrade:confirm')],
          [Markup.button.callback(buttonText.cancel, 'seller:menu')],
        ])
      );

      // Save data for next steps
      ctx.wizard.state.shopId = shopId;
      ctx.wizard.state.subscriptionId = currentSubscription?.id;
      ctx.wizard.state.shopName = ctx.session.shopName || 'Магазин';
      if (!ctx.wizard.state.subscriptionId) {
        await cleanReply(
          ctx,
          sellerMessages.upgrade.error('Не найдена активная подписка для апгрейда.'),
          Markup.inlineKeyboard([[Markup.button.callback(buttonText.backToMenu, 'seller:menu')]])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.upgradeCost = upgradeCost;
      ctx.wizard.state.remainingDays = remainingDays;

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[UpgradeShop] Step 1 error:', error);

      const errorMsg = error.response?.data?.error || error.message;
      await cleanReply(
        ctx,
        sellerMessages.upgrade.error(errorMsg),
        Markup.inlineKeyboard([[Markup.button.callback(buttonText.backToMenu, 'seller:menu')]])
      );

      return ctx.scene.leave();
    }
  },

  // Step 2: Handle confirmation and show crypto options
  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply('Пожалуйста, используйте кнопки для подтверждения.');
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(sellerMessages.upgrade.cancelled);
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    if (data !== 'upgrade:confirm') {
      await ctx.answerCbQuery(generalMessages.invalidChoice);
      return;
    }

    await ctx.answerCbQuery();

    const { upgradeCost } = ctx.wizard.state;

    const message = sellerMessages.upgrade.chooseCrypto(upgradeCost.toFixed(2));

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(buttonText.cryptoBTC, 'upgrade:crypto:BTC')],
        [Markup.button.callback(buttonText.cryptoETH, 'upgrade:crypto:ETH')],
        [Markup.button.callback(buttonText.cryptoUSDT, 'upgrade:crypto:USDT')],
        [Markup.button.callback(buttonText.cryptoLTC, 'upgrade:crypto:LTC')],
        [Markup.button.callback(buttonText.back, 'upgrade:back')],
        [Markup.button.callback(buttonText.cancel, 'seller:menu')],
      ]),
    });

    return ctx.wizard.next();
  },

  // Step 3: Handle crypto selection and generate upgrade invoice
  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply('Пожалуйста, используйте кнопки для выбора криптовалюты.');
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle back
    if (data === 'upgrade:back') {
      await ctx.answerCbQuery();
      return ctx.wizard.back();
    }

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(sellerMessages.upgrade.cancelled);
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    // Parse crypto selection
    if (!data.startsWith('upgrade:crypto:')) {
      await ctx.answerCbQuery(sellerMessages.upgrade.unknownCommand, { show_alert: true });
      return;
    }

    const currency = data.replace('upgrade:crypto:', '');
    if (!['BTC', 'ETH', 'USDT', 'LTC'].includes(currency)) {
      await ctx.answerCbQuery(sellerMessages.upgrade.unknownCommand, { show_alert: true });
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

      const errorMsg = error.response?.data?.error || error.message || 'Не удалось создать инвойс';

      await ctx.editMessageText(sellerMessages.upgrade.error(errorMsg), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(buttonText.back, 'upgrade:back')],
          [Markup.button.callback(buttonText.cancel, 'seller:menu')],
        ]),
      });

      return;
    }
  },

  // Step 4: Handle tx_hash and verify upgrade payment
  async (ctx) => {
    const { subscriptionId, currency, shopId } = ctx.wizard.state;

    if (!subscriptionId) {
      await smartMessage.send(ctx, { text: sellerMessages.upgrade.error('Нет подписки для апгрейда') });
      return ctx.scene.leave();
    }

    if (ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;

      if (data === 'seller:menu') {
        await ctx.answerCbQuery(sellerMessages.upgrade.cancelled);
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
            paymentStateMessage(status, { hint: sellerMessages.upgrade.sendHashPrompt }),
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
            sellerMessages.upgrade.error('Не удалось проверить статус. Попробуйте позже.'),
            Markup.inlineKeyboard([[Markup.button.callback(buttonText.cancel, 'seller:menu')]])
          );
        }
        return;
      }

      if (data === 'upgrade:retry') {
        await ctx.answerCbQuery();
        if (!currency) {
          await smartMessage.send(ctx, { text: sellerMessages.upgrade.sendHashPrompt });
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
            sellerMessages.upgrade.error('Не удалось создать новый счёт.'),
            Markup.inlineKeyboard([[Markup.button.callback(buttonText.cancel, 'seller:menu')]])
          );
        }
        return;
      }

      if (data === 'upgrade:paid') {
        await ctx.answerCbQuery();
        ctx.wizard.state.awaitingTxHash = true;
        await smartMessage.send(ctx, { text: sellerMessages.upgrade.sendHashPrompt, keyboard: cancelButtonHashInput });
        return;
      }

      await ctx.answerCbQuery();
      return;
    }

    if (!ctx.message?.text) {
      if (ctx.wizard.state.awaitingTxHash) {
        await smartMessage.send(ctx, {
          text: 'Пожалуйста, отправьте TX Hash текстом.\n\n' + sellerMessages.upgrade.sendHashPrompt,
          keyboard: cancelButtonHashInput,
        });
      }
      return;
    }

    const txHash = ctx.message.text.trim();
    if (txHash.length < 10) {
      await smartMessage.send(ctx, { text: sellerMessages.upgrade.hashInvalid });
      return;
    }

    if (ctx.wizard.state.processingTxHash) return;
    ctx.wizard.state.processingTxHash = true;

    let loadingMsg = null;
    try {
      loadingMsg = await smartMessage.send(ctx, { text: sellerMessages.upgrade.verifying });

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
          : '✅ Апгрейд на MAX подтверждён.';

        await cleanReplyHTML(
          ctx,
          `${successText}\n\n${sellerMessages.upgrade.benefits}`,
          Markup.inlineKeyboard([[Markup.button.callback(buttonText.mainMenu, 'seller:menu')]])
        );

        await ctx.scene.leave();

        const { showSellerMainMenu } = await import('../handlers/seller/index.js');
        await showSellerMainMenu(ctx);
        return;
      }

      await cleanReplyHTML(
        ctx,
        paymentStateMessage(status, { hint: sellerMessages.upgrade.verificationError }),
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
        paymentStateMessage(status, { hint: sellerMessages.upgrade.verificationError }),
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
  }
);

// Leave handler
upgradeShopScene.leave(async (ctx) => {
  ctx.wizard.state = {};

  // Очистить __scenes из Redis сессии для предотвращения застревания
  if (ctx.session && ctx.session.__scenes) {
    delete ctx.session.__scenes;
  }

  logger.info('[UpgradeShop] Scene left');
});

async function createUpgradeInvoiceAndShow(ctx, currency) {
  const chain = CHAIN_MAPPINGS[currency];
  const { subscriptionId, upgradeCost } = ctx.wizard.state;
  const token = ctx.session.token;

  if (!chain) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  await ctx.editMessageText('⏳ Генерируем счёт...', { parse_mode: 'HTML' }).catch(() => {});

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

  if (!qrResponse || !qrResponse.success || !qrResponse.data?.qrCode) {
    throw new Error('Не удалось сформировать QR код для оплаты');
  }

  const base64Data = qrResponse.data.qrCode.replace(/^data:image\/png;base64,/, '');
  const qrCodeBuffer = Buffer.from(base64Data, 'base64');

  const expiresLabel = invoice.expiresAt
    ? new Date(invoice.expiresAt).toLocaleString('ru-RU')
    : '30 минут';

  const message = `👑 Апгрейд до MAX

Сумма: $${upgradeCost.toFixed(2)} (~${ctx.wizard.state.cryptoAmount} ${currency})
Адрес: ${invoice.address}
Счёт действует до: ${expiresLabel}

После отправки нажмите «Ввести TX Hash» или «Проверить статус».`;

  await ctx.replyWithPhoto(
    { source: qrCodeBuffer },
    {
      caption: message,
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔗 Ввести TX Hash', 'upgrade:paid')],
        [Markup.button.callback('🔄 Проверить статус', 'upgrade:status')],
        [Markup.button.callback(buttonText.cancel, 'seller:menu')],
      ]),
    }
  );
}

export default upgradeShopScene;
